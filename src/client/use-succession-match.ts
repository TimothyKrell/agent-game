import { useEffect, useRef, useState } from 'react';
import { hashKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { Schema } from 'effect';
import { ActionReceipt2Schema, ObservationPacket2Schema } from '../shared/api';
import { HistoryPage2Schema, Observation2Schema } from '../shared/succession';
import type { Action2, ActionRequest2, Observation2 } from '../shared/succession';
import { api } from './api';
import { historyPath, SuccessionCurrent, SuccessionHistory } from './succession-stream';
import { matchReadKey, matchReadScope } from './succession-replay-data';
import type { MatchReadScope } from './succession-replay-data';

type SubmittedDecision = {
  request: ActionRequest2;
  scope: MatchReadScope;
  ticket: number;
  lifecycle: number;
};

const scopeIdentity = (view: Observation2) => hashKey(matchReadKey(matchReadScope(view)));

export function useSuccessionMatch(initial: Observation2) {
  const queryClient = useQueryClient();
  const current = useRef(new SuccessionCurrent());
  const reader = useRef(new SuccessionHistory());
  const [view, setView] = useState(initial);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [connected, setConnected] = useState(false);
  const [receipt, setReceipt] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [retry, setRetry] = useState(0);
  const active = useRef(true);
  const pageRequest = useRef(0);
  const pageBusy = useRef(false);
  const lifecycle = useRef(0);
  const currentRequest = useRef<AbortController | null>(null);
  const historyRequest = useRef<AbortController | null>(null);
  const submitted = useRef<SubmittedDecision | null>(null);

  const accept = (next: Observation2, ticket = current.current.ticket()) => {
    const previous = current.current.value;

    if (!active.current || !current.current.accept(next, ticket)) return false;

    if (previous && scopeIdentity(previous) !== scopeIdentity(next)) {
      const queryKey = matchReadKey(matchReadScope(previous));
      void queryClient.cancelQueries({ queryKey });
      queryClient.removeQueries({ queryKey });

      // Mask retired visibility before render. A same-epoch takeover still permits
      // this reader's delivered prefix; do not rewind it when retiring Query reads.
      if (previous.history.visibilityEpoch !== next.history.visibilityEpoch)
        reader.current = new SuccessionHistory();
      currentRequest.current?.abort();
      historyRequest.current?.abort();
      pageRequest.current++;
      pageBusy.current = false;
      setLoadingHistory(false);
      setHistoryError('');
      submitted.current = null;
      mutation.reset();
      setReceipt('');
    }

    setView(next);

    return true;
  };

  const refresh = async () => {
    const ticket = current.current.ticket();
    const life = lifecycle.current;
    currentRequest.current?.abort();
    const request = new AbortController();
    currentRequest.current = request;

    try {
      const next = await api(
        `/api/matches/${encodeURIComponent(initial.matchId)}`,
        Observation2Schema,
        undefined,
        { signal: request.signal },
      );

      if (life === lifecycle.current && accept(next, ticket)) setError('');
    } catch (cause) {
      if (
        active.current &&
        life === lifecycle.current &&
        ticket === current.current.ticket() &&
        !request.signal.aborted
      )
        setError(cause instanceof Error ? cause.message : 'Current state could not be loaded.');
    }
  };

  const loadHistory = async () => {
    const walk = reader.current.request();

    if (!walk || pageBusy.current) return;
    const request = ++pageRequest.current;
    const life = lifecycle.current;
    const controller = new AbortController();
    historyRequest.current = controller;
    pageBusy.current = true;
    setLoadingHistory(true);
    setHistoryError('');

    try {
      const page = await api(historyPath(initial.matchId, walk), HistoryPage2Schema, undefined, {
        signal: controller.signal,
      });

      if (!active.current || life !== lifecycle.current || request !== pageRequest.current) return;

      if (page.matchId !== initial.matchId) throw new Error('History belongs to a different match.');

      if (page.reset) {
        // Only a new current response may change the accepted audience/epoch.
        setHistoryError('The record visibility changed. Retry loading this page after the current update.');
        await refresh();
      } else if (reader.current.accept(page, walk)) setHistoryVersion((value) => value + 1);
      else if (reader.current.epoch === walk.epoch)
        setHistoryError('The record changed while loading. Retry this page.');
    } catch (cause) {
      if (
        active.current &&
        life === lifecycle.current &&
        request === pageRequest.current &&
        !controller.signal.aborted
      )
        setHistoryError(cause instanceof Error ? cause.message : 'The record could not be loaded.');
    } finally {
      if (active.current && life === lifecycle.current && request === pageRequest.current) {
        pageBusy.current = false;
        setLoadingHistory(false);
      }
    }
  };

  const owns = (decision: SubmittedDecision | undefined) =>
    !!decision &&
    active.current &&
    decision.lifecycle === lifecycle.current &&
    hashKey(matchReadKey(decision.scope)) === scopeIdentity(current.current.value ?? initial);

  const mutation = useMutation({
    retry: false,
    gcTime: 0,
    networkMode: 'always',
    mutationFn: async (decision: SubmittedDecision) => {
      const result = await api(
        `/api/matches/${encodeURIComponent(decision.scope.matchId)}/actions`,
        ActionReceipt2Schema,
        decision.request,
      );

      if (
        result.actionId !== decision.request.actionId ||
        result.observation.matchId !== decision.scope.matchId
      )
        throw new Error('The decision receipt does not match this submission.');

      return result;
    },
    onSuccess: (result, decision) => {
      if (!owns(decision)) return;
      // Acknowledgment is independent of acceptance of the receipt's older snapshot.
      setReceipt(`Accepted decision ${result.actionId}`);

      if (accept(result.observation, decision.ticket)) setError('');
    },
    onSettled: (_data, _error, decision) => {
      if (submitted.current === decision) submitted.current = null;
    },
  });

  useEffect(() => {
    active.current = true;
    lifecycle.current++;
    setConnected(false);
    setLoadingHistory(false);

    if (!current.current.value) accept(initial);
    let closed = false;
    let socket: WebSocket | null = null;
    let reconnect: ReturnType<typeof setTimeout>;
    let attempts = 0;
    let connection = 0;

    const connect = () => {
      if (closed) return;
      const generation = ++connection;

      const url = new URL(
        `/api/matches/${encodeURIComponent(initial.matchId)}/events?protocol=2`,
        location.href,
      );

      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(url);
      socket = ws;
      ws.onmessage = (event) => {
        if (closed || generation !== connection || event.data === 'pong') return;

        try {
          const packet = Schema.decodeUnknownSync(ObservationPacket2Schema)(JSON.parse(event.data));

          if (accept(packet.observation)) {
            setConnected(true);
            setError('');
            attempts = 0;
          }
        } catch {
          setError('A current-state update could not be read. Reconnecting…');
          ws.close();
        }
      };

      ws.onclose = () => {
        if (closed || generation !== connection) return;
        setConnected(false);
        reconnect = setTimeout(connect, Math.min(10_000, 500 * 2 ** attempts++));
      };

      ws.onerror = () => {
        if (!closed && generation === connection)
          setError('Connection interrupted. Last known state shown; retrying automatically.');
      };
    };

    connect();

    if (retry) void refresh();

    const heartbeat = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send('ping');
    }, 20_000);

    return () => {
      closed = true;
      connection++;
      active.current = false;
      lifecycle.current++;
      submitted.current = null;
      currentRequest.current?.abort();
      historyRequest.current?.abort();
      pageRequest.current++;
      pageBusy.current = false;
      clearTimeout(reconnect);
      clearInterval(heartbeat);
      socket?.close();
    };
  }, [initial.matchId, retry]);

  useEffect(() => {
    const history = reader.current;
    const changedEpoch = history.epoch !== view.history.visibilityEpoch;
    const caughtUp = history.cursor === history.head;
    history.observe(view.history);

    if (changedEpoch) {
      pageRequest.current++;
      pageBusy.current = false;
      setLoadingHistory(false);
    }

    setHistoryVersion((value) => value + 1);

    // One bounded page per notification; older backlog requires explicit reading.
    if (changedEpoch || (caughtUp && view.status === 'active')) void loadHistory();
  }, [view.history.visibilityEpoch, view.history.streamHead, scopeIdentity(view)]);

  const act = async (action: Action2) => {
    const accepted = current.current.value;

    if (
      submitted.current ||
      !active.current ||
      !accepted ||
      accepted.status !== 'active' ||
      !accepted.you ||
      !accepted.private ||
      !accepted.decision
    )
      return;
    const actionId = crypto.randomUUID();

    const decision: SubmittedDecision = {
      request: {
        gameId: 'succession',
        actionId,
        phaseId: accepted.phase.id,
        decisionId: accepted.decision.id,
        action,
      },
      scope: matchReadScope(accepted),
      ticket: current.current.ticket(),
      lifecycle: lifecycle.current,
    };

    submitted.current = decision;
    // The hook presents failure through its existing error interface; never replay a command offline.
    await mutation.mutateAsync(decision).catch(() => {});
  };

  return {
    view,
    connected,
    error: owns(mutation.variables) && mutation.error ? mutation.error.message : error,
    historyError,
    receipt,
    pending: owns(mutation.variables) && mutation.isPending,
    act,
    loadHistory,
    loadingHistory,
    history: reader.current,
    historyVersion,
    refresh: () => {
      mutation.reset();
      setRetry((value) => value + 1);
    },
  };
}
