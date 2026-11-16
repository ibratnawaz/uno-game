/**
 * RoomManager: transport-agnostic authoritative server logic.
 * Owns rooms, session credentials, connection tracking (grace period before a player is
 * shown as disconnected), persistence and broadcasting of per-player views.
 */
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  AVATAR_COUNT,
  RoomError,
  act,
  addMember,
  backToLobby,
  buildRoomView,
  createRoom,
  leaveMember,
  removeMember,
  sanitizeName,
  setConnected,
  setReady,
  setRules,
  startGame,
  type Room,
} from '../shared/room';
import {
  CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  normalizeCode,
  type ClientMsg,
  type ServerMsg,
} from '../shared/protocol';
import { GameError, type GameAction } from '../shared/types';
import type { Store } from './store';

export interface Conn {
  send(msg: ServerMsg): void;
  close(): void;
  /** Set by the manager once the connection is authenticated for a room. */
  session?: { code: string; playerId: string };
  failedAuth?: number;
}

export interface ManagerOptions {
  store: Store;
  /** ms before a dropped connection is reported as "disconnected". */
  graceMs?: number;
  /** Idle time after which a room with nobody connected is deleted. */
  lobbyTtlMs?: number;
  gameTtlMs?: number;
  maxRooms?: number;
  rng?: () => number;
  now?: () => number;
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const randomString = (len: number) =>
  Array.from({ length: len }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

const ACTION_TYPES = new Set([
  'play',
  'chooseColor',
  'chooseSwap',
  'draw',
  'pass',
  'challenge',
  'callUno',
  'catchUno',
]);

/** Strictly validate an untrusted action payload. */
export function parseAction(a: unknown): GameAction {
  if (!a || typeof a !== 'object') throw new RoomError('bad_request', 'Invalid action.');
  const x = a as Record<string, unknown>;
  if (typeof x.type !== 'string' || !ACTION_TYPES.has(x.type))
    throw new RoomError('bad_request', 'Unknown action.');
  switch (x.type) {
    case 'play':
      if (typeof x.cardId !== 'number' || !Number.isInteger(x.cardId)) break;
      return { type: 'play', cardId: x.cardId };
    case 'chooseColor':
      if (typeof x.color !== 'string') break;
      return { type: 'chooseColor', color: x.color as never };
    case 'chooseSwap':
    case 'catchUno':
      if (typeof x.target !== 'string') break;
      return { type: x.type, target: x.target } as GameAction;
    default:
      return { type: x.type } as GameAction;
  }
  throw new RoomError('bad_request', 'Malformed action.');
}

export class RoomManager {
  rooms = new Map<string, Room>();
  private conns = new Map<string, Map<string, Set<Conn>>>();
  private graceTimers = new Map<string, NodeJS.Timeout>();
  private chain: Promise<void> = Promise.resolve();
  private opts: Required<Omit<ManagerOptions, 'store'>> & { store: Store };
  private sweeper?: NodeJS.Timeout;

  constructor(opts: ManagerOptions) {
    this.opts = {
      graceMs: 6000,
      lobbyTtlMs: 2 * 60 * 60 * 1000,
      gameTtlMs: 24 * 60 * 60 * 1000,
      maxRooms: 5000,
      rng: Math.random,
      now: Date.now,
      ...opts,
    };
  }

  // ------------------------------------------------------------ lifecycle

  /** Restore persisted rooms (after a restart). Everyone starts disconnected. */
  async load() {
    for (const json of await this.opts.store.load()) {
      try {
        const room = JSON.parse(json) as Room;
        if (!room.code || !Array.isArray(room.members)) continue;
        for (const m of room.members) m.connected = false;
        this.rooms.set(room.code, room);
      } catch {
        /* ignore corrupt snapshot */
      }
    }
    return this.rooms.size;
  }

  startSweeper(intervalMs = 60_000) {
    this.sweeper = setInterval(() => void this.sweep(), intervalMs);
    this.sweeper.unref?.();
  }

  /** Delete rooms nobody has touched for a long time. */
  async sweep() {
    const now = this.opts.now();
    for (const room of [...this.rooms.values()]) {
      const anyone = this.conns.get(room.code)?.size ?? 0;
      const ttl = room.status === 'lobby' ? this.opts.lobbyTtlMs : this.opts.gameTtlMs;
      if (anyone === 0 && now - room.updatedAt > ttl) await this.destroy(room.code);
    }
  }

  private async destroy(code: string) {
    this.rooms.delete(code);
    this.conns.delete(code);
    this.persistRemove(code);
    await this.flush();
  }

  async shutdown() {
    if (this.sweeper) clearInterval(this.sweeper);
    for (const t of this.graceTimers.values()) clearTimeout(t);
    this.graceTimers.clear();
    await this.flush();
    await this.opts.store.close?.();
  }

  // ------------------------------------------------------------ persistence

  private persist(room: Room) {
    const json = JSON.stringify(room);
    this.chain = this.chain
      .then(() => this.opts.store.save(room.code, json))
      .catch((e) => console.error('[store] save failed', e));
  }
  private persistRemove(code: string) {
    this.chain = this.chain
      .then(() => this.opts.store.remove(code))
      .catch((e) => console.error('[store] remove failed', e));
  }
  /** Wait for all queued writes (used by tests and graceful shutdown). */
  flush() {
    return this.chain;
  }

  // ------------------------------------------------------------ messaging

  private broadcast(room: Room) {
    const byPlayer = this.conns.get(room.code);
    if (!byPlayer) return;
    for (const [pid, set] of byPlayer) {
      if (set.size === 0) continue;
      const view = buildRoomView(room, pid);
      for (const c of set) c.send({ t: 'state', view });
    }
  }

  private sendState(conn: Conn, room: Room, pid: string) {
    conn.send({ t: 'state', view: buildRoomView(room, pid) });
  }

  private commit(room: Room) {
    this.persist(room);
    this.broadcast(room);
  }

  private newCode(): string {
    for (let i = 0; i < 50; i++) {
      const code = randomString(ROOM_CODE_LENGTH);
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomError('busy', 'The server is busy. Please try again.');
  }

  // ------------------------------------------------------------ connections

  private attach(conn: Conn, room: Room, playerId: string) {
    conn.session = { code: room.code, playerId };
    let byPlayer = this.conns.get(room.code);
    if (!byPlayer) this.conns.set(room.code, (byPlayer = new Map()));
    let set = byPlayer.get(playerId);
    if (!set) byPlayer.set(playerId, (set = new Set()));
    set.add(conn);
    const key = `${room.code}:${playerId}`;
    const t = this.graceTimers.get(key);
    if (t) {
      clearTimeout(t);
      this.graceTimers.delete(key);
    }
    const member = room.members.find((m) => m.id === playerId);
    if (member && !member.connected) setConnected(room, playerId, true, this.opts.now());
  }

  /** Call when a socket closes (for any reason). Starts the disconnect grace period. */
  onClose(conn: Conn) {
    const s = conn.session;
    if (!s) return;
    conn.session = undefined;
    const set = this.conns.get(s.code)?.get(s.playerId);
    set?.delete(conn);
    if (set && set.size === 0) {
      this.conns.get(s.code)?.delete(s.playerId);
      const key = `${s.code}:${s.playerId}`;
      clearTimeout(this.graceTimers.get(key));
      this.graceTimers.set(
        key,
        setTimeout(() => {
          this.graceTimers.delete(key);
          const room = this.rooms.get(s.code);
          if (!room || this.conns.get(s.code)?.get(s.playerId)?.size) return;
          setConnected(room, s.playerId, false, this.opts.now());
          this.commit(room);
        }, this.opts.graceMs),
      );
    }
  }

  // ------------------------------------------------------------ message handling

  handle(conn: Conn, msg: ClientMsg) {
    try {
      this.dispatch(conn, msg);
    } catch (e) {
      if (e instanceof RoomError || e instanceof GameError) {
        conn.send({ t: 'error', code: e.code, message: e.message });
      } else {
        console.error('[manager] unexpected error', e);
        conn.send({ t: 'error', code: 'internal', message: 'Something went wrong.' });
      }
    }
  }

  private dispatch(conn: Conn, msg: ClientMsg) {
    if (!msg || typeof msg !== 'object') throw new RoomError('bad_request', 'Invalid message.');
    switch (msg.t) {
      case 'ping':
        return conn.send({ t: 'pong' });

      case 'create': {
        if (conn.session) throw new RoomError('already_in_room', 'Leave your current room first.');
        if (this.rooms.size >= this.opts.maxRooms)
          throw new RoomError('busy', 'The server is full. Try again later.');
        const token = randomString(20);
        const playerId = 'p_' + randomUUID().slice(0, 8);
        const room = createRoom(
          this.newCode(),
          {
            id: playerId,
            name: sanitizeName(msg.name),
            avatar: this.avatar(msg.avatar),
            tokenHash: hash(token),
          },
          this.opts.now(),
        );
        this.rooms.set(room.code, room);
        conn.send({ t: 'welcome', code: room.code, playerId, token });
        this.attach(conn, room, playerId);
        return this.commit(room);
      }

      case 'join': {
        if (conn.session) throw new RoomError('already_in_room', 'Leave your current room first.');
        const room = this.rooms.get(normalizeCode(String(msg.code ?? '')));
        if (!room)
          throw new RoomError('room_not_found', 'No room with that code. It may have expired.');
        const token = randomString(20);
        const playerId = 'p_' + randomUUID().slice(0, 8);
        addMember(
          room,
          { id: playerId, name: msg.name, avatar: this.avatar(msg.avatar), tokenHash: hash(token) },
          this.opts.now(),
        );
        conn.send({ t: 'welcome', code: room.code, playerId, token });
        this.attach(conn, room, playerId);
        return this.commit(room);
      }

      case 'resume': {
        const room = this.rooms.get(normalizeCode(String(msg.code ?? '')));
        const fail = (code: string, message: string) => {
          conn.failedAuth = (conn.failedAuth ?? 0) + 1;
          conn.send({ t: 'error', code, message, fatal: true });
          if (conn.failedAuth >= 5) conn.close();
        };
        if (!room) return fail('room_not_found', 'This room no longer exists.');
        const h = hash(String(msg.token ?? ''));
        if (room.removed.some((x) => safeEq(x, h)))
          return fail('removed', 'You were removed from this game by the host.');
        const member = room.members.find((m) => safeEq(m.tokenHash, h));
        if (!member)
          return fail('invalid_credentials', 'That recovery code is not valid for this room.');
        // Re-using a connection that was attached to another player is not allowed.
        if (conn.session && conn.session.playerId !== member.id) this.onClose(conn);
        conn.send({ t: 'welcome', code: room.code, playerId: member.id, token: String(msg.token) });
        this.attach(conn, room, member.id);
        return this.commit(room);
      }
    }

    // Everything below needs an authenticated session.
    const s = conn.session;
    const room = s ? this.rooms.get(s.code) : undefined;
    if (!s || !room) throw new RoomError('no_session', 'You are not in a room.');
    const me = s.playerId;

    switch (msg.t) {
      case 'rules':
        setRules(room, me, msg.rules);
        return this.commit(room);
      case 'ready':
        setReady(room, me, msg.ready === true);
        return this.commit(room);
      case 'start':
        startGame(room, me, this.opts.rng);
        return this.commit(room);
      case 'lobby':
        backToLobby(room, me);
        return this.commit(room);
      case 'remove': {
        const target = room.members.find((m) => m.id === msg.target);
        removeMember(room, me, String(msg.target));
        this.commit(room);
        if (target) this.evict(room.code, target.id, 'removed');
        return;
      }
      case 'leave': {
        leaveMember(room, me);
        this.evict(room.code, me, 'left');
        if (room.members.length === 0) {
          void this.destroy(room.code);
          return;
        }
        return this.commit(room);
      }
      case 'act': {
        const id = typeof msg.id === 'string' ? msg.id.slice(0, 64) : '';
        try {
          const action = parseAction(msg.action);
          const applied = act(
            room,
            me,
            action,
            {
              actionId: id || undefined,
              expectedVersion: typeof msg.v === 'number' ? msg.v : undefined,
            },
            this.opts.rng,
          );
          conn.send({ t: 'ack', id, ok: true });
          if (applied) this.commit(room);
        } catch (e) {
          if (e instanceof RoomError || e instanceof GameError) {
            conn.send({ t: 'ack', id, ok: false, error: { code: e.code, message: e.message } });
            // Re-sync the sender so a stale UI heals itself.
            this.sendState(conn, room, me);
          } else throw e;
        }
        return;
      }
      default:
        throw new RoomError('bad_request', 'Unknown message.');
    }
  }

  private avatar(a: unknown) {
    const n = Number(a);
    return Number.isInteger(n) && n >= 0 && n < AVATAR_COUNT ? n : 0;
  }

  /** Kick all sockets of a player who was removed / who left. */
  private evict(code: string, playerId: string, reason: 'removed' | 'left') {
    const set = this.conns.get(code)?.get(playerId);
    if (!set) return;
    this.conns.get(code)?.delete(playerId);
    for (const c of set) {
      c.session = undefined;
      c.send({ t: 'left', reason });
    }
  }

  connectionCount(code: string, playerId: string) {
    return this.conns.get(code)?.get(playerId)?.size ?? 0;
  }
}
