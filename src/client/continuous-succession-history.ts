import type { QueryClient, QueryFunction, SkipToken } from '@tanstack/react-query';
import { skipToken } from '@tanstack/react-query';
import type { Observation2 } from '../shared/succession';
import { buildSuccessionStory } from './succession-story';
import type { StoryModel } from './succession-story';
import {
  HistoryReset,
  historyAnchorOptions,
  matchReadKey,
  matchReadScope,
  roundIndexOptions,
} from './succession-replay-data';
import { STORY_WINDOW_EVENTS, STORY_WINDOW_SHIFT, storyWindowOptions } from './succession-story-data';
import { ApiError } from './api';

export interface StoryReadingAnchor {
  eventKey: string;
  cursor: number;
  offset: number;
  /** Focus takes precedence over eviction; the container updates this on focus/scroll. */
  focused?: boolean;
}

export interface ContinuousStoryOptions {
  act?: 1 | 2;
  initial?: 'start' | 'latest';
}

export interface ContinuousStorySnapshot {
  model: StoryModel;
  rows: StoryModel['rows'];
  status: 'idle' | 'loading' | 'ready' | 'error' | 'reset';
  error: string;
  following: boolean;
  newEvents: number;
  hasEarlier: boolean;
  hasLater: boolean;
  after: number;
  delivered: number;
  head: number;
  version: number;
  enabled: boolean;
}

let serial = 0;

/** One reader lifetime, one bounded replacement at a time, no ownership of current or commands. */
export class ContinuousSuccessionHistory {
  private readonly scope;
  private readonly key;
  private readonly listeners = new Set<() => void>();
  private snapshot: ContinuousStorySnapshot;
  private current: Observation2;
  private ticket = 0;
  private running = false;
  private initialized = false;
  private active = false;
  private interrupted = false;
  private lower = 0;
  private upper = 0;
  private landmarkAct = 0;
  private acknowledgedHead: number;
  private anchor: StoryReadingAnchor | null = null;
  private intent = 'initial';

