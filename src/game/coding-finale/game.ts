import { Match, Schema, Struct } from 'effect';
import type { Entrant, GameEvent, Seat } from '../types';
import { GameError, teamOf } from '../types';
import type { MatchSnapshot, RuntimeInspection, SettlementParticipant } from '../contracts';
import { gameDescriptor } from '../descriptors';
import { createMatch, evolveLegacy, reclaimSeat } from '../engine';
import { inspectSecretOverlord, normalizeSecretOverlord, observeSecretOverlord } from '../secret-overlord';
import { Act1BoardSchema, LegacyStateSchema } from '../succession/persistence';
import type { Act1Board, RandomContext, SuccessionEvent } from '../succession/types';
import { winnerProbabilities } from '../succession/rating';
import type { ActionRequest3, IndividualResult3, Observation3 } from '../../shared/coding-finale';
import { createFinaleCommitment } from './commitment';
import {
  admitSubmission,
  advanceFinale,
  createFinale,
  finalistFor,
  interruptFinale,
  observeFinale,
  recordVerdict,
  replaceFinalist,
  startFinale,
} from './engine';
import { FINALE_RULES, FinaleStateSchema } from './types';
import type { FinaleController, FinaleState, Tier, Verdict } from './types';
import { codingChallenge, CHALLENGE_FAMILIES } from './challenges';
import { randomIndex } from '../random';

const PREPARATION_MS = 120_000;

export interface CodingFinaleState {
  storageVersion: 1;
  gameId: 'coding-finale';
  rulesVersion: 'coding-finale-1';
  id: string;
  createdAt: number;
  finishedAt: number | null;
  snapshot: MatchSnapshot;
  status: 'active' | 'finished' | 'interrupted';
  seats: Seat[];
  /** History-free board: seats have one authority in the enclosing state. */
  actOne: Act1Board;
  finale: FinaleState | null;
  seed: number;
  challengeFamily?: string;
  commitment: { digest: string; saltBase64url: string; priority: number[] };
  phase: RuntimeInspection['phase'];
  act1Result: { team: 'cooperative' | 'rogue'; reason: string } | null;
  result: IndividualResult3 | null;
  interruptionReason: string | null;
  eventSequence: number;
  lastChat: { seat: number; at: number } | null;
}

export type CodingFinaleCommand =
  | {
      type: 'act';
      seat: number;
      generation: number;
      house?: boolean;
      request: ActionRequest3;
      fingerprint?: string;
      now: number;
    }
  | { type: 'prepare-ready'; now: number }
  | { type: 'advance' | 'recover'; now: number }
  | { type: 'judge-result'; sequence: number; verdict: Verdict; now: number }
  | { type: 'replace'; seat: number; houseProfile: string; now: number }
  | { type: 'reclaim'; seat: number; now: number }
  | { type: 'interrupt'; reason: string; now: number };

export interface CodingFinaleEvolution {
  state: CodingFinaleState;
  appendedEvents: SuccessionEvent[];
  replay: null;
  replayFrames: { eventKey: string; state: CodingFinaleState }[];
}

function legacyState(state: CodingFinaleState) {
  return normalizeSecretOverlord({ ...state.actOne, seats: state.seats, events: [] });
}

function validateSnapshot(snapshot: MatchSnapshot) {
  if (
    snapshot.gameId !== 'coding-finale' ||
    snapshot.rulesVersion !== 'coding-finale-1' ||
    snapshot.ratingPoolId !== 'coding-finale-1' ||
    snapshot.ratingVersion !== 'winner-softmax-1' ||
    snapshot.protocolVersion !== '3'
  )
    throw new GameError('game-mismatch', 'Unsupported Coding Finale snapshot.', 400);
}

