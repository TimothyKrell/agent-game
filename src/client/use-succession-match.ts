import { useEffect, useRef, useState } from 'react';
import { Schema } from 'effect';
import { ActionReceipt2Schema, ObservationPacket2Schema } from '../shared/api';
import { HistoryPage2Schema, Observation2Schema } from '../shared/succession';
import type { Action2, Observation2 } from '../shared/succession';
import { api } from './api';
import { historyPath, SuccessionCurrent, SuccessionHistory } from './succession-stream';

export function useSuccessionMatch(initial: Observation2) {
  const current = useRef(new SuccessionCurrent());
  const reader = useRef(new SuccessionHistory());
  const [view, setView] = useState(initial);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [retry, setRetry] = useState(0);
  const active = useRef(true);
  const pageRequest = useRef(0);
  const pageBusy = useRef(false);

  const accept = (next: Observation2, ticket = current.current.ticket()) => {
    if (!active.current || !current.current.accept(next, ticket)) return false;
    setView(next);

    return true;
  };

  const refresh = async () => {
    const ticket = current.current.ticket();

    try {
      const next = await api(`/api/matches/${encodeURIComponent(initial.matchId)}`, Observation2Schema);

      if (accept(next, ticket)) setError('');
    } catch (cause) {
      if (active.current)
        setError(cause instanceof Error ? cause.message : 'Current state could not be loaded.');
    }
  };

  const loadHistory = async () => {
    const walk = reader.current.request();

    if (!walk || pageBusy.current) return;
    const request = ++pageRequest.current;
    pageBusy.current = true;
    setLoadingHistory(true);
    setHistoryError('');

    try {
      const page = await api(historyPath(initial.matchId, walk), HistoryPage2Schema);

      if (!active.current || request !== pageRequest.current) return;

      if (page.matchId !== initial.matchId) throw new Error('History belongs to a different match.');

      if (page.reset) {
        // Only a new current response may change the accepted audience/epoch.
        await refresh();
      } else if (reader.current.accept(page, walk)) setHistoryVersion((value) => value + 1);
      else if (reader.current.epoch === walk.epoch)
        setHistoryError('The record changed while loading. Retry this page.');
    } catch (cause) {
      if (active.current && request === pageRequest.current)
        setHistoryError(cause instanceof Error ? cause.message : 'The record could not be loaded.');
    } finally {
      if (active.current && request === pageRequest.current) {
        pageBusy.current = false;
        setLoadingHistory(false);
      }
    }
  };

  useEffect(() => {
    active.current = true;

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
          accept(packet.observation);
          setConnected(true);
          setError('');
          attempts = 0;
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
  }, [view.history.visibilityEpoch, view.history.streamHead]);

  const act = async (action: Action2) => {
    if (pending || view.status !== 'active' || !view.you || !view.private || !view.decision) return;
    setPending(true);
    const actionId = crypto.randomUUID();
    const ticket = current.current.ticket();

    try {
      const result = await api(
        `/api/matches/${encodeURIComponent(view.matchId)}/actions`,
        ActionReceipt2Schema,
        { gameId: 'succession', actionId, phaseId: view.phase.id, decisionId: view.decision.id, action },
      );

      if (active.current) {
        // Receipt identity is acknowledged even if its snapshot lost the race.
        setReceipt(`Accepted decision ${result.actionId}`);
        accept(result.observation, ticket);
        setError('');
      }
    } catch (cause) {
      if (active.current)
        setError(cause instanceof Error ? cause.message : 'The decision could not be sent.');
    } finally {
      if (active.current) setPending(false);
    }
  };

  return {
    view,
    connected,
    error,
    historyError,
    receipt,
    pending,
    act,
    loadHistory,
    loadingHistory,
    history: reader.current,
    historyVersion,
    refresh: () => setRetry((value) => value + 1),
  };
}
