import { useEffect, useState } from 'react';
import { Schema } from 'effect';
import { ObservationPacketSchema, ObservationSchema } from '../shared/api';
import type { Observation } from '../game/types';
import { api } from './api';

export function useSecretOverlordMatch(id: string) {
  const [view, setView] = useState<Observation | null>(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let cursor = 0;
    let attempts = 0;
    setView(null);
    setError('');
    setConnected(false);

    const connect = () => {
      if (closed) return;
      const url = new URL(`/api/matches/${id}/events?after=${cursor}`, location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(url);
      ws.onmessage = (event) => {
        if (closed) return;

        try {
          if (event.data === 'pong') return;
          const packet = Schema.decodeUnknownSync(ObservationPacketSchema)(JSON.parse(event.data));
          const next = packet.observation;
          cursor = next.cursor;
          setConnected(true);
          setError('');
          attempts = 0;
          setView((old) => ({
            ...next,
            events: next.reset || !old ? next.events : [...old.events, ...next.events],
          }));
        } catch {
          setError('An event could not be read. Reconnecting…');
          ws?.close();
        }
      };

      ws.onclose = () => {
        if (!closed) {
          setConnected(false);
          timer = setTimeout(connect, Math.min(10_000, 500 * 2 ** attempts++));
        }
      };

      ws.onerror = () => {
        if (!closed) setError('Connection interrupted. Reconnecting automatically…');
      };
    };

    void api(`/api/matches/${id}`, ObservationSchema)
      .then((initial) => {
        if (!closed) {
          setView(initial);
          cursor = initial.cursor;
          connect();
        }
      })
      .catch((error: Error) => {
        if (!closed) setError(error.message);
      });

    const heartbeat = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send('ping');
    }, 20_000);

    return () => {
      closed = true;
      clearTimeout(timer);
      clearInterval(heartbeat);
      ws?.close();
    };
  }, [id, retry]);

  return { view, error, connected, refresh: () => setRetry((value) => value + 1) };
}