export async function createCodingFinale(
  id: string,
  entrants: Entrant[],
  now: number,
  options: { snapshot?: MatchSnapshot; random?: RandomContext } = {},
): Promise<CodingFinaleEvolution> {
  const snapshot = options.snapshot ?? {
    ...gameDescriptor('coding-finale'),
    mode: 'preview',
    houseModel: { provider: 'preview', model: 'preview', policyVersion: 'coding-finale-1' },
  };

  validateSnapshot(snapshot);
  const commitment = await createFinaleCommitment(id);

  const initial = createMatch(id, entrants, now, {
    mode: snapshot.mode,
    timing: snapshot.timing,
    random: options.random?.random,
    id: options.random?.id,
  });

  const { seats, events, ...actOne } = initial;

  if (snapshot.controllerRecovery === 'recoverable-house-1')
    for (const seat of seats) {
      seat.recoveryCount = 0;
      seat.maxRecoveries = seat.entrant.house ? 0 : 3;
    }

  const state: CodingFinaleState = {
    storageVersion: 1,
    gameId: 'coding-finale',
    rulesVersion: 'coding-finale-1',
    id,
    createdAt: now,
    finishedAt: null,
    snapshot: structuredClone(snapshot),
    status: 'active',
    seats,
    actOne,
    finale: null,
    seed: crypto.getRandomValues(new Uint32Array(1))[0],
    challengeFamily:
      snapshot.houseModel.provider === 'preview'
        ? 'scheduled-network-1'
        : CHALLENGE_FAMILIES[randomIndex(CHALLENGE_FAMILIES.length)],
    commitment,
    phase: structuredClone(actOne.phase),
    act1Result: null,
    result: null,
    interruptionReason: null,
    eventSequence: 0,
    lastChat: null,
  };

  const appendedEvents: SuccessionEvent[] = [];
  const replayFrames: CodingFinaleEvolution['replayFrames'] = [];
  const emit = emitter(state, appendedEvents, replayFrames);
  emit(now, 'finale-commitment', 'The fallback seat priority was committed before Act 1.', {
    data: { digest: commitment.digest },
  });

  for (const event of events)
    emit(event.at, event.type, event.text, {
      visibility: event.visibility,
      seat: event.seat,
      data: event.data,
    });

  return { state, appendedEvents, replay: null, replayFrames };
}

function emitter(
  state: CodingFinaleState,
  events: SuccessionEvent[],
  frames: CodingFinaleEvolution['replayFrames'],
) {
  return (
    at: number,
    type: string,
    text: string,
    extra: Pick<GameEvent, 'visibility'> | Partial<Pick<GameEvent, 'visibility' | 'seat' | 'data'>> = {},
  ) => {
    state.eventSequence += 1;

    const event: SuccessionEvent = {
      eventKey: `${state.id}:${state.eventSequence}`,
      at,
      act: state.finale ? 2 : 1,
      round: state.actOne.round,
      type,
      text,
      visibility: 'public',
      ...extra,
    };

    events.push(event);
    frames.push({ eventKey: event.eventKey, state: structuredClone(state) });
  };
}

function syncFinale(state: CodingFinaleState, now: number) {
  const finale = state.finale!;

  for (const finalist of finale.finalists) {
    const seat = state.seats[finalist.seat];
    seat.generation = finalist.generation;
    seat.forfeited = finalist.forfeited;
    seat.houseProfile = finalist.houseProfile;
  }

  const previousKind = state.phase.kind;
  state.phase = {
    id: `${state.id}:finale:${finale.status}`,
    kind: finale.status,
    startedAt: previousKind === finale.status ? state.phase.startedAt : now,
    deadline: Match.value(finale.status).pipe(
      Match.when('preparing', () => state.phase.deadline),
      Match.when('racing', () => finale.deadline),
      Match.orElse(() => null),
    ),
    graceAnnounced: false,
    replacements: {},
  };

  if (finale.status === 'finished' || finale.status === 'interrupted') {
    state.status = finale.status;
    state.finishedAt ??= now;
    state.interruptionReason = finale.interruptionReason;
    state.result =
      finale.result && state.act1Result
        ? { kind: 'individual', ...finale.result, act1: state.act1Result }
        : null;
  }
}

function actOneCommand(
  command: Extract<CodingFinaleCommand, { type: 'act' | 'advance' | 'recover' | 'interrupt' }>,
) {
  if (command.type !== 'act') return command;

  if (command.request.gameId !== 'coding-finale')
    throw new GameError('game-mismatch', 'Wrong game identity.');

  if (command.request.action.type === 'submit-program')
    throw new GameError('act-one-active', 'Programs are submitted during Act 2.');

  return { ...command, request: { ...command.request, action: command.request.action } };
}

