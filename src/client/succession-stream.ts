import type { AuthorizedEvent2, HistoryMetadata2, HistoryPage2, Observation2 } from '../shared/succession';

/** Local transport fences are deliberately not server mutation counters. */
export class SuccessionCurrent {
  value: Observation2 | null = null;
  private revision = 0;
  private retiredEpochs = new Set<string>();

  ticket() {
    return this.revision;
  }

  accept(next: Observation2, ticket = this.revision): boolean {
    if (ticket !== this.revision || this.retiredEpochs.has(next.history.visibilityEpoch)) return false;
    const old = this.value;

    if (old) {
      if (old.matchId !== next.matchId || old.you?.agentId !== next.you?.agentId) return false;

      if (old.status !== 'active' && next.status !== old.status) return false;

      if (old.act > next.act) return false;

      if (
        old.history.visibilityEpoch === next.history.visibilityEpoch &&
        old.history.streamHead > next.history.streamHead
      )
        return false;

      if (
        old.seats.some((seat) => {
          const incoming = next.seats.find((candidate) => candidate.number === seat.number);

          return (
            !incoming || incoming.generation < seat.generation || (seat.forfeited && !incoming.forfeited)
          );
        })
      )
        return false;

      if (
        old.you &&
        next.you &&
        (old.you.generation > next.you.generation || (old.you.forfeited && !next.you.forfeited))
      )
        return false;

      if (old.history.visibilityEpoch !== next.history.visibilityEpoch)
        this.retiredEpochs.add(old.history.visibilityEpoch);
    }

    this.value = next;
    this.revision++;

    return true;
  }
}

export interface HistoryWalk2 {
  epoch: string;
  after: number;
  through: number;
}

/** One bounded cache per reader. Replay owns a different instance and cursor. */
export class SuccessionHistory {
  epoch = '';
  head = 0;
  cursor = 0;
  through = 0;
  events: AuthorizedEvent2[] = [];
  readonly maxCachedEvents = 256;

  observe(metadata: HistoryMetadata2) {
    if (metadata.visibilityEpoch !== this.epoch) {
      this.epoch = metadata.visibilityEpoch;
      this.head = metadata.streamHead;
      this.cursor = 0;
      this.through = 0;
      this.events = [];
    } else this.head = Math.max(this.head, metadata.streamHead);
  }

  request(): HistoryWalk2 | null {
    if (this.cursor >= this.through) this.through = this.head;

    return this.cursor < this.through
      ? { epoch: this.epoch, after: this.cursor, through: this.through }
      : null;
  }

  seek(after: number, through: number) {
    if (
      !Number.isSafeInteger(after) ||
      !Number.isSafeInteger(through) ||
      after < 0 ||
      through < after ||
      through > this.head
    )
      return false;
    this.cursor = after;
    this.through = through;
    this.events = [];

    return true;
  }

  accept(page: HistoryPage2, request: HistoryWalk2): boolean {
    if (
      page.reset ||
      this.epoch !== request.epoch ||
      page.visibilityEpoch !== this.epoch ||
      this.cursor !== request.after ||
      page.after !== request.after ||
      page.through !== request.through
    )
      return false;

    if (page.cursor < page.after || page.cursor > page.through || page.hasMore !== page.cursor < page.through)
      return false;

    if (page.events.some((event, index) => event.id !== page.after + index + 1)) return false;

    if (page.cursor !== (page.events.at(-1)?.id ?? page.after)) return false;

    if (page.hasMore && page.cursor === page.after) return false;
    this.cursor = page.cursor;
    this.head = Math.max(this.head, page.streamHead);
    this.events = [...this.events, ...page.events].slice(-this.maxCachedEvents);

    return true;
  }
}

export function historyPath(matchId: string, walk: HistoryWalk2) {
  const query = new URLSearchParams({
    epoch: walk.epoch,
    after: String(walk.after),
    through: String(walk.through),
    limit: '32',
    maxBytes: '16384',
  });

  return `/api/matches/${encodeURIComponent(matchId)}/history?${query}`;
}
