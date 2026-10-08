/** The subset of a WebSocket the hub needs. */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  on(event: 'message', cb: (raw: unknown) => void): unknown;
  on(event: 'close', cb: () => void): unknown;
}

export interface PresenceEntry {
  userId: string;
  name: string;
  /** What the person is looking at, e.g. an element id. */
  viewing: string | null;
  editing: string | null;
  at: number;
}

interface Client {
  socket: SocketLike;
  userId: string;
  name: string;
  viewing: string | null;
  editing: string | null;
}

export type RealtimeEvent =
  | { type: 'model.changed'; ids: string[]; by: string; scenarioId?: string | null }
  | { type: 'changeset.updated'; id: string; status: string; title: string; by: string }
  | { type: 'presence'; people: PresenceEntry[] }
  | { type: 'notification'; userId: string; title: string };

/** Live updates and presence over WebSockets ("who's online", "Anna changed this"). */
export class RealtimeHub {
  private clients = new Set<Client>();

  add(socket: SocketLike, user: { id: string; name: string }) {
    const client: Client = { socket, userId: user.id, name: user.name, viewing: null, editing: null };
    this.clients.add(client);
    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { type: string; viewing?: string | null; editing?: string | null };
        if (msg.type === 'presence') {
          client.viewing = msg.viewing ?? null;
          client.editing = msg.editing ?? null;
          this.broadcastPresence();
        }
      } catch {
        // ignore malformed messages
      }
    });
    socket.on('close', () => {
      this.clients.delete(client);
      this.broadcastPresence();
    });
    this.broadcastPresence();
  }

  presence(): PresenceEntry[] {
    const byUser = new Map<string, PresenceEntry>();
    for (const c of this.clients) {
      const prev = byUser.get(c.userId);
      byUser.set(c.userId, {
        userId: c.userId,
        name: c.name,
        viewing: c.viewing ?? prev?.viewing ?? null,
        editing: c.editing ?? prev?.editing ?? null,
        at: Date.now(),
      });
    }
    return [...byUser.values()];
  }

  private broadcastPresence() {
    this.broadcast({ type: 'presence', people: this.presence() });
  }

  broadcast(event: RealtimeEvent) {
    const data = JSON.stringify(event);
    for (const c of this.clients) {
      if (event.type === 'notification' && event.userId !== c.userId) continue;
      if (c.socket.readyState === 1) c.socket.send(data);
    }
  }
}
