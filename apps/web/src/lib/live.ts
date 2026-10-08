import { toast } from '@atrium/ui';
import { useEffect } from 'react';
import { createStore } from './store';
import { queryClient } from './queries';

export interface PresenceEntry {
  userId: string;
  name: string;
  viewing: string | null;
  editing: string | null;
}

export const presence = createStore<{ people: PresenceEntry[]; connected: boolean }>({ people: [], connected: false });

let socket: WebSocket | null = null;
let lastViewing: string | null = null;

export function setViewing(id: string | null) {
  lastViewing = id;
  if (socket?.readyState === 1) socket.send(JSON.stringify({ type: 'presence', viewing: id }));
}

/** Keeps the app live: model changes by others refresh views; presence shows who's here. */
export function useLive(enabled: boolean, myName?: string) {
  useEffect(() => {
    if (!enabled) return;
    let closed = false;
    let retry = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['model'] });
        void queryClient.invalidateQueries({ queryKey: ['workspace'] });
      }, 150);
    };

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${proto}://${location.host}/api/v1/live`);
      socket.onopen = () => {
        retry = 1000;
        presence.set({ connected: true });
        setViewing(lastViewing);
      };
      socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'presence') presence.set({ people: msg.people });
          if (msg.type === 'model.changed') refresh();
          if (msg.type === 'changeset.updated') {
            void queryClient.invalidateQueries({ queryKey: ['changesets'] });
            if (msg.status === 'open' && msg.by !== myName) {
              toast(`${msg.by} suggested a change`, { description: msg.title });
            }
          }
        } catch {
          // ignore
        }
      };
      socket.onclose = () => {
        presence.set({ connected: false });
        if (closed) return;
        timer = setTimeout(connect, retry);
        retry = Math.min(retry * 2, 15000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      clearTimeout(refreshTimer);
      socket?.close();
      socket = null;
    };
  }, [enabled, myName]);
}