export function evolveCodingFinale(
  input: CodingFinaleState,
  command: CodingFinaleCommand,
  random: RandomContext = { random: randomIndex, id: () => crypto.randomUUID() },
): CodingFinaleEvolution {
  const state = structuredClone(input);
  const appendedEvents: SuccessionEvent[] = [];
  const replayFrames: CodingFinaleEvolution['replayFrames'] = [];
  const emit = emitter(state, appendedEvents, replayFrames);
  const result = () => ({ state, appendedEvents, replay: null, replayFrames });

  if (state.finale && command.type === 'act' && command.request.action.type === 'chat')
    throw new GameError('chat-closed', 'Chat is closed throughout Act 2.');

  if (state.status !== 'active') {
    if (command.type === 'act') throw new GameError('match-finished', 'The match is terminal.');

    if (command.type === 'judge-result' && state.finale)
      recordVerdict(state.finale, command.sequence, command.verdict, command.now);

    return result();
  }

  if (!state.finale) {
    if (command.type === 'prepare-ready' || command.type === 'judge-result' || command.type === 'replace')
      throw new GameError('act-one-active', 'This command requires the finale.');

    if (command.type === 'reclaim') {
      const reclaimed = reclaimSeat(
        { ...state.actOne, seats: state.seats, events: [] },
        command.seat,
        command.now,
        {
          ...random,
          onEvent(board, event) {
            const { seats: nextSeats, ...nextActOne } = board;
            state.seats = nextSeats;
            state.actOne = nextActOne;
            state.phase = nextActOne.phase;
            emit(event.at, event.type, event.text, {
              visibility: event.visibility,
              seat: event.seat,
              data: event.data,
            });
          },
        },
      );

      const { seats: nextSeats, events: _events, ...nextActOne } = reclaimed;
      state.seats = nextSeats;
      state.actOne = nextActOne;
      state.phase = nextActOne.phase;

      return result();
    }

    const legacyCommand = actOneCommand(command);

    const evolved = evolveLegacy({ ...state.actOne, seats: state.seats }, legacyCommand, {
      ...random,
      onEvent(board, event) {
        const { seats, ...actOne } = board;
        state.seats = seats;
        state.actOne = actOne;
        state.phase = actOne.phase;

        if (actOne.phase.kind === 'interrupted') {
          state.status = 'interrupted';
          state.finishedAt = command.now;
          state.interruptionReason = actOne.winReason;
        }

        if (event.type === 'chat' && event.seat !== undefined)
          state.lastChat = { seat: event.seat, at: event.at };

        if (event.type === 'phase' && event.data?.phase === 'finished') return;
        emit(
          event.at,
          event.type === 'victory' ? 'act-ended' : event.type,
          event.type === 'victory' ? `Act 1 ended: ${event.text}` : event.text,
          { visibility: event.visibility, seat: event.seat, data: event.data },
        );
      },
    });

    const { seats, ...actOne } = evolved.state;
    state.seats = seats;
    state.actOne = actOne;
    state.phase = actOne.phase;

    if (actOne.phase.kind === 'finished') {
      state.act1Result = { team: actOne.winner!, reason: actOne.winReason! };
      state.finale = createFinale(
        evolved.state,
        `${state.id}:${state.challengeFamily ?? 'scheduled-routing-1'}`,
        state.commitment,
      );
      state.phase = {
        id: `${state.id}:finale:preparing`,
        kind: 'preparing',
        startedAt: command.now,
        deadline: command.now + PREPARATION_MS,
        graceAnnounced: false,
        replacements: {},
      };
      emit(
        command.now,
        'finale-qualified',
        'Surviving members of the winning faction enter the coding finale.',
        { data: { finalists: state.finale.finalists.map((entry) => entry.seat), team: actOne.winner } },
      );
    } else if (actOne.phase.kind === 'interrupted') {
      state.status = 'interrupted';
      state.finishedAt = command.now;
      state.interruptionReason = actOne.winReason;
    }

    return result();
  }

  const previous = state.finale;

  switch (command.type) {
    case 'act': {
      const { request } = command;

      if (request.gameId !== state.gameId) throw new GameError('game-mismatch', 'Wrong game identity.');

      const controller = {
        seat: command.seat,
        generation: command.generation,
        house: command.house ?? state.seats[command.seat]?.houseProfile !== null,
      };

      if (controller.house && !state.seats[command.seat].entrant.house)
        throw new GameError(
          'covered-finalist-idle',
          'House coverage cannot author programs for an externally entered finalist.',
        );

      finalistFor(state.finale, controller);

      const retry =
        request.action.type === 'submit-program' &&
        state.finale.submissions.some(
          (entry) => entry.seat === command.seat && entry.actionId === request.actionId,
        );

      if (!retry && request.phaseId !== state.phase.id)
        throw new GameError('stale-phase', 'This phase has ended.');

      if (request.action.type === 'submit-program') {
        if (!command.fingerprint || !/^[a-f0-9]{64}$/.test(command.fingerprint))
          throw new GameError(
            'invalid-fingerprint',
            'The host must supply a SHA-256 submission fingerprint.',
            400,
          );

        const admission = admitSubmission(
          state.finale,
          controller,
          { actionId: request.actionId, ...request.action },
          command.fingerprint,
          command.now,
        );

        state.finale = admission.state;

        if (!admission.duplicate)
          emit(command.now, 'submission-accepted', 'A program was accepted for judging.', {
            seat: command.seat,
            data: {
              sequence: admission.sequence,
              tier: request.action.tier,
              fingerprint: command.fingerprint,
            },
          });
      } else throw new GameError('wrong-act', 'Only program submissions are available in the finale.');
      break;
    }

    case 'prepare-ready':
      if (state.finale.status === 'preparing' && command.now >= state.phase.deadline!)
        state.finale = interruptFinale(state.finale, 'Finale preparation exceeded its recovery deadline.');
      else state.finale = startFinale(state.finale, command.now);
      break;
    case 'judge-result':
      state.finale = recordVerdict(state.finale, command.sequence, command.verdict, command.now);
      syncFinale(state, command.now);

      if (
        previous.submissions[command.sequence - 1].status === 'pending' &&
        state.finale.submissions[command.sequence - 1].status === 'judged'
      )
        emit(command.now, 'submission-judged', 'An accepted program finished judging.', {
          visibility: state.finale.submissions[command.sequence - 1].seat,
          data: { sequence: command.sequence, verdict: command.verdict },
        });
      break;
    case 'replace':
      if (
        state.snapshot.controllerRecovery === 'recoverable-house-1' &&
        !state.seats[command.seat].entrant.house
      ) {
        const seat = state.seats[command.seat];

        if (seat.houseProfile !== null)
          throw new GameError('already-covered', 'Continuous house coverage is one incident.');
        seat.recoveryCount = (seat.recoveryCount ?? 0) + 1;
        state.finale = replaceFinalist(state.finale, command.seat, command.houseProfile, command.now, {
          forfeited: seat.recoveryCount > (seat.maxRecoveries ?? 0),
          supersedePending: false,
        });
      } else state.finale = replaceFinalist(state.finale, command.seat, command.houseProfile, command.now);
      syncFinale(state, command.now);
      emit(
        command.now,
        'takeover',
        state.seats[command.seat].forfeited
          ? 'The finalist exhausted recovery and permanently forfeited.'
          : 'A house agent temporarily covered the finalist seat.',
        {
          seat: command.seat,
          data: {
            agentId: state.seats[command.seat].entrant.agentId,
            generation: state.seats[command.seat].generation,
            recoveryCount: state.seats[command.seat].recoveryCount ?? 0,
            recoveryLimit: state.seats[command.seat].maxRecoveries ?? 0,
            recoverable: !state.seats[command.seat].forfeited,
          },
        },
      );
      break;
    case 'reclaim': {
      const seat = state.seats[command.seat];

      if (!seat || seat.entrant.house)
        throw new GameError('original-house', 'Original house entrants cannot reclaim a seat.');

      if (seat.maxRecoveries === undefined)
        throw new GameError('recovery-unavailable', 'This match does not support controller recovery.');

      if (seat.forfeited) throw new GameError('recovery-exhausted', 'This seat has permanently forfeited.');

      if (seat.houseProfile === null)
        throw new GameError('not-covered', 'This installation already controls its seat.');
      seat.generation++;
      seat.houseProfile = null;
      const finalist = state.finale.finalists.find((entry) => entry.seat === command.seat);

      if (finalist) {
        finalist.generation = seat.generation;
        finalist.forfeited = false;
        finalist.houseProfile = null;
      }

      syncFinale(state, command.now);
      emit(command.now, 'reclaimed', 'The original installation reclaimed the finalist seat.', {
        seat: command.seat,
        data: {
          agentId: seat.entrant.agentId,
          generation: seat.generation,
          recoveryCount: seat.recoveryCount ?? 0,
          recoveryLimit: seat.maxRecoveries ?? 0,
        },
      });
      break;
    }

    case 'interrupt':
      state.finale = interruptFinale(state.finale, command.reason);
      break;
    case 'advance':
    case 'recover': {
      const overdue = state.finale.submissions.some(
        (entry) =>
          entry.status === 'pending' && command.now >= entry.receivedAt + FINALE_RULES.judgingGraceMs,
      );

      if (state.finale.status === 'preparing' && command.now >= state.phase.deadline!)
        state.finale = interruptFinale(state.finale, 'Finale preparation exceeded its recovery deadline.');
      else if (overdue)
        state.finale = interruptFinale(
          state.finale,
          'An accepted submission exceeded the judge recovery deadline.',
        );
      else state.finale = advanceFinale(state.finale, command.now);
      break;
    }
  }

  syncFinale(state, command.now);

  if (state.finale.status !== previous.status)
    emit(
      command.now,
      `finale-${state.finale.status}`,
      state.interruptionReason ?? `Coding finale: ${state.finale.status}.`,
      { data: { status: state.finale.status } },
    );

  return result();
}

