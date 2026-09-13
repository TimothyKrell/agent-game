import { Option, Schema } from 'effect';
import { PhaseKindSchema } from '../shared/api';
import type { Observation } from './types';

const SeatNumber = Schema.Literals([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

const PolicyCard = Schema.Struct({ id: Schema.String, policy: Schema.Literals(['safeguard', 'override']) });

const ReplayEventData = Schema.Struct({
  coordinator: Schema.optional(SeatNumber),
  executor: Schema.optional(Schema.NullOr(SeatNumber)),
  phase: Schema.optional(PhaseKindSchema),
  target: Schema.optional(SeatNumber),
  votes: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
  approved: Schema.optional(Schema.Boolean),
  tracker: Schema.optional(Schema.Number),
  cards: Schema.optional(Schema.Array(PolicyCard)),
  discarded: Schema.optional(Schema.Union([PolicyCard, Schema.Array(PolicyCard)])),
  policy: Schema.optional(Schema.Literals(['safeguard', 'override'])),
  chaos: Schema.optional(Schema.Boolean),
});

type ReplayFrame = Omit<Observation, 'phase' | 'coordinator'> & {
  phase: Observation['phase'] | null;
  coordinator: number | null;
};

/** Rebuild the table at a replay cursor; final role disclosures stay visible throughout. */
export function replayFrame(record: Observation, through: number | null): ReplayFrame {
  if (through === null || record.status === 'active') return record;
  const view: ReplayFrame = { ...structuredClone(record), phase: null, coordinator: null };
  view.events = record.events.slice(0, through);
  view.round = 1;
  view.executor = null;
  view.lastGovernment = null;
  view.tracks = {
    safeguards: 0,
    overrides: 0,
    electionTracker: 0,
    drawCount: 17,
    discardCount: 0,
    vetoUnlocked: false,
  };

  for (const seat of view.seats) {
    seat.alive = true;
    seat.forfeited = false;
    seat.house = seat.originalHouse;
    delete seat.vote;
  }

  let hand = 0;

  for (const event of view.events) {
    view.round = event.round;
    const data = Option.getOrNull(Schema.decodeUnknownOption(ReplayEventData)(event.data ?? {}));

    if (!data) continue;

    if (event.type === 'phase') {
      if (data.coordinator !== undefined) view.coordinator = data.coordinator;

      if (data.executor !== undefined) view.executor = data.executor;

      if (data.phase !== undefined)
        view.phase = { id: `replay-${event.id}`, kind: data.phase, deadline: null, graceUntil: null };
    }

    if (event.type === 'nomination' && data.target !== undefined) {
      view.coordinator = event.seat ?? view.coordinator;
      view.executor = data.target;

      for (const seat of view.seats) delete seat.vote;
    }

    if (event.type === 'election' && data.votes) {
      for (const seat of view.seats) {
        const vote = data.votes[String(seat.number)];

        if (vote !== undefined) seat.vote = vote;
      }

      if (data.approved && data.coordinator !== undefined && data.executor != null)
        view.lastGovernment = { coordinator: data.coordinator, executor: data.executor };
    }

    if (event.type === 'election-tracker' && data.tracker !== undefined)
      view.tracks.electionTracker = data.tracker;

    if (event.type === 'draw' && data.cards) {
      hand = data.cards.length;
      view.tracks.drawCount -= hand;
    }

    if (event.type === 'discard') {
      hand--;
      view.tracks.discardCount++;
    }

    if (event.type === 'executor-discard' && Array.isArray(data.discarded)) {
      view.tracks.discardCount += data.discarded.length;
      hand = 0;
    }

    if (event.type === 'veto-response' && data.approved === true) {
      view.tracks.discardCount += hand;
      hand = 0;
    }

    if (event.type === 'reshuffle') {
      view.tracks.drawCount += view.tracks.discardCount;
      view.tracks.discardCount = 0;
    }

    if (event.type === 'policy') {
      if (data.policy === 'safeguard') view.tracks.safeguards++;
      else if (data.policy === 'override') view.tracks.overrides++;
      view.tracks.electionTracker = 0;

      if (data.chaos) {
        view.tracks.drawCount--;
        view.lastGovernment = null;
      }
    }

    if (event.type === 'execution' && data.target !== undefined) view.seats[data.target].alive = false;

    if (event.type === 'takeover' && event.seat !== undefined) {
      view.seats[event.seat].forfeited = true;
      view.seats[event.seat].house = true;
    }
  }

  view.tracks.vetoUnlocked = view.tracks.overrides >= 5;

  return view;
}
