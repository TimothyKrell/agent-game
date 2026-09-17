import { Schema } from 'effect';
import { ChatAddressSchema } from '../shared/chat';
import { AuditFact2Schema } from '../shared/succession';
import type { AuthorizedEvent2 } from '../shared/succession';
import type { StoryFact } from './succession-story-types';

const Integer = Schema.Number.check(Schema.makeFilter((n) => Number.isSafeInteger(n) && n >= 0));

const Seat = Integer.check(Schema.isBetween({ minimum: 0, maximum: 9 }));

const Capability = Schema.Literals(['treasurer', 'thief', 'assassin', 'envoy', 'guard']);

const Role = Schema.Literals(['cooperative', 'rogue', 'overlord']);

const Team = Schema.Literals(['cooperative', 'rogue']);

const Policy = Schema.Struct({ id: Schema.String, policy: Schema.Literals(['safeguard', 'override']) });

const Policies = Schema.Array(Policy);

const Cards = Schema.Struct({
  cards: Schema.Array(Schema.Struct({ id: Schema.String, capability: Capability })),
});

const Target = Schema.Struct({ target: Seat });

const Claim = Schema.Struct({ capability: Capability });

const Result = Schema.Struct({ team: Team, reason: Schema.String });

const Vote = Schema.Struct({ approve: Schema.Boolean });

const Veto = Schema.Struct({ approved: Schema.Boolean });

const Coins = Schema.Struct({ coins: Integer });

const Tracker = Schema.Struct({ tracker: Integer });

const Lost = Schema.Struct({ capability: Capability, eliminated: Schema.Boolean });

const Turn = Schema.Struct({ round: Integer, slot: Seat });

const Takeover = Schema.Struct({
  agentId: Schema.String,
  generation: Schema.optional(Integer),
  recoverable: Schema.optional(Schema.Boolean),
  recoveryCount: Schema.optional(Integer),
  recoveryLimit: Schema.optional(Integer),
});

const SecretRole = Schema.Struct({ role: Role });

const Knowledge = Schema.Struct({ rogues: Schema.Array(Seat), overlord: Seat });

const Reaction = Schema.Struct({ choice: Schema.Literals(['challenge', 'pass']) });

const Investigation = Schema.Struct({ target: Seat, team: Team });

const Election = Schema.Struct({
  approved: Schema.Boolean,
  votes: Schema.Record(Schema.String, Schema.Boolean),
  coordinator: Seat,
  executor: Seat,
});

const Enacted = Schema.Struct({
  policy: Schema.Literals(['safeguard', 'override']),
  chaos: Schema.Boolean,
  safeguards: Integer,
  overrides: Integer,
});

const Start = Schema.Struct({
  team: Team,
  reason: Schema.String,
  roles: Schema.Array(Role).check(Schema.makeFilter((values) => values.length === 10)),
  bonuses: Schema.Array(Schema.Literals([0, 1])).check(Schema.makeFilter((values) => values.length === 10)),
  returnedSeats: Schema.Array(Seat),
  firstSeat: Seat,
});

const Declaration = Schema.Struct({
  actor: Seat,
  action: Schema.Union([
    Schema.Struct({ type: Schema.Literals(['income', 'tax', 'exchange']) }),
    Schema.Struct({ type: Schema.Literals(['steal', 'assassinate', 'coup']), target: Seat }),
  ]),
  claim: Schema.NullOr(Capability),
  payment: Integer,
});

const Challenge = Schema.Struct({
  claimant: Seat,
  capability: Capability,
  block: Schema.Boolean,
  responses: Schema.Record(Schema.String, Schema.Literals(['challenge', 'pass'])),
  challenger: Schema.NullOr(Seat),
  outcome: Schema.Literals(['unchallenged', 'proved', 'disproved']),
});

const Finished = Schema.Struct({
  winner: Seat,
  capEvidence: Schema.NullOr(
    Schema.Struct({
      scores: Schema.mutable(
        Schema.Array(Schema.Struct({ seat: Seat, influence: Integer, coins: Integer, priority: Seat })),
      ),
      decisive: Schema.Literals(['influence', 'coins', 'priority']),
    }),
  ),
});

const Phase = Schema.Struct({
  phase: Schema.String,
  activeSeat: Schema.optional(Seat),
  coordinator: Schema.optional(Seat),
  executor: Schema.optional(Schema.NullOr(Seat)),
  slot: Schema.optional(Seat),
});

const Draw = Schema.Struct({ cards: Policies });

const Discard = Schema.Struct({ discarded: Policy, passed: Policies });

const ExecutorDiscard = Schema.Struct({ enacted: Policy, discarded: Policies });

