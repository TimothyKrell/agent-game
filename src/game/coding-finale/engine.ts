import { GameError, teamOf } from '../types';
import type { LegacyBoard } from '../engine';
import type { FinaleController, FinaleState, SubmissionRequest, Verdict } from './types';
import { FINALE_RULES } from './types';
import type { FinaleCommitment } from './commitment';

/** Called at the existing engine's terminal seam, before overall match settlement. */
export function createFinale(
  board: LegacyBoard,
  challengeId: string,
  commitment: FinaleCommitment,
): FinaleState {
  if (board.phase.kind !== 'finished' || !board.winner)
    throw new GameError('act-one-active', 'The first act must have a faction result.');

  const finalists = board.seats.flatMap((seat) =>
    seat.alive && teamOf(seat.role) === board.winner
      ? [
          {
            seat: seat.number,
            generation: seat.generation,
            forfeited: seat.forfeited,
            houseProfile: seat.houseProfile,
            tierOne: null,
            tierTwo: null,
          },
        ]
      : [],
  );

  if (!finalists.length) throw new GameError('no-finalists', 'No surviving winning-faction seats.');

  if (
    commitment.priority.length !== board.seats.length ||
    new Set(commitment.priority).size !== board.seats.length ||
    commitment.priority.some((seat) => !board.seats.some((entry) => entry.number === seat))
  )
    throw new GameError('invalid-priority', 'The committed priority must contain every seat once.');

  return {
    rulesVersion: 'coding-finale-1',
    id: board.id,
    challengeId,
    status: 'preparing',
    finalists,
    submissions: [],
    startedAt: null,
    deadline: null,
    priority: commitment.priority,
    commitment: commitment.digest,
    commitmentSalt: commitment.saltBase64url,
    result: null,
    interruptionReason: null,
  };
}

export function startFinale(input: FinaleState, now: number): FinaleState {
  if (input.status !== 'preparing') return input;

  return { ...input, status: 'racing', startedAt: now, deadline: now + FINALE_RULES.durationMs };
}

export function finalistFor(state: FinaleState, controller: FinaleController) {
  const finalist = state.finalists.find((entry) => entry.seat === controller.seat);

  if (!finalist) throw new GameError('not-finalist', 'Only surviving winning-faction seats can compete.');

  if (
    finalist.generation !== controller.generation ||
    controller.house !== (finalist.houseProfile !== null) ||
    (finalist.forfeited && !controller.house)
  )
    throw new GameError('controller-replaced', 'This controller no longer controls the finalist.');

  return finalist;
}

export function admitSubmission(
  input: FinaleState,
  controller: FinaleController,
  request: SubmissionRequest,
  fingerprint: string,
  now: number,
) {
  const finalist = finalistFor(input, controller);

  const previous = input.submissions.find(
    (entry) => entry.seat === controller.seat && entry.actionId === request.actionId,
  );

  if (previous) {
    if (previous.fingerprint !== fingerprint || previous.generation !== controller.generation)
      throw new GameError('action-id-conflict', 'A retry must contain the identical submission.');

    return { state: input, sequence: previous.sequence, duplicate: true };
  }

  if (input.status !== 'racing' || input.deadline === null || now >= input.deadline)
    throw new GameError('race-closed', 'The submission window is closed.');

  if (request.challengeId !== input.challengeId)
    throw new GameError('challenge-mismatch', 'This submission belongs to another challenge.');

  if (request.tier === 2 && finalist.tierOne === null)
    throw new GameError('tier-locked', 'Pass Tier 1 before accessing or submitting Tier 2.');

  if ((request.tier === 1 && finalist.tierOne !== null) || finalist.tierTwo !== null)
    throw new GameError('tier-complete', 'This tier has already been completed.');
  const attempts = input.submissions.filter((entry) => entry.seat === controller.seat);

  if (attempts.length >= FINALE_RULES.maxSubmissions)
    throw new GameError('attempt-limit', 'All ten formal submissions have been used.');

  if (attempts.some((entry) => entry.status === 'pending'))
    throw new GameError('submission-pending', 'Wait for the current submission to finish judging.');

  if (new TextEncoder().encode(request.program.source).byteLength > FINALE_RULES.maxSourceBytes)
    throw new GameError('source-too-large', 'Program source exceeds the byte limit.', 413);

  const state = structuredClone(input);
  const sequence = state.submissions.length + 1;
  state.submissions.push({
    sequence,
    actionId: request.actionId,
    seat: controller.seat,
    generation: controller.generation,
    tier: request.tier,
    fingerprint,
    receivedAt: now,
    status: 'pending',
    verdict: null,
  });

  return { state, sequence, duplicate: false };
}