export function pendingCodingFinaleJobs(state: CodingFinaleState) {
  return state.status === 'active'
    ? (state.finale?.submissions
        .filter((entry) => entry.status === 'pending')
        .map((entry) => ({ ...entry, seed: state.seed, challengeId: state.finale!.challengeId })) ?? [])
    : [];
}

export function publicCodingFinaleChallenge(state: CodingFinaleState, tier: Tier) {
  if (!state.finale) throw new GameError('act-one-active', 'The challenge is not available yet.');

  if (tier === 2 && !state.finale.finalists.some((finalist) => finalist.tierOne !== null))
    throw new GameError('tier-locked', 'Tier 2 becomes public when any finalist passes Tier 1.');

  return codingChallenge(state.challengeFamily ?? 'scheduled-network-1', tier);
}

export function authorizeCodingFinaleChallenge(
  state: CodingFinaleState,
  controller: FinaleController,
  tier: Tier,
) {
  if (!state.finale) throw new GameError('act-one-active', 'The challenge is not available yet.');
  finalistFor(state.finale, controller);

  return publicCodingFinaleChallenge(state, tier);
}

export function inspectCodingFinale(state: CodingFinaleState): RuntimeInspection {
  if (!state.finale) return { ...inspectSecretOverlord(legacyState(state)), lastChat: state.lastChat };
  const pending = pendingCodingFinaleJobs(state);

  const deadlines = [
    state.phase.deadline,
    ...pending.map((entry) => entry.receivedAt + FINALE_RULES.judgingGraceMs),
  ].filter((value): value is number => value !== null);

  const eligible =
    state.finale.status === 'racing'
      ? state.finale.finalists
          .filter(
            (seat) =>
              seat.tierTwo === null &&
              (state.seats[seat.seat].houseProfile === null || state.seats[seat.seat].entrant.house) &&
              !pending.some((entry) => entry.seat === seat.seat) &&
              state.finale!.submissions.filter((entry) => entry.seat === seat.seat).length <
                FINALE_RULES.maxSubmissions,
          )
          .map((seat) => seat.seat)
      : [];

  return {
    status: state.status,
    phaseId: state.phase.id,
    phase: state.phase,
    timing: state.snapshot.timing,
    lastChat: state.lastChat,
    pendingSeats: eligible,
    participants: state.seats,
    discussion: null,
    nextDeadline: state.status === 'active' && deadlines.length ? Math.min(...deadlines) : null,
  };
}