  constructor(
    private readonly client: QueryClient,
    current: Observation2,
    private readonly options: ContinuousStoryOptions = {},
    private readonly onReset: () => void = () => {},
  ) {
    this.current = current;
    this.scope = matchReadScope(current);
    this.key = [...matchReadKey(this.scope), 'continuous-story-reader', ++serial] as const;
    this.acknowledgedHead = current.history.streamHead;

    const model = buildSuccessionStory({
      scope: { matchId: current.matchId, visibilityEpoch: this.scope.epoch },
      after: 0,
      through: 0,
      events: [],
      current,
    });

    this.snapshot = {
      model,
      rows: model.rows,
      status: 'idle',
      error: '',
      following: options.initial === 'latest',
      newEvents: 0,
      hasEarlier: false,
      hasLater: false,
      after: 0,
      delivered: 0,
      head: current.history.streamHead,
      version: 0,
      enabled: false,
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;
  getAnchor = () => this.anchor;
  rememberAnchor = (anchor: StoryReadingAnchor | null) => {
    this.anchor = anchor;
  };

  private publish(change: Partial<ContinuousStorySnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };

    for (const listener of this.listeners) listener();
  }

  private availability() {
    this.upper =
      this.options.act === 1 && this.current.act === 2 && this.landmarkAct === 2
        ? this.upper
        : this.current.history.streamHead;
    this.publish({
      head: this.upper,
      newEvents: Math.max(0, this.upper - this.acknowledgedHead),
      hasEarlier: this.snapshot.after > this.lower,
      hasLater: this.snapshot.delivered < this.upper,
    });
  }

  observe(current: Observation2) {
    if (this.snapshot.status === 'reset' && current !== this.current) {
      this.initialized = false;
      this.intent = this.anchor ? `key:${this.anchor.eventKey}` : 'initial';
      this.publish({ status: 'idle', error: '' });
    }

    this.current = current;
    this.availability();

    if (
      this.active &&
      !this.running &&
      (this.snapshot.following || !this.initialized || (this.options.act && this.landmarkAct !== current.act))
    )
      void this.read(this.initialized ? 'later' : this.intent);
  }

  setEnabled(enabled: boolean) {
    this.active = enabled;
    this.publish({ enabled });

    if (!enabled) {
      this.interrupted ||= this.running;
      this.ticket++;
      this.running = false;
      void this.client.cancelQueries({ queryKey: this.key });
      this.client.removeQueries({ queryKey: this.key });

      if (this.snapshot.status !== 'reset') this.publish({ status: this.initialized ? 'ready' : 'idle' });
    } else if (this.interrupted) {
      this.interrupted = false;
      void this.read(this.intent);
    } else if (!this.initialized || this.snapshot.following)
      void this.read(this.initialized ? 'later' : this.intent);
  }

  dispose() {
    this.setEnabled(false);
    this.listeners.clear();
  }

  detach = () => {
    this.publish({ following: false });
  };
  loadEarlier = () => {
    this.detach();

    return this.read('earlier');
  };
  loadLater = () => this.read('later');
  follow = () => {
    this.anchor = null;
    this.publish({ following: true });

    return this.read('follow');
  };
  seek = (eventKey: string) => {
    this.detach();
    this.intent = `key:${eventKey}`;
    this.interrupted = !this.active;

    if (this.running) {
      this.ticket++;
      this.running = false;
      void this.client.cancelQueries({ queryKey: this.key });
      this.client.removeQueries({ queryKey: this.key });
    }

    return this.read(this.intent);
  };
  restoreAnchor(anchor: StoryReadingAnchor) {
    this.anchor = anchor;
    this.intent = `key:${anchor.eventKey}`;
    this.detach();
  }
  retry = () => (this.snapshot.status === 'reset' ? this.onReset() : this.read(this.intent));

  private fetch<T, Key extends readonly unknown[]>(
    options: { queryKey: Key; queryFn?: QueryFunction<T, Key> | SkipToken },
    key: readonly unknown[],
  ) {
    const fn = options.queryFn;

    if (!fn || fn === skipToken) throw new Error('A selected story read requires a query function.');

    return this.client.fetchQuery({
      queryKey: key,
      queryFn: (context) => fn({ ...context, queryKey: options.queryKey }),
      staleTime: Infinity,
      gcTime: 0,
      retry: false,
    });
  }

  private async read(intent: string): Promise<void> {
    if (!this.active || this.running || this.snapshot.status === 'reset') return;

    if (
      this.initialized &&
      intent === 'later' &&
      this.snapshot.delivered >= this.upper &&
      this.landmarkAct === this.current.act
    )
      return;

    if (this.initialized && intent === 'earlier' && this.snapshot.after <= this.lower) return;
    this.running = true;
    this.intent = intent;
    const ticket = ++this.ticket;
    const valid = () => ticket === this.ticket && this.active;
    const ownedKey = [...this.key, ticket];
    this.publish({ status: 'loading', error: '' });

    try {
      if (this.options.act && this.landmarkAct !== this.current.act) {
        const options = roundIndexOptions(this.scope);
        const index = await this.fetch(options, [...ownedKey, 'landmarks']);

        if (!valid()) return;
        const first = index.rounds.find((round) => round.act === this.options.act);
        const next = index.rounds.find((round) => round.act > this.options.act!);
        this.lower =
          this.options.act === 1
            ? 0
            : first
              ? Math.max(0, first.through - 1)
              : this.current.history.streamHead;
        this.upper = next ? next.through - 1 : this.current.history.streamHead;
        this.landmarkAct = this.current.act;
        this.client.removeQueries({ queryKey: [...ownedKey, 'landmarks'] });
      } else this.availability();
      const upper = this.upper; // Freeze each selected operation even while current head grows.
      let after = this.snapshot.after;

      if (intent.startsWith('key:')) {
        const options = historyAnchorOptions(this.scope, intent.slice(4));
        const result = await this.fetch(options, [...ownedKey, 'anchor']);

        if (!valid()) return;

        if (result.cursor === null)
          throw new Error('This reading anchor is not available in the authorized record.');

        if (result.cursor <= this.lower || result.cursor > upper)
          throw new Error('This reading anchor is outside the selected act.');
        after = result.cursor - STORY_WINDOW_SHIFT;
        this.anchor =
          this.anchor?.eventKey === intent.slice(4)
            ? { ...this.anchor, cursor: result.cursor }
            : { eventKey: intent.slice(4), cursor: result.cursor, offset: 0 };
        this.client.removeQueries({ queryKey: [...ownedKey, 'anchor'] });
      } else if (!this.initialized)
        after = this.options.initial === 'latest' ? upper - STORY_WINDOW_EVENTS : this.lower;
      else if (intent === 'follow') after = upper - STORY_WINDOW_EVENTS;
      else if (intent === 'earlier') after -= STORY_WINDOW_SHIFT;
      else after = Math.min(after + STORY_WINDOW_SHIFT, upper - STORY_WINDOW_EVENTS);
      after = Math.max(this.lower, Math.min(after, Math.max(this.lower, upper - STORY_WINDOW_EVENTS)));

      if (
        this.anchor?.focused &&
        !this.snapshot.following &&
        this.initialized &&
        !intent.startsWith('key:') &&
        intent !== 'follow'
      )
        after = Math.max(
          this.lower,
          Math.min(this.anchor.cursor - 1, Math.max(after, this.anchor.cursor - STORY_WINDOW_EVENTS)),
        );
      const through = Math.min(upper, after + STORY_WINDOW_EVENTS);

      if (this.initialized && after === this.snapshot.after && through === this.snapshot.delivered) {
        this.publish({ status: 'ready' });

        return;
      }

      const options = storyWindowOptions(this.scope, after, through);
      const requestedAnchor = this.anchor?.eventKey;
      const window = await this.fetch(options, [...ownedKey, 'window', after, through]);

      if (!valid()) return;

      // A reader can move to the opposite edge while the replacement is in flight.
      // Do not retire the now-visible anchor in order to deliver an obsolete scroll request.
      if (
        !this.snapshot.following &&
        this.initialized &&
        this.anchor &&
        (this.anchor.focused || this.anchor.eventKey !== requestedAnchor) &&
        !intent.startsWith('key:') &&
        (this.anchor.cursor <= after || this.anchor.cursor > through)
      ) {
        this.publish({ status: 'ready', version: this.snapshot.version + 1 });

        return;
      }

      const model = buildSuccessionStory({ ...window, current: this.current });
      this.acknowledgedHead = Math.max(this.acknowledgedHead, model.delivered);
      this.initialized = true;
      this.publish({
        model,
        rows: model.rows,
        status: 'ready',
        after,
        delivered: model.delivered,
        version: this.snapshot.version + 1,
      });
      this.availability();
    } catch (error) {
      if (!valid()) return;

      if (error instanceof HistoryReset || (error instanceof ApiError && [401, 403].includes(error.status))) {
        const model = buildSuccessionStory({
          scope: { matchId: this.scope.matchId, visibilityEpoch: this.scope.epoch },
          after: 0,
          through: 0,
          events: [],
        });

        this.publish({
          model,
          rows: [],
          after: 0,
          delivered: 0,
          status: 'reset',
          error: error.message,
          version: this.snapshot.version + 1,
        });
        this.onReset();
      } else
        this.publish({
          status: 'error',
          error: error instanceof Error ? error.message : 'The record could not be loaded.',
        });
    } finally {
      this.client.removeQueries({ queryKey: ownedKey });

      if (valid()) {
        this.running = false;

        if (
          this.snapshot.status === 'ready' &&
          this.snapshot.following &&
          this.snapshot.delivered < this.upper
        )
          void this.read('follow');
      }
    }
  }
}