export function recordVerdict(
  input: FinaleState,
  sequence: number,
  verdict: Verdict,
  now: number,
): FinaleState {
  const submission = input.submissions.find((entry) => entry.sequence === sequence);

  if (!submission) throw new GameError('unknown-submission', 'No such accepted submission.');

  if (submission.status === 'judged') {
    if (submission.verdict !== verdict)
      throw new GameError('judge-conflict', 'An immutable judge result changed.');

    return input;
  }

  if (submission.status === 'superseded' || input.status === 'interrupted' || input.status === 'finished')
    return input;

  if (now >= submission.receivedAt + FINALE_RULES.judgingGraceMs)
    return interruptFinale(input, 'An accepted submission exceeded the judge recovery deadline.');
  const state = structuredClone(input);
  const entry = state.submissions[sequence - 1];
  entry.status = 'judged';
  entry.verdict = verdict;
  const finalist = state.finalists.find((seat) => seat.seat === entry.seat)!;

  if (verdict === 'passed') {
    if (entry.tier === 1) finalist.tierOne = sequence;
    else finalist.tierTwo = sequence;
  }

  return advanceFinale(state, now);
}

function finish(
  state: FinaleState,
  winnerSeat: number,
  reason: NonNullable<FinaleState['result']>['reason'],
  submission: number | null,
) {
  const winner = state.finalists.find((seat) => seat.seat === winnerSeat)!;
  state.status = 'finished';
  state.result = { winnerSeat, credited: !winner.forfeited, reason, submission };

  return state;
}

export function advanceFinale(input: FinaleState, now: number): FinaleState {
  if (input.status === 'preparing' || input.status === 'finished' || input.status === 'interrupted')
    return input;
  const state = structuredClone(input);
  const complete = state.submissions.find((entry) => entry.tier === 2 && entry.verdict === 'passed');

  if (
    complete &&
    !state.submissions.some(
      (entry) => entry.status === 'pending' && entry.tier === 2 && entry.sequence < complete.sequence,
    )
  )
    return finish(state, complete.seat, 'tier-two', complete.sequence);

  if (state.deadline === null || now < state.deadline) return state;
  state.status = 'judging';

  if (state.submissions.some((entry) => entry.status === 'pending')) {
    if (now >= state.deadline + FINALE_RULES.judgingGraceMs)
      return interruptFinale(state, 'Accepted submissions could not be judged within the recovery window.');

    return state;
  }

  const easier = state.submissions.find((entry) => entry.tier === 1 && entry.verdict === 'passed');

  if (easier) return finish(state, easier.seat, 'tier-one', easier.sequence);
  const winnerSeat = state.priority.find((seat) => state.finalists.some((entry) => entry.seat === seat))!;

  return finish(state, winnerSeat, 'priority', null);
}

export function interruptFinale(input: FinaleState, reason: string): FinaleState {
  if (input.status === 'finished' || input.status === 'interrupted') return input;

  return { ...input, status: 'interrupted', interruptionReason: reason };
}

/** A takeover retains earned tiers and attempts but invalidates the old controller's pending work. */
export function replaceFinalist(input: FinaleState, seat: number, houseProfile: string, now: number) {
  if (input.status === 'finished' || input.status === 'interrupted') return input;
  const state = structuredClone(input);
  const finalist = state.finalists.find((entry) => entry.seat === seat);

  if (!finalist) throw new GameError('not-finalist', 'The seat did not qualify.');
  finalist.generation += 1;
  finalist.forfeited = true;
  finalist.houseProfile = houseProfile;

  for (const entry of state.submissions) {
    if (entry.seat === seat && entry.status === 'pending') entry.status = 'superseded';
  }

  return advanceFinale(state, now);
}

export function observeFinale(state: FinaleState, controller: FinaleController | null = null) {
  const you = controller ? finalistFor(state, controller) : null;
  const terminal = state.status === 'finished' || state.status === 'interrupted';

  return {
    id: state.id,
    rulesVersion: state.rulesVersion,
    challengeId: state.challengeId,
    status: state.status,
    startedAt: state.startedAt,
    deadline: state.deadline,
    result: state.result,
    interruptionReason: state.interruptionReason,
    commitment: state.commitment,
    priorityReveal: terminal ? { priority: state.priority, saltBase64url: state.commitmentSalt } : null,
    finalists: state.finalists.map((entry) => ({
      seat: entry.seat,
      forfeited: entry.forfeited,
      completedTier: entry.tierTwo !== null ? 2 : entry.tierOne !== null ? 1 : 0,
      attempts: state.submissions.filter((submission) => submission.seat === entry.seat).length,
    })),
    submissions: state.submissions.map((entry) => ({
      sequence: entry.sequence,
      seat: entry.seat,
      tier: entry.tier,
      receivedAt: entry.receivedAt,
      status: entry.status,
      verdict: entry.seat === you?.seat || terminal ? entry.verdict : null,
    })),
    you: you
      ? { seat: you.seat, generation: you.generation, unlockedTier: you.tierOne === null ? 1 : 2 }
      : null,
  };
}