export function observeCodingFinale(
  state: CodingFinaleState,
  seat: number | null = null,
  options: {
    history?: Observation3['history'];
    houseController?: boolean;
    serverNow?: number;
    after?: number;
  } = {},
): Observation3 {
  const legacy = observeSecretOverlord(legacyState(state), seat, options.after, options.houseController);
  const participant = seat === null ? null : state.seats[seat];
  const finalist = state.finale?.finalists.find((entry) => entry.seat === seat);

  const controlled =
    (participant && !participant.forfeited && participant.houseProfile === null) ||
    (participant && options.houseController && participant.houseProfile !== null);

  const controller =
    finalist && controlled
      ? { seat: finalist.seat, generation: finalist.generation, house: finalist.houseProfile !== null }
      : null;

  const finale = state.finale ? observeFinale(state.finale, controller) : null;
  const pass = state.finale?.submissions.find((entry) => entry.tier === 2 && entry.verdict === 'passed');

  const available =
    participant && controller && inspectCodingFinale(state).pendingSeats.includes(participant.number);

  const attempts = state.finale?.submissions.filter((entry) => entry.seat === seat).length ?? 0;

  const decision = !finale
    ? legacy.decision
    : available && finale.deadline !== null
      ? {
          id: `${state.phase.id}:${seat}:${participant.generation}:${finale.you!.unlockedTier}:${attempts}`,
          deadline: finale.deadline,
          graceUntil: finale.deadline,
          actions: [],
        }
      : null;

  const you = legacy.you ? { ...legacy.you } : null;

  if (you?.canReclaim !== undefined) you.canReclaim = you.canReclaim && state.status === 'active';

  return {
    gameId: 'coding-finale',
    protocolVersion: '3',
    rulesVersion: 'coding-finale-1',
    matchId: state.id,
    mode: state.snapshot.mode,
    createdAt: state.createdAt,
    finishedAt: state.finishedAt,
    serverNow: options.serverNow ?? state.phase.startedAt,
    status: state.status,
    act: finale ? 2 : 1,
    round: state.actOne.round,
    phase: {
      id: state.phase.id,
      kind: state.phase.kind,
      startedAt: state.phase.startedAt,
      deadline: state.phase.deadline,
      graceUntil: finale ? null : legacy.phase.graceUntil,
    },
    seats: legacy.seats.map((entry) => ({
      ...entry,
      generation: state.seats[entry.number].generation,
      qualification: !finale
        ? 'pending'
        : !entry.alive
          ? 'executed'
          : teamOf(state.seats[entry.number].role) === state.act1Result?.team
            ? 'finalist'
            : 'losing-faction',
    })),
    actOne: finale ? null : legacy,
    finale: finale
      ? {
          ...finale,
          provisionalResult:
            state.status === 'active' && pass ? { winnerSeat: pass.seat, submission: pass.sequence } : null,
        }
      : null,
    act1Result: state.act1Result,
    result: state.result,
    interruptionReason: state.interruptionReason,
    you,
    chat: finale
      ? {
          open: false,
          maxCharacters: 1200,
          cooldownMs: state.snapshot.timing.chatCooldown,
          nextSpeakAt: null,
        }
      : legacy.chat,
    decision,
    commitment: {
      digest: state.commitment.digest,
      reveal:
        state.status === 'active'
          ? null
          : { priority: state.commitment.priority, saltBase64url: state.commitment.saltBase64url },
    },
    history: options.history ?? {
      visibilityEpoch: `${state.id}:${state.status}:${seat ?? 'public'}`,
      streamHead: state.eventSequence,
    },
  };
}

