import { useCallback, useEffect, useRef, useState } from 'react';
import { Schema } from 'effect';
import { ActionReceipt3Schema, Observation3Schema, ObservationPacket3Schema } from '../shared/coding-finale';
import type { Action3, ActionRequest3, Observation3 } from '../shared/coding-finale';
import {
  HistoryCheckpoint3Schema,
  HistoryPage3Schema,
  RoundIndex3Schema,
} from '../shared/coding-finale-history';
import type { HistoryCheckpoint3, RoundIndex3 } from '../shared/coding-finale-history';
import type { AuthorizedEvent2 } from '../shared/succession';
import { api } from './api';

function controllerKey(view: Observation3) {
  return [view.matchId, view.you?.agentId, view.you?.seat, view.you?.generation, view.you?.forfeited].join(
    ':',
  );
}

/** This reader owns Act I only; coding receipts have their own race record. */
function actOneHead(view: Observation3, rounds: RoundIndex3['rounds']) {
  if (view.act === 1) return view.history.streamHead;
  const start = rounds.find((round) => round.act === 2)?.through;

  return start === undefined ? null : Math.max(0, start - 1);
}

function canAdvance(current: Observation3, next: Observation3) {
  if (next.matchId !== current.matchId || next.protocolVersion !== '3') return false;

  if (current.status !== 'active' && next.status !== current.status) return false;

  if (next.act < current.act) return false;

  if (
    current.history.visibilityEpoch === next.history.visibilityEpoch &&
    next.history.streamHead < current.history.streamHead
  )
    return false;

  return !current.seats.some((seat) => {
    const incoming = next.seats.find((candidate) => candidate.number === seat.number);

    return !incoming || incoming.generation < seat.generation || (seat.forfeited && !incoming.forfeited);
  });
}