/** AuthorizedEvent2 deliberately has extensible JSON payloads. Decode, never parse source prose. */
export function readStoryFact(event: AuthorizedEvent2): StoryFact {
  const data = event.data;

  switch (event.type) {
    case 'chat':
      return Schema.is(ChatAddressSchema)(data)
        ? { kind: 'speech', ...Schema.decodeUnknownSync(ChatAddressSchema)(data) }
        : { kind: 'speech' };
    case 'nomination':
    case 'investigation':
    case 'execution':
    case 'special-election':
      if (Schema.is(Target)(data)) return { kind: event.type, target: data.target };
      break;
    case 'ballot':
      if (Schema.is(Vote)(data)) return { kind: 'ballot', approve: data.approve };
      break;
    case 'election':
      if (Schema.is(Election)(data)) return { kind: 'election', ...Schema.decodeUnknownSync(Election)(data) };
      break;
    case 'policy':
      if (Schema.is(Enacted)(data)) return { kind: 'policy', ...Schema.decodeUnknownSync(Enacted)(data) };
      break;
    case 'election-tracker':
      if (Schema.is(Tracker)(data)) return { kind: 'tracker', tracker: data.tracker };
      break;
    case 'investigation-result':
      if (Schema.is(Investigation)(data))
        return { kind: 'investigation-result', ...Schema.decodeUnknownSync(Investigation)(data) };
      break;
    case 'veto-request':
    case 'cleared-executor':
      return { kind: event.type };
    case 'veto-response':
      if (Schema.is(Veto)(data)) return { kind: 'veto-response', approved: data.approved };
      break;
    case 'act-ended':
      if (Schema.is(Result)(data)) return { kind: 'act-ended', ...Schema.decodeUnknownSync(Result)(data) };
      break;
    case 'act-started':
      if (Schema.is(Start)(data)) return { kind: 'act-started', ...Schema.decodeUnknownSync(Start)(data) };
      break;
    case 'declaration':
      if (Schema.is(Declaration)(data))
        return { kind: 'declaration', ...Schema.decodeUnknownSync(Declaration)(data) };
      break;
    case 'challenge-resolved':
      if (Schema.is(Challenge)(data))
        return { kind: 'challenge-resolved', ...Schema.decodeUnknownSync(Challenge)(data) };
      break;
    case 'proof':
    case 'block':
      if (Schema.is(Claim)(data)) return { kind: event.type, capability: data.capability };
      break;
    case 'influence-lost':
      if (Schema.is(Lost)(data)) return { kind: 'influence-lost', ...Schema.decodeUnknownSync(Lost)(data) };
      break;
    case 'coins':
      if (Schema.is(Coins)(data)) return { kind: 'coins', coins: data.coins };
      break;
    case 'exchange-completed':
      return { kind: 'exchange-completed' };
    case 'turn-ended':
      if (Schema.is(Turn)(data)) return { kind: 'turn-ended', round: data.round, slot: data.slot };
      break;
    case 'finished':
      if (Schema.is(Finished)(data)) return { kind: 'finished', ...Schema.decodeUnknownSync(Finished)(data) };
      break;
    case 'takeover':
    case 'reclaimed':
      if (Schema.is(Takeover)(data)) return { kind: event.type, ...Schema.decodeUnknownSync(Takeover)(data) };
      break;
    case 'interrupted':
      return { kind: 'interrupted' };
    case 'phase':
      if (Schema.is(Phase)(data)) return { kind: 'phase', ...Schema.decodeUnknownSync(Phase)(data) };
      break;
    case 'capability-deal':
    case 'hand-updated':
    case 'exchange-draw':
      if (Schema.is(Cards)(data)) return { kind: 'private-cards', operation: event.type, cards: data.cards };
      break;
    case 'draw':
    case 'received-policies':
      if (Schema.is(Draw)(data))
        return { kind: 'private-policies', operation: event.type, cards: data.cards, discarded: [] };
      break;
    case 'discard':
      if (Schema.is(Discard)(data))
        return {
          kind: 'private-policies',
          operation: event.type,
          cards: data.passed,
          discarded: [data.discarded],
        };
      break;
    case 'executor-discard':
      if (Schema.is(ExecutorDiscard)(data))
        return {
          kind: 'private-policies',
          operation: event.type,
          cards: [data.enacted],
          discarded: data.discarded,
        };
      break;
    case 'role':
      if (Schema.is(SecretRole)(data)) return { kind: 'role', role: data.role };
      break;
    case 'rogue-knowledge':
      if (Schema.is(Knowledge)(data))
        return { kind: 'rogue-knowledge', ...Schema.decodeUnknownSync(Knowledge)(data) };
      break;
    case 'reaction':
      if (Schema.is(Reaction)(data)) return { kind: 'reaction', choice: data.choice };
      break;
    case 'audit':
      if (Schema.is(AuditFact2Schema)(data)) return { kind: 'audit', data };
      break;
    case 'started':
    case 'commitment':
    case 'grace':
    case 'recovered':
    case 'reshuffle':
      return { kind: 'system', type: event.type };
    default:
      return { kind: 'unavailable', type: event.type, reason: 'unsupported-event' };
  }

  return { kind: 'unavailable', type: event.type, reason: 'incomplete-payload' };
}