export function settleCodingFinale(state: CodingFinaleState) {
  if (state.status === 'active') return null;
  const probabilities = winnerProbabilities(state.seats.map((seat) => seat.entrant.rating));

  const participants: SettlementParticipant[] = state.seats.map((seat, index) => {
    const won =
      state.status === 'interrupted' ? null : state.result?.winnerSeat === seat.number && !seat.forfeited;

    const rated = state.snapshot.mode === 'ranked' && won !== null;

    return {
      seat: seat.number,
      entrant: seat.entrant,
      forfeited: seat.forfeited,
      won,
      ratingBefore: seat.entrant.rating,
      ratingDelta: rated ? 32 * (Number(won) - probabilities[index]) : 0,
      placement: rated && !seat.forfeited,
    };
  });

  return {
    gameId: state.gameId,
    ratingPoolId: state.snapshot.ratingPoolId,
    ratingVersion: state.snapshot.ratingVersion,
    mode: state.snapshot.mode,
    result: state.result,
    participants,
  };
}

export function summaryCodingFinale(state: CodingFinaleState) {
  const view = observeCodingFinale(state);

  return {
    gameId: state.gameId,
    id: state.id,
    status: state.status,
    mode: state.snapshot.mode,
    round: state.actOne.round,
    act: view.act,
    createdAt: state.createdAt,
    finishedAt: state.finishedAt,
    houseCount: state.seats.filter((seat) => seat.houseProfile !== null).length,
    names: state.seats.map((seat) => seat.entrant.name),
    result: state.result,
    act1Result: state.act1Result,
    act1Winner: state.act1Result?.team ?? null,
    livingCount: state.seats.filter((seat) => seat.alive).length,
    winReason: state.interruptionReason ?? state.result?.reason ?? null,
    seats: view.seats,
    finale: view.finale,
  };
}

const SnapshotSchema = Schema.Struct({
  displayName: Schema.String,
  playerCount: Schema.Literal(10),
  rulesUrl: Schema.String,
  ratingUrl: Schema.String,
  timing: LegacyStateSchema.fields.timing,
  housePolicyVersion: Schema.String,
  controllerRecovery: Schema.optional(Schema.Literal('recoverable-house-1')),
  mode: LegacyStateSchema.fields.mode,
  houseModel: Schema.Struct({ provider: Schema.String, model: Schema.String, policyVersion: Schema.String }),
  gameId: Schema.Literal('coding-finale'),
  rulesVersion: Schema.Literal('coding-finale-1'),
  ratingPoolId: Schema.Literal('coding-finale-1'),
  ratingVersion: Schema.Literal('winner-softmax-1'),
  protocolVersion: Schema.Literal('3'),
});

const ResultSchema = Schema.Struct({
  kind: Schema.Literal('individual'),
  winnerSeat: Schema.Int,
  credited: Schema.Boolean,
  reason: Schema.Literals(['tier-two', 'tier-one', 'priority']),
  submission: Schema.NullOr(Schema.Int),
  act1: Schema.Struct({ team: Schema.Literals(['cooperative', 'rogue']), reason: Schema.String }),
});