export function useCodingFinaleMatch(initial: Observation3) {
  const [view, setView] = useState(initial);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [historyGeneration, setHistoryGeneration] = useState(0);
  const [historyRetryGeneration, setHistoryRetryGeneration] = useState(0);

  const [history, setHistory] = useState<{
    epoch: string;
    after: number;
    through: number;
    events: AuthorizedEvent2[];
    checkpoint: HistoryCheckpoint3 | null;
    actOneSnapshot: Observation3 | null;
    rounds: RoundIndex3['rounds'];
    loading: boolean;
    error: string;
    following: boolean;
  }>({
    epoch: initial.history.visibilityEpoch,
    after: 0,
    through: 0,
    events: [],
    checkpoint: null,
    actOneSnapshot: initial.actOne ? initial : null,
    rounds: [],
    loading: true,
    error: '',
    following: true,
  });

  const current = useRef(initial);
  const visibleHistory = useRef(history);
  visibleHistory.current = history;
  const followLive = useRef(true);

  const historyRequest = useRef<{
    ticket: number;
    epoch: string;
    follow: boolean;
    controller: AbortController;
  } | null>(null);

  const lifecycle = useRef(0);
  const historyTicket = useRef(0);
  const retry = useRef<{ fingerprint: string; request: ActionRequest3 } | null>(null);

  const accept = (next: Observation3) => {
    if (!canAdvance(current.current, next)) return false;
    current.current = next;
    setView(next);

    return true;
  };

  const refresh = async () => {
    const life = lifecycle.current;

    try {
      const next = await api(`/api/matches/${encodeURIComponent(initial.matchId)}`, Observation3Schema);

      if (life === lifecycle.current && accept(next)) setError('');
    } catch (cause) {
      if (life === lifecycle.current)
        setError(cause instanceof Error ? cause.message : 'Current state could not be loaded.');
    }
  };

  useEffect(() => {
    const life = ++lifecycle.current;
    let closed = false;
    let socket: WebSocket | null = null;
    let reconnect: ReturnType<typeof setTimeout>;
    let attempts = 0;

    const connect = () => {
      if (closed) return;

      const url = new URL(
        `/api/matches/${encodeURIComponent(initial.matchId)}/events?protocol=3`,
        location.href,
      );

      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(url);
      socket.onmessage = (event) => {
        if (closed || life !== lifecycle.current || event.data === 'pong') return;

        try {
          const packet = Schema.decodeUnknownSync(ObservationPacket3Schema)(JSON.parse(event.data));

          if (accept(packet.observation)) {
            setConnected(true);
            setError('');
            attempts = 0;
          }
        } catch {
          setError('A current-state update could not be read. Reconnecting…');
          socket?.close();
        }
      };

      socket.onclose = () => {
        if (closed || life !== lifecycle.current) return;
        setConnected(false);
        reconnect = setTimeout(connect, Math.min(10_000, 500 * 2 ** attempts++));
      };

      socket.onerror = () => {
        if (!closed) setError('Connection interrupted. Last known state shown; retrying automatically.');
      };
    };

    connect();

    const heartbeat = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send('ping');
    }, 20_000);

    return () => {
      closed = true;
      lifecycle.current++;
      historyTicket.current++;
      historyRequest.current?.controller.abort();
      historyRequest.current = null;
      clearTimeout(reconnect);
      clearInterval(heartbeat);
      socket?.close();
    };
  }, [initial.matchId]);

  const resetHistory = useCallback(() => {
    historyTicket.current++;
    historyRequest.current?.controller.abort();
    historyRequest.current = null;
    followLive.current = true;
    setHistoryGeneration((value) => value + 1);
    setHistory((state) => ({
      ...state,
      epoch: current.current.history.visibilityEpoch,
      after: 0,
      through: 0,
      events: [],
      checkpoint: null,
      actOneSnapshot: current.current.actOne ? current.current : null,
      rounds: [],
      loading: true,
      error: 'Record visibility changed. Reloading the authorized view…',
      following: true,
    }));
    void refresh();
  }, []);

  const loadHistory = useCallback(
    async (requestedThrough: number, follow = false) => {
      const observed = current.current;
      const epoch = observed.history.visibilityEpoch;

      const head = actOneHead(
        observed,
        visibleHistory.current.epoch === epoch ? visibleHistory.current.rounds : [],
      );

      if (head === null) return;
      const through = Math.max(0, Math.min(requestedThrough, head));
      const after = Math.max(0, through - 128);

      if (follow && historyRequest.current?.follow && historyRequest.current.epoch === epoch) return;

      historyRequest.current?.controller.abort();
      const ticket = ++historyTicket.current;
      const request = new AbortController();
      historyRequest.current = { ticket, epoch, follow, controller: request };
      const previous = visibleHistory.current;
      const reusable = previous.epoch === epoch && previous.after <= after && previous.through <= through;
      let completed = false;

      setHistory((state) => {
        const retained =
          state.epoch === epoch
            ? state
            : {
                ...state,
                after: 0,
                through: 0,
                events: [],
                checkpoint: null,
                actOneSnapshot: null,
                rounds: [],
              };

        return { ...retained, epoch, loading: true, error: '', following: follow };
      });

      try {
        const checkpointQuery = new URLSearchParams({ epoch, through: String(after) });

        const checkpoint =
          previous.epoch === epoch && previous.after === after && previous.checkpoint
            ? previous.checkpoint
            : await api(
                `/api/matches/${encodeURIComponent(observed.matchId)}/${observed.status === 'active' ? 'checkpoint' : 'replay'}?${checkpointQuery}`,
                Schema.Union([HistoryCheckpoint3Schema, HistoryPage3Schema]),
                undefined,
                { signal: request.signal },
              );

        if ('reset' in checkpoint) {
          resetHistory();

          return;
        }

        if (
          checkpoint.matchId !== observed.matchId ||
          checkpoint.visibilityEpoch !== epoch ||
          checkpoint.through !== after
        )
          throw new Error('The historical baseline does not match this reading window.');

        const events: AuthorizedEvent2[] = reusable
          ? previous.events.filter((event) => event.id > after)
          : [];

        let cursor = reusable ? Math.max(after, previous.through) : after;

        while (cursor < through) {
          const query = new URLSearchParams({
            epoch,
            after: String(cursor),
            through: String(through),
            limit: '32',
            maxBytes: '16384',
          });

          const page = await api(
            `/api/matches/${encodeURIComponent(observed.matchId)}/history?${query}`,
            HistoryPage3Schema,
            undefined,
            { signal: request.signal },
          );

          if (page.reset) {
            resetHistory();

            return;
          }

          if (
            page.matchId !== observed.matchId ||
            page.visibilityEpoch !== epoch ||
            page.after !== cursor ||
            page.through !== through ||
            page.cursor <= cursor ||
            page.events.length > 32
          )
            throw new Error('The match record page is incomplete or out of order.');
          events.push(...page.events);
          cursor = page.cursor;
        }

        if (events.length > 128) throw new Error('The match record exceeded its 128-row reading bound.');

        if (ticket !== historyTicket.current || current.current.history.visibilityEpoch !== epoch) return;

        if (follow && !followLive.current) {
          setHistory((state) => ({ ...state, loading: false }));

          return;
        }

        completed = true;
        setHistory((state) => ({ ...state, epoch, after, through, events, checkpoint, loading: false }));
      } catch (cause) {
        if (request.signal.aborted || ticket !== historyTicket.current) return;
        setHistory((state) => ({
          ...state,
          loading: false,
          error: cause instanceof Error ? cause.message : 'The selected match record could not be loaded.',
        }));
      } finally {
        if (historyRequest.current?.ticket === ticket) historyRequest.current = null;

        const latestHead = actOneHead(current.current, visibleHistory.current.rounds);

        if (completed && follow && followLive.current && latestHead !== null && latestHead > through) {
          setHistoryGeneration((value) => value + 1);
        }
      }
    },
    [resetHistory],
  );

  const historyHead = actOneHead(view, history.epoch === view.history.visibilityEpoch ? history.rounds : []);

  useEffect(() => {
    if (history.epoch !== view.history.visibilityEpoch) followLive.current = true;
    setHistory((state) => {
      if (state.epoch === view.history.visibilityEpoch) return state;

      return {
        ...state,
        epoch: view.history.visibilityEpoch,
        after: 0,
        through: 0,
        events: [],
        checkpoint: null,
        actOneSnapshot: view.actOne ? view : null,
        rounds: [],
        following: true,
      };
    });

    if (historyHead !== null && (history.following || history.epoch !== view.history.visibilityEpoch))
      void loadHistory(historyHead, true);
  }, [
    view.history.streamHead,
    view.history.visibilityEpoch,
    historyHead,
    history.following,
    history.epoch,
    historyGeneration,
    loadHistory,
  ]);

  useEffect(() => {
    const request = new AbortController();
    const epoch = view.history.visibilityEpoch;
    const query = new URLSearchParams({ epoch });

    void api(
      `/api/matches/${encodeURIComponent(view.matchId)}/rounds?${query}`,
      Schema.Union([RoundIndex3Schema, HistoryPage3Schema]),
      undefined,
      { signal: request.signal },
    )
      .then(async (result) => {
        if ('reset' in result) resetHistory();
        else if (result.matchId === view.matchId && result.visibilityEpoch === epoch) {
          setHistory((state) => (state.epoch === epoch ? { ...state, rounds: result.rounds } : state));

          const actTwoStart = result.rounds.find((round) => round.act === 2)?.through;

          if (view.act === 2 && actTwoStart !== undefined && actTwoStart > 0) {
            const through = actTwoStart - 1;
            const snapshotQuery = new URLSearchParams({ epoch, through: String(through) });

            const snapshot = await api(
              `/api/matches/${encodeURIComponent(view.matchId)}/${view.status === 'active' ? 'checkpoint' : 'replay'}?${snapshotQuery}`,
              Schema.Union([HistoryCheckpoint3Schema, HistoryPage3Schema]),
              undefined,
              { signal: request.signal },
            );

            if ('reset' in snapshot) resetHistory();
            else if (
              snapshot.matchId === view.matchId &&
              snapshot.visibilityEpoch === epoch &&
              snapshot.through === through &&
              snapshot.baseline?.actOne
            )
              setHistory((state) =>
                state.epoch === epoch ? { ...state, actOneSnapshot: snapshot.baseline } : state,
              );
          }
        }
      })
      .catch((cause) => {
        if (!request.signal.aborted)
          setHistory((state) => ({
            ...state,
            error: cause instanceof Error ? cause.message : 'Round navigation could not be loaded.',
          }));
      });

    return () => request.abort();
  }, [
    view.matchId,
    view.history.visibilityEpoch,
    view.act,
    view.status,
    resetHistory,
    historyRetryGeneration,
  ]);

  const act = async (action: Action3) => {
    const accepted = current.current;

    if (pending || accepted.status !== 'active' || !accepted.you) return;
    const owner = controllerKey(accepted);

    const fingerprint = JSON.stringify([accepted.matchId, accepted.phase.id, accepted.decision?.id, action]);

    const request: ActionRequest3 =
      retry.current?.fingerprint === fingerprint
        ? retry.current.request
        : {
            gameId: 'coding-finale',
            phaseId: accepted.phase.id,
            decisionId: accepted.decision?.id,
            actionId: crypto.randomUUID(),
            action,
          };

    retry.current = { fingerprint, request };

    setPending(true);

    try {
      const receipt = await api(
        `/api/matches/${encodeURIComponent(accepted.matchId)}/actions`,
        ActionReceipt3Schema,
        request,
      );

      if (receipt.actionId !== request.actionId || receipt.observation.matchId !== accepted.matchId)
        throw new Error('The action receipt does not match this submission.');

      retry.current = null;

      if (controllerKey(current.current) === owner) accept(receipt.observation);
    } catch (cause) {
      if (controllerKey(current.current) === owner)
        setError(cause instanceof Error ? cause.message : 'The action could not be submitted.');
    } finally {
      setPending(false);
    }
  };

  return {
    view,
    connected,
    error,
    pending,
    act,
    refresh,
    history: {
      ...history,
      head: historyHead ?? 0,
      events: history.epoch === view.history.visibilityEpoch ? history.events : [],
      checkpoint: history.epoch === view.history.visibilityEpoch ? history.checkpoint : null,
      actOneSnapshot: history.epoch === view.history.visibilityEpoch ? history.actOneSnapshot : null,
      rounds: history.epoch === view.history.visibilityEpoch ? history.rounds : [],
      retry: () => {
        setHistoryRetryGeneration((value) => value + 1);

        return loadHistory(history.following ? (historyHead ?? 0) : history.through, history.following);
      },
      loadEarlier: () => {
        followLive.current = false;

        return loadHistory(Math.min(history.through - 1, history.after + 64), false);
      },
      loadLater: () => loadHistory(Math.min(historyHead ?? 0, history.through + 64), false),
      loadLatest: () => {
        followLive.current = true;

        return loadHistory(historyHead ?? 0, true);
      },
      setFollowing: (following: boolean) => {
        followLive.current = following;
        setHistory((state) => (state.following === following ? state : { ...state, following }));
      },
      loadRound: (through: number) => loadHistory(Math.min(historyHead ?? 0, through + 127), false),
    },
  };
}
