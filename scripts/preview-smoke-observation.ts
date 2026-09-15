import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { boundedResponse } from './preview-github.ts';

/** Only semantic checks over decoded observations can create retirement evidence.
 * Parse/schema/transport/setup errors never acquire this classification. */
export class PreviewSmokeInvalid extends Error {}

export function observeSmoke<A, I>(
  schema: Schema.Codec<A, I>,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This is the smoke observation decoding boundary, before any semantic check.
  input: unknown,
  verify: (value: A) => void = () => {},
) {
  // Preserve extra fields for actual-byte bounds and forbidden-field checks.
  const value = Schema.decodeUnknownSync(schema)(input, { onExcessProperty: 'preserve' });

  try {
    verify(value);
  } catch (error) {
    if (error instanceof assert.AssertionError)
      throw new PreviewSmokeInvalid(error.message, { cause: error });
    throw error;
  }

  return value;
}

export function smokeJson<A, I>(schema: Schema.Codec<A, I>, text: string, verify?: (value: A) => void) {
  return observeSmoke(schema, JSON.parse(Schema.decodeUnknownSync(Schema.String)(text)), verify);
}

export async function smokeResponse<A, I>(
  response: Response,
  status: number,
  schema: Schema.Codec<A, I>,
  verify?: (value: A) => void,
) {
  if (response.status >= 500 || response.status === 429)
    throw new Error('Preview smoke readback unavailable');
  const bytes = await boundedResponse(response, 1024 * 1024);

  // Unexpected HTTP statuses are unavailable; route-specific typed data checks
  // below establish affirmative failures, not generic HTTP/JSON assertions.
  if (response.status !== status) throw new Error('Unexpected preview smoke HTTP status');

  return smokeJson(schema, new TextDecoder('utf-8', { fatal: true }).decode(bytes), verify);
}

// These Node-safe projections validate every field consumed by smoke checks.
// Domain values remain broad where a well-typed negative is meaningful (e.g.
// ok:false, protocolVersion:"2", mode:"ranked"). Missing/ill-typed data is unknown.
const PolicyCard = Schema.Struct({ id: Schema.String, policy: Schema.String });

const InfluenceCard = Schema.Struct({ id: Schema.String, capability: Schema.String });

const PolicyZones = {
  deck: Schema.Array(PolicyCard),
  discards: Schema.Array(PolicyCard),
  hand: Schema.Array(PolicyCard),
};

const PrivatePolicy = {
  role: Schema.String,
  knownRogues: Schema.Array(Schema.Int),
  knownOverlord: Schema.NullOr(Schema.Int),
  hand: Schema.Array(PolicyCard),
};

const Seat = Schema.Struct({ forfeited: Schema.Boolean, role: Schema.optional(Schema.String) });

const Common = {
  protocolVersion: Schema.String,
  matchId: Schema.String,
  mode: Schema.String,
  status: Schema.Literals(['active', 'finished', 'interrupted']),
  you: Schema.NullOr(
    Schema.Struct({
      seat: Schema.Int,
      agentId: Schema.String,
      alive: Schema.Boolean,
      forfeited: Schema.Boolean,
      generation: Schema.Int,
    }),
  ),
  seats: Schema.Array(Seat),
};

export const SmokeHealth = Schema.Struct({ ok: Schema.Boolean, protocolVersion: Schema.String });

export const SmokeIsolation = Schema.Struct({
  error: Schema.Struct({ code: Schema.String, message: Schema.String }),
});

export const SmokeBootstrap = Schema.Struct({
  mode: Schema.String,
  localLogin: Schema.Boolean,
  houseAvailable: Schema.Boolean,
  authProviders: Schema.Array(Schema.String),
});

export const SmokeAssignment = Schema.Struct({
  matchId: Schema.String.check(Schema.isPattern(/^match_[A-Za-z0-9_-]+$/)),
});

export const SmokeObservation = Schema.Struct({
  ...Common,
  private: Schema.NullOr(Schema.Struct(PrivatePolicy)),
  winner: Schema.NullOr(Schema.String),
  winReason: Schema.NullOr(Schema.String),
});

export const SmokeFinished = Schema.Struct({
  ...SmokeObservation.fields,
  seats: Schema.Array(Schema.Struct({ forfeited: Schema.Boolean, role: Schema.NullOr(Schema.String) })),
  reveal: Schema.NullOr(Schema.Struct(PolicyZones)),
});

export const SmokeSuccession = Schema.Struct({
  ...Common,
  private: Schema.NullOr(
    Schema.Union([
      Schema.Struct({ act: Schema.Literal(1), ...PrivatePolicy }),
      Schema.Struct({
        act: Schema.Literal(2),
        hand: Schema.Array(InfluenceCard),
        exchangePool: Schema.Array(InfluenceCard),
        reaction: Schema.NullOr(Schema.String),
      }),
    ]),
  ),
  gameId: Schema.String,
  act: Schema.Int,
  history: Schema.Struct({ visibilityEpoch: Schema.String, streamHead: Schema.Int }),
  result: Schema.NullOr(Schema.Struct({ kind: Schema.String, winnerSeat: Schema.optional(Schema.Int) })),
});

export const SmokeIndividualResult = Schema.Struct({ kind: Schema.String, winnerSeat: Schema.Int });

export const SmokeSocketPacket = (protocol: string) =>
  Schema.Struct({
    type: Schema.String,
    observation: protocol === '2' ? SmokeSuccession : SmokeObservation,
  });

export const SmokeSocketResult = Schema.Struct({
  status: Schema.String,
  packets: Schema.Int,
  maxBytes: Schema.Int,
  acts: Schema.Array(Schema.Int),
});

export const SmokeActs = Schema.Array(Schema.Int);

export const SmokeHistory = Schema.Struct({
  visibilityEpoch: Schema.String,
  streamHead: Schema.Int,
  after: Schema.Int,
  through: Schema.Int,
  cursor: Schema.Int,
  events: Schema.Array(
    Schema.Struct({
      id: Schema.Int,
      eventKey: Schema.String,
      at: Schema.Int,
      act: Schema.Int,
      round: Schema.Int,
      type: Schema.String,
      text: Schema.String,
    }),
  ),
  hasMore: Schema.Boolean,
  reset: Schema.Boolean,
});

export const SmokeRounds = Schema.Struct({
  rounds: Schema.Array(Schema.Struct({ act: Schema.Int, through: Schema.Int, eventKey: Schema.String })),
});

export const SmokeReplay = Schema.Struct({
  act: Schema.Int,
  archive: Schema.NullOr(
    Schema.Union([
      Schema.Struct({ act: Schema.Literal(1), ...PolicyZones }),
      Schema.Struct({
        act: Schema.Literal(2),
        hands: Schema.Array(Schema.Struct({ seat: Schema.Int, hand: Schema.Array(InfluenceCard) })),
        court: Schema.Array(InfluenceCard),
        exchangePool: Schema.optional(
          Schema.NullOr(Schema.Struct({ seat: Schema.Int, cards: Schema.Array(InfluenceCard) })),
        ),
      }),
    ]),
  ),
});

export const SmokeAnchor = Schema.Struct({
  visibilityEpoch: Schema.String,
  cursor: Schema.NullOr(Schema.Int),
});