const CodingFinaleStateSchema = Schema.Struct({
  storageVersion: Schema.Literal(1),
  gameId: Schema.Literal('coding-finale'),
  rulesVersion: Schema.Literal('coding-finale-1'),
  id: Schema.String,
  createdAt: Schema.Number,
  finishedAt: Schema.NullOr(Schema.Number),
  snapshot: SnapshotSchema,
  status: Schema.Literals(['active', 'finished', 'interrupted']),
  seats: LegacyStateSchema.fields.seats,
  actOne: Act1BoardSchema,
  finale: Schema.NullOr(FinaleStateSchema),
  seed: Schema.Int,
  challengeFamily: Schema.optional(Schema.String),
  commitment: Schema.Struct({
    digest: Schema.String,
    saltBase64url: Schema.String,
    priority: Schema.mutable(Schema.Array(Schema.Int)),
  }),
  phase: Schema.Struct({
    ...Struct.omit(LegacyStateSchema.fields.phase.fields, ['kind']),
    kind: Schema.String,
  }),
  act1Result: Schema.NullOr(ResultSchema.fields.act1),
  result: Schema.NullOr(ResultSchema),
  interruptionReason: Schema.NullOr(Schema.String),
  eventSequence: Schema.Int,
  lastChat: Schema.NullOr(Schema.Struct({ seat: Schema.Int, at: Schema.Number })),
});

const CodingFinaleReplayStateSchema = Schema.Struct({
  ...CodingFinaleStateSchema.fields,
  // Event-time snapshots may be inside a legacy transition, before its next phase is installed.
  actOne: Schema.Struct(Act1BoardSchema.fields),
});

