/** Development-only source capture adapter. Public checkpoint facts are read forward, never from final life/resources/hands. */
import { Schema } from 'effect';
import capture from '../../src/client/succession-replay-record.prototype.json';
import { AuthorizedEvent2Schema, Observation2Schema } from '../../src/shared/succession';
import type { Observation2 } from '../../src/shared/succession';
import { readStoryFact } from '../../src/client/succession-story-events';
import { buildSuccessionStory } from '../../src/client/succession-story';

export const capturedEvents = Schema.decodeUnknownSync(Schema.Array(AuthorizedEvent2Schema))(capture.events);

export const capturedCurrent = Schema.decodeUnknownSync(Observation2Schema)(capture.current);

const initialTracks = {
  safeguards: 0,
  overrides: 0,
  electionTracker: 0,
  drawCount: 17,
  discardCount: 0,
  vetoUnlocked: false,
};

export function capturedStory(start: number, through: number) {
  const after = start - 1;
  const baseline: Observation2 = structuredClone(capturedCurrent);
  baseline.history.streamHead = 0;
  baseline.status = 'active';
  baseline.finishedAt = null;
  baseline.result = null;
  baseline.act1Result = null;
  baseline.private = null;
  baseline.you = null;
  baseline.decision = null;
  baseline.act = 1;
  baseline.phase = {
    id: 'captured-initial',
    kind: 'nomination-discussion',
    deadline: null,
    graceUntil: null,
  };
  baseline.commitment.reveal = null;
  baseline.board = {
    act: 1,
    coordinator: 0,
    executor: null,
    power: null,
    tracks: { ...initialTracks },
    lastGovernment: null,
  };
  baseline.seats = capturedCurrent.seats.map((seat) => ({
    number: seat.number,
    agentId: seat.agentId,
    ownerId: seat.ownerId,
    name: seat.name,
    originalHouse: seat.originalHouse,
    house: seat.originalHouse,
    generation: 0,
    forfeited: false,
    alive: true,
    rating: seat.rating,
  }));

  for (const event of capturedEvents) {
    if (event.id > after) break;
    const fact = readStoryFact(event);
    const board = baseline.board;
    baseline.history.streamHead = event.id;

    switch (fact.kind) {
      case 'phase':
        if (board.act === 1) {
          if (fact.coordinator !== undefined) board.coordinator = fact.coordinator;

          if (fact.executor !== undefined) board.executor = fact.executor;
        } else {
          if (fact.activeSeat !== undefined) board.activeSeat = fact.activeSeat;

          if (fact.slot !== undefined) board.slot = fact.slot;
          board.tableRound = event.round;
        }

        break;
      case 'election':
        if (board.act === 1 && fact.approved)
          board.lastGovernment = { coordinator: fact.coordinator, executor: fact.executor };
        break;
      case 'policy':
        if (board.act === 1)
          board.tracks = {
            ...board.tracks,
            safeguards: fact.safeguards,
            overrides: fact.overrides,
            electionTracker: 0,
            vetoUnlocked: fact.overrides >= 5,
          };
        break;
      case 'tracker':
        if (board.act === 1) board.tracks.electionTracker = fact.tracker;
        break;
      case 'execution':
        baseline.seats[fact.target].alive = false;
        break;
      case 'act-started':
        baseline.act = 2;
        baseline.act1Result = {
          team: fact.team,
          reason: fact.reason,
          roles: [...fact.roles],
          returnedSeats: [...fact.returnedSeats],
          bonuses: [...fact.bonuses],
          finalTracks: { ...capturedCurrent.act1Result!.finalTracks },
        };
        baseline.phase.kind = 'act-2:discussion';
        baseline.board = {
          act: 2,
          firstSeat: fact.firstSeat,
          activeSeat: fact.firstSeat,
          tableRound: 1,
          slot: 0,
          roundCap: 12,
          courtCount: 5,
          pending: null,
        };
        baseline.seats.forEach((seat, index) => {
          seat.alive = true;
          seat.role = fact.roles[index];
          seat.coins = 2 + fact.bonuses[index];
          seat.influence = 2;
          seat.revealed = [];
        });
        break;
      case 'declaration':
        if (board.act === 2)
          board.pending = {
            actor: fact.actor,
            action: fact.action.type,
            target: fact.action.target ?? null,
            claim: fact.claim,
            paid: fact.payment,
            block: null,
          };

        if (baseline.seats[fact.actor].coins !== undefined) baseline.seats[fact.actor].coins! -= fact.payment;
        break;
      case 'block':
        if (board.act === 2 && board.pending && event.seat !== undefined)
          board.pending.block = { seat: event.seat, capability: fact.capability };
        break;
      case 'coins':
        if (event.seat !== undefined) baseline.seats[event.seat].coins = fact.coins;
        break;
      case 'influence-lost':
        if (event.seat !== undefined) {
          const seat = baseline.seats[event.seat];
          seat.influence = (seat.influence ?? 2) - 1;
          seat.alive = !fact.eliminated;
          seat.revealed?.push(fact.capability);
        }

        break;
      case 'turn-ended':
        if (board.act === 2) board.pending = null;
        break;
      default:
        break;
    }
  }

  return buildSuccessionStory({
    scope: { matchId: baseline.matchId, visibilityEpoch: baseline.history.visibilityEpoch },
    after,
    through,
    baseline,
    current: capturedCurrent,
    events: capturedEvents.filter((event) => event.id >= start && event.id <= through),
  });
}

export const dossierRecordedExamples = [
  { id: 'election', title: 'Nomination, dialogue, ballots, policy & investigation', start: 26, through: 79 },
  { id: 'chaos', title: 'Rejected governments & election chaos', start: 170, through: 215 },
  { id: 'return', title: 'Act I bonuses, all ten return & fresh cards', start: 962, through: 974 },
  { id: 'exchange', title: 'Exchange, proved claim & failed challenge', start: 987, through: 1031 },
  { id: 'bluff', title: 'Theft claim disproved & elimination', start: 1041, through: 1068 },
  { id: 'income', title: 'Income', start: 1109, through: 1112 },
  { id: 'tax', title: 'Tax & a proved Treasurer', start: 1227, through: 1260 },
  { id: 'unchallenged', title: 'Unchallenged Exchange & private return', start: 1336, through: 1364 },
  { id: 'failed-block', title: 'Theft, disproved Thief block & coin transfer', start: 1680, through: 1734 },
  {
    id: 'assassination',
    title: 'Assassination, Guard block & proof replacement',
    start: 1854,
    through: 1900,
  },
  { id: 'envoy-block', title: 'Theft blocked with Envoy', start: 1908, through: 1950 },
  { id: 'final-coup', title: 'Mandatory Coup, loss & match victory', start: 2006, through: 2016 },
];
