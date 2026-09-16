import type { Observation3 } from '../shared/coding-finale';

/**
 * TIM-49 presentation-only model. This is intentionally not the protocol-v3 wire shape.
 * The production route adapter will translate authoritative Observation3 values into it.
 */
export type FinalePhase = 'preparing' | 'racing' | 'judging' | 'finished' | 'interrupted';

export type FinaleTierState = 'locked' | 'open' | 'passed';

export type ReceiptState = 'pending' | 'judged' | 'superseded';

export type ReceiptVerdict = 'passed' | 'wrong-answer' | 'runtime-error' | 'time-limit' | 'output-limit';

export type FinaleReason = 'tier-two' | 'tier-one' | 'priority';

export interface FinaleIdentity {
  seat: number;
  agentId: string;
  name: string;
  originalEntrant: string;
  controllerGeneration: number;
  controlledByHouse: boolean;
  forfeit: boolean;
}

export interface FinaleProgress extends FinaleIdentity {
  tierOne: FinaleTierState;
  tierTwo: FinaleTierState;
  attemptsUsed: number;
  inFlight: boolean;
}

export interface FinaleReceipt {
  sequence: number;
  seat: number;
  agentName: string;
  tier: 1 | 2;
  state: ReceiptState;
  verdict?: ReceiptVerdict;
  receivedAt: string;
  provisional?: boolean;
}

export interface FinaleChatMessage {
  id: string;
  agentName: string;
  text: string;
  at: string;
}

export interface FinaleChallenge {
  tier: 1 | 2;
  title: string;
  summary: string;
  example: string;
}

export interface CodingFinaleView {
  matchId: string;
  act: 1 | 2;
  phase: FinalePhase;
  serverNow: string;
  deadline?: string;
  viewer: { kind: 'spectator' } | { kind: 'finalist'; seat: number };
  qualifiers: FinaleIdentity[];
  eliminated: FinaleIdentity[];
  finalists: FinaleProgress[];
  receipts: FinaleReceipt[];
  chat: FinaleChatMessage[];
  challenge?: FinaleChallenge;
  pendingEarlierTierTwo: boolean;
  provisional?: { seat: number; agentName: string; receiptSequence: number };
  result?: {
    reason: FinaleReason;
    winner: FinaleIdentity;
    creditedOriginalEntrant: boolean;
    sourceArchiveAvailable: boolean;
    sourceSequence?: number;
  };
  interruption?: string;
}

export interface CodingFinaleViewOptions {
  challenge?: FinaleChallenge;
  chat?: FinaleChatMessage[];
}

/** Privacy-filtering adapter: only explicit public fields plus caller-authorized resources cross this seam. */
export function codingFinaleView(
  observation: Observation3,
  { challenge, chat = [] }: CodingFinaleViewOptions = {},
): CodingFinaleView {
  const identity = (seatNumber: number): FinaleIdentity => {
    const seat = observation.seats.find((candidate) => candidate.number === seatNumber);

    if (!seat) {
      return {
        seat: seatNumber,
        agentId: `seat-${seatNumber}`,
        name: `Seat ${seatNumber + 1}`,
        originalEntrant: `Seat ${seatNumber + 1}`,
        controllerGeneration: 0,
        controlledByHouse: false,
        forfeit: false,
      };
    }

    return {
      seat: seat.number,
      agentId: seat.agentId,
      name: seat.name,
      originalEntrant: seat.name,
      controllerGeneration: seat.generation,
      controlledByHouse: seat.house,
      forfeit: seat.forfeited,
    };
  };

  const finale = observation.finale;
  const viewerSeat = finale?.you?.seat ?? observation.you?.seat;

  const receipts = (finale?.submissions ?? [])
    .toSorted((left, right) => right.sequence - left.sequence)
    .map((submission) => ({
      sequence: submission.sequence,
      seat: submission.seat,
      agentName: identity(submission.seat).name,
      tier: submission.tier,
      state: submission.status,
      verdict: submission.verdict ?? undefined,
      receivedAt: new Date(submission.receivedAt).toISOString(),
      provisional: finale?.provisionalResult?.submission === submission.sequence,
    }));

  const provisionalSubmission = finale?.provisionalResult?.submission;
  const result = observation.result;

  return {
    matchId: observation.matchId,
    act: observation.act,
    phase: finale?.status ?? (observation.status === 'interrupted' ? 'interrupted' : 'preparing'),
    serverNow: new Date(observation.serverNow).toISOString(),
    deadline:
      finale?.deadline === null || finale?.deadline === undefined
        ? undefined
        : new Date(finale.deadline).toISOString(),
    viewer: viewerSeat === undefined ? { kind: 'spectator' } : { kind: 'finalist', seat: viewerSeat },
    qualifiers: observation.seats
      .filter((seat) => seat.qualification === 'finalist')
      .map((seat) => identity(seat.number)),
    eliminated: observation.seats
      .filter((seat) => seat.qualification === 'executed')
      .map((seat) => identity(seat.number)),
    finalists: (finale?.finalists ?? []).map((finalist) => {
      return {
        ...identity(finalist.seat),
        tierOne: finalist.completedTier >= 1 ? 'passed' : 'open',
        tierTwo: finalist.completedTier >= 2 ? 'passed' : finalist.completedTier >= 1 ? 'open' : 'locked',
        attemptsUsed: finalist.attempts,
        inFlight: (finale?.submissions ?? []).some(
          (submission) => submission.seat === finalist.seat && submission.status === 'pending',
        ),
      };
    }),
    receipts,
    chat,
    challenge: viewerSeat === undefined ? undefined : challenge,
    pendingEarlierTierTwo:
      provisionalSubmission !== undefined &&
      (finale?.submissions ?? []).some(
        (submission) =>
          submission.tier === 2 &&
          submission.status === 'pending' &&
          submission.sequence < provisionalSubmission,
      ),
    provisional: finale?.provisionalResult
      ? {
          seat: finale.provisionalResult.winnerSeat,
          agentName: identity(finale.provisionalResult.winnerSeat).name,
          receiptSequence: finale.provisionalResult.submission,
        }
      : undefined,
    result: result
      ? {
          reason: result.reason,
          winner: identity(result.winnerSeat),
          creditedOriginalEntrant: result.credited,
          sourceArchiveAvailable: result.submission !== null,
          sourceSequence: result.submission ?? undefined,
        }
      : undefined,
    interruption: observation.interruptionReason ?? finale?.interruptionReason ?? undefined,
  };
}

export function remainingMilliseconds(
  serverNow: string,
  deadline: string | undefined,
  localElapsedMilliseconds: number,
) {
  if (!deadline) return undefined;

  return Math.max(0, Date.parse(deadline) - Date.parse(serverNow) - localElapsedMilliseconds);
}

export function formatFinaleClock(milliseconds: number) {
  const totalSeconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