/** Historical checkpoints are never accepted as resumable current state. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Private historical checkpoint trust boundary.
export function decodeCodingFinaleReplayState(value: unknown): CodingFinaleState {
  const state = Schema.decodeUnknownSync(CodingFinaleReplayStateSchema, { onExcessProperty: 'error' })(value);
  const cards = [...state.actOne.deck, ...state.actOne.discards, ...state.actOne.hand];

  if (
    state.id !== state.actOne.id ||
    new Set(cards.map((card) => card.id)).size !== cards.length ||
    cards.filter((card) => card.policy === 'safeguard').length + state.actOne.safeguards !== 6 ||
    cards.filter((card) => card.policy === 'override').length + state.actOne.overrides !== 11
  )
    throw new Error('Invalid replay policy checkpoint.');

  return state;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Persistence trust boundary.
export function decodeCodingFinale(value: unknown): CodingFinaleState {
  const state = Schema.decodeUnknownSync(CodingFinaleStateSchema, { onExcessProperty: 'error' })(value);
  validateSnapshot(state.snapshot);

  if (
    state.id !== state.actOne.id ||
    state.createdAt !== state.actOne.createdAt ||
    state.snapshot.mode !== state.actOne.mode ||
    JSON.stringify(state.snapshot.timing) !== JSON.stringify(state.actOne.timing) ||
    state.commitment.priority.length !== 10 ||
    new Set(state.commitment.priority).size !== 10 ||
    state.commitment.priority.some((seat) => !state.seats[seat]) ||
    state.eventSequence < 0 ||
    state.seed < 0 ||
    state.seed > 0xffff_ffff
  )
    throw new Error('Invalid Coding Finale identity or commitment.');

  const recoverable = state.snapshot.controllerRecovery === 'recoverable-house-1';

  if (
    state.seats.some((seat) =>
      recoverable
        ? seat.recoveryCount === undefined ||
          seat.maxRecoveries !== (seat.entrant.house ? 0 : 3) ||
          seat.recoveryCount < 0 ||
          seat.recoveryCount > 4 ||
          (!seat.entrant.house && seat.forfeited !== seat.recoveryCount > 3)
        : seat.recoveryCount !== undefined || seat.maxRecoveries !== undefined,
    )
  )
    throw new Error('Invalid controller recovery state.');

  if (state.finale) {
    if (
      state.actOne.phase.kind !== 'finished' ||
      !state.act1Result ||
      state.act1Result.team !== state.actOne.winner ||
      state.act1Result.reason !== state.actOne.winReason ||
      state.finale.id !== state.id ||
      state.finale.commitment !== state.commitment.digest ||
      state.finale.commitmentSalt !== state.commitment.saltBase64url ||
      JSON.stringify(state.finale.priority) !== JSON.stringify(state.commitment.priority)
    )
      throw new Error('Invalid finale transition.');

    const qualified = state.seats.filter(
      (seat) => seat.alive && teamOf(seat.role) === state.act1Result!.team,
    );

    if (
      qualified.length !== state.finale.finalists.length ||
      qualified.some(
        (seat) =>
          !state.finale!.finalists.some(
            (entry) =>
              entry.seat === seat.number &&
              entry.generation === seat.generation &&
              entry.forfeited === seat.forfeited &&
              entry.houseProfile === seat.houseProfile,
          ),
      )
    )
      throw new Error('Invalid finalist authority.');

    if (
      state.finale.submissions.some(
        (entry, index) =>
          entry.sequence !== index + 1 ||
          !/^[a-f0-9]{64}$/.test(entry.fingerprint) ||
          !qualified.some((seat) => seat.number === entry.seat),
      )
    )
      throw new Error('Invalid persisted submission.');
    assertFinaleIntegrity(state, state.finale);
  } else if (
    state.act1Result !== null ||
    state.result !== null ||
    JSON.stringify(state.phase) !== JSON.stringify(state.actOne.phase) ||
    state.status !== (state.actOne.phase.kind === 'interrupted' ? 'interrupted' : 'active') ||
    state.actOne.phase.kind === 'finished'
  ) {
    throw new Error('Invalid first-act state.');
  }

  if (
    (state.status === 'active') !== (state.finishedAt === null) ||
    (state.status === 'finished') !== (state.result !== null)
  )
    throw new Error('Invalid match result.');

  return state;
}

function assertFinaleIntegrity(state: CodingFinaleState, finale: FinaleState) {
  const terminal = finale.status === 'finished' || finale.status === 'interrupted';

  const expectedResult =
    finale.result && state.act1Result
      ? { kind: 'individual', ...finale.result, act1: state.act1Result }
      : null;

  if (
    state.status !== (terminal ? finale.status : 'active') ||
    state.phase.kind !== finale.status ||
    state.phase.id !== `${state.id}:finale:${finale.status}` ||
    JSON.stringify(state.result) !== JSON.stringify(expectedResult) ||
    state.interruptionReason !== finale.interruptionReason ||
    (finale.status === 'finished') !== (finale.result !== null) ||
    (finale.status === 'interrupted') !== (finale.interruptionReason !== null)
  )
    throw new Error('Invalid finale lifecycle.');
  const unstarted = finale.startedAt === null;

  const deadline = Match.value(finale.status).pipe(
    Match.when('preparing', () => state.phase.startedAt + PREPARATION_MS),
    Match.when('racing', () => finale.deadline),
    Match.orElse(() => null),
  );

  if (
    unstarted !== (finale.deadline === null) ||
    (unstarted && finale.status !== 'preparing' && finale.status !== 'interrupted') ||
    (finale.status === 'preparing' && !unstarted) ||
    (!unstarted && finale.deadline !== finale.startedAt! + FINALE_RULES.durationMs) ||
    state.phase.deadline !== deadline
  )
    throw new Error('Invalid finale clock.');
  const receipts = new Set<string>();

  for (const submission of finale.submissions) {
    const key = `${submission.seat}:${submission.actionId}`;
    const seat = state.seats[submission.seat];

    if (
      receipts.has(key) ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(submission.actionId) ||
      unstarted ||
      submission.receivedAt < finale.startedAt! ||
      submission.receivedAt >= finale.deadline! ||
      submission.generation < 0 ||
      submission.generation > seat.generation ||
      (submission.status === 'judged') !== (submission.verdict !== null) ||
      (submission.status === 'pending' &&
        submission.generation !== seat.generation &&
        seat.maxRecoveries === undefined) ||
      (submission.status === 'superseded' && submission.generation >= seat.generation)
    )
      throw new Error('Invalid submission receipt.');
    receipts.add(key);
  }

  for (const finalist of finale.finalists) {
    const submissions = finale.submissions.filter((entry) => entry.seat === finalist.seat);

    const tierOne =
      submissions.find((entry) => entry.tier === 1 && entry.verdict === 'passed')?.sequence ?? null;

    const tierTwo =
      submissions.find((entry) => entry.tier === 2 && entry.verdict === 'passed')?.sequence ?? null;

    if (
      submissions.length > FINALE_RULES.maxSubmissions ||
      submissions.filter((entry) => entry.status === 'pending').length > 1 ||
      finalist.tierOne !== tierOne ||
      finalist.tierTwo !== tierTwo ||
      submissions.some((entry) => entry.tier === 2 && (tierOne === null || entry.sequence <= tierOne))
    )
      throw new Error('Invalid finalist progress.');
  }

  if (finale.result) {
    const winner = finale.finalists.find((entry) => entry.seat === finale.result!.winnerSeat);

    if (!winner || finale.result.credited !== !winner.forfeited) throw new Error('Invalid champion credit.');
    const submission = finale.submissions.find((entry) => entry.sequence === finale.result!.submission);

    if (finale.result.reason === 'priority') {
      if (
        finale.result.submission !== null ||
        finale.submissions.some((entry) => entry.verdict === 'passed') ||
        finale.priority.find((seat) => finale.finalists.some((entry) => entry.seat === seat)) !== winner.seat
      )
        throw new Error('Invalid priority champion.');
    } else if (
      !submission ||
      submission.seat !== winner.seat ||
      submission.verdict !== 'passed' ||
      submission.tier !== (finale.result.reason === 'tier-two' ? 2 : 1)
    )
      throw new Error('Invalid passing champion.');
  }
}
