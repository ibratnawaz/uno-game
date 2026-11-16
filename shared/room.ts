/**
 * Room / lobby / session logic. Pure data + functions so the exact same code runs on the
 * server (authoritative, multiplayer) and in the browser (solo-vs-bots mode).
 * All mutating functions change the Room in place and throw RoomError on illegal input.
 */
import { applyAction, createGame, removePlayer } from './game';
import { sanitizeRules } from './rules';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  defaultRules,
  type GameAction,
  type GameState,
  type HouseRules,
  type LogEntry,
  type Rng,
} from './types';
import { gameViewFor, type GameView } from './view';

export class RoomError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Member {
  id: string;
  name: string;
  avatar: number;
  ready: boolean;
  connected: boolean;
  /** sha256 of the player's secret recovery credential (server only; never sent to clients). */
  tokenHash: string;
  /** Recently processed action ids, for idempotent retries. */
  recent: string[];
}

export type RoomStatus = 'lobby' | 'playing' | 'over';

export interface Room {
  code: string;
  hostId: string;
  status: RoomStatus;
  members: Member[];
  rules: HouseRules;
  game: GameState | null;
  scores: Record<string, number>;
  round: number;
  log: LogEntry[];
  /** Credential hashes of players removed by the host / who left; those credentials stop working. */
  removed: string[];
  createdAt: number;
  updatedAt: number;
  version: number;
}

export const AVATAR_COUNT = 12;
const LOG_CAP = 80;
const RECENT_CAP = 40;

export function sanitizeName(raw: unknown): string {
  const name = String(raw ?? '')
    .replace(/\p{Cc}|[<>]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  if (name.length < 1) throw new RoomError('bad_name', 'Please enter a nickname.');
  return name;
}

const note = (room: Room, text: string) => {
  room.version++;
  room.log.push({ n: room.version, text });
  if (room.log.length > LOG_CAP) room.log.splice(0, room.log.length - LOG_CAP);
};
const touch = (room: Room, now = Date.now()) => {
  room.updatedAt = now;
  room.version++;
};

export function createRoom(
  code: string,
  host: Pick<Member, 'id' | 'name' | 'avatar' | 'tokenHash'>,
  now = Date.now(),
): Room {
  const room: Room = {
    code,
    hostId: host.id,
    status: 'lobby',
    members: [{ ...host, name: sanitizeName(host.name), ready: true, connected: true, recent: [] }],
    rules: defaultRules(),
    game: null,
    scores: {},
    round: 0,
    log: [],
    removed: [],
    createdAt: now,
    updatedAt: now,
    version: 0,
  };
  note(room, `${room.members[0].name} created the room.`);
  return room;
}

const memberOf = (room: Room, id: string) => room.members.find((m) => m.id === id);

function requireMember(room: Room, id: string): Member {
  const m = memberOf(room, id);
  if (!m) throw new RoomError('not_member', 'You are not in this room.');
  return m;
}
function requireHost(room: Room, id: string) {
  requireMember(room, id);
  if (room.hostId !== id) throw new RoomError('not_host', 'Only the host can do that.');
}

export function addMember(
  room: Room,
  m: Pick<Member, 'id' | 'name' | 'avatar' | 'tokenHash'>,
  now = Date.now(),
): Member {
  if (room.status !== 'lobby')
    throw new RoomError('game_started', 'This game has already started.');
  if (room.members.length >= MAX_PLAYERS)
    throw new RoomError('room_full', 'This room is full (20 players).');
  const name = sanitizeName(m.name);
  if (room.members.some((x) => x.name.toLowerCase() === name.toLowerCase()))
    throw new RoomError('name_taken', 'That nickname is already used in this room.');
  const member: Member = { ...m, name, ready: false, connected: true, recent: [] };
  room.members.push(member);
  note(room, `${name} joined the room.`);
  touch(room, now);
  return member;
}

export function setRules(room: Room, actorId: string, rules: unknown) {
  requireHost(room, actorId);
  if (room.status === 'playing')
    throw new RoomError('game_started', 'Rules cannot change during a game.');
  room.rules = sanitizeRules(rules);
  touch(room);
}

export function setReady(room: Room, actorId: string, ready: boolean) {
  const m = requireMember(room, actorId);
  if (room.status !== 'lobby') return;
  m.ready = !!ready;
  touch(room);
}

export function setConnected(room: Room, id: string, connected: boolean, now = Date.now()) {
  const m = memberOf(room, id);
  if (!m || m.connected === connected) return;
  m.connected = connected;
  note(room, connected ? `${m.name} reconnected.` : `${m.name} disconnected.`);
  touch(room, now);
}

function beginGame(room: Room, rng: Rng) {
  room.game = createGame(
    room.members.map((m) => ({ id: m.id, name: m.name })),
    room.rules,
    rng,
  );
  room.status = room.game.phase === 'over' ? 'over' : 'playing';
  room.round++;
  for (const m of room.members) m.recent = [];
  note(room, `Round ${room.round} started with ${room.members.length} players.`);
  syncGameLog(room, -1);
}

/** Copy new engine log lines into the room timeline. */
function syncGameLog(room: Room, prevGameVersion: number) {
  if (!room.game) return;
  for (const e of room.game.log) if (e.n > prevGameVersion) note(room, e.text);
}

export function startGame(room: Room, actorId: string, rng: Rng = Math.random) {
  requireHost(room, actorId);
  if (room.status === 'playing')
    throw new RoomError('game_started', 'The game is already running.');
  if (room.members.length < MIN_PLAYERS)
    throw new RoomError('too_few_players', 'You need at least 2 players to start.');
  if (room.members.length > MAX_PLAYERS)
    throw new RoomError('too_many_players', 'Too many players.');
  if (room.members.filter((m) => m.connected).length < MIN_PLAYERS)
    throw new RoomError('too_few_connected', 'At least 2 players must be connected to start.');
  beginGame(room, rng);
  touch(room);
}

export function backToLobby(room: Room, actorId: string) {
  requireHost(room, actorId);
  if (room.status === 'playing') throw new RoomError('game_started', 'The game is still running.');
  room.status = 'lobby';
  room.game = null;
  for (const m of room.members) m.ready = m.id === room.hostId;
  touch(room);
}

function finishIfOver(room: Room) {
  const g = room.game;
  if (g && g.phase === 'over' && room.status === 'playing') {
    room.status = 'over';
    if (g.winner) room.scores[g.winner] = (room.scores[g.winner] ?? 0) + g.roundPoints;
  }
}

/** Whose turn it is, if that player is currently disconnected (the table is "paused"). */
export function waitingFor(room: Room): { id: string; name: string } | null {
  const g = room.game;
  if (room.status !== 'playing' || !g || g.phase === 'over') return null;
  const cur = g.players[g.current];
  const m = memberOf(room, cur.id);
  return m && !m.connected ? { id: m.id, name: m.name } : null;
}

export interface ActOptions {
  actionId?: string;
  expectedVersion?: number;
}

/**
 * Apply a game action for a member. Returns false when it was a duplicate retry
 * (already processed) and nothing changed.
 */
export function act(
  room: Room,
  actorId: string,
  action: GameAction,
  opts: ActOptions = {},
  rng: Rng = Math.random,
): boolean {
  const m = requireMember(room, actorId);
  const g = room.game;
  if (room.status !== 'playing' || !g)
    throw new RoomError('no_game', 'There is no game in progress.');
  if (opts.actionId && m.recent.includes(opts.actionId)) return false;
  const paused = waitingFor(room);
  if (paused && paused.id !== actorId) {
    throw new RoomError('paused', `Waiting for ${paused.name} to reconnect.`);
  }
  const reflex = action.type === 'callUno' || action.type === 'catchUno';
  if (!reflex && opts.expectedVersion !== undefined && opts.expectedVersion !== g.version) {
    throw new RoomError('stale_state', 'The game moved on. Your view was refreshed.');
  }
  room.game = applyAction(g, actorId, action, rng); // throws GameError, leaving room untouched
  if (opts.actionId) {
    m.recent.push(opts.actionId);
    if (m.recent.length > RECENT_CAP) m.recent.shift();
  }
  syncGameLog(room, g.version);
  finishIfOver(room);
  touch(room);
  return true;
}

function dropMember(room: Room, id: string, text: string) {
  const g = room.game;
  const idx = room.members.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const [gone] = room.members.splice(idx, 1);
  room.removed.push(gone.tokenHash);
  delete room.scores[id];
  note(room, text);
  if (g && room.status === 'playing' && g.players.some((p) => p.id === id)) {
    room.game = removePlayer(g, id);
    syncGameLog(room, g.version);
    finishIfOver(room);
  }
  if (room.hostId === id && room.members.length > 0) {
    const next = room.members.find((x) => x.connected) ?? room.members[0];
    room.hostId = next.id;
    note(room, `${next.name} is now the host.`);
  }
  touch(room);
}

/** Host removes a player. In a running game the target must be disconnected. */
export function removeMember(room: Room, actorId: string, targetId: string) {
  requireHost(room, actorId);
  const t = memberOf(room, targetId);
  if (!t) throw new RoomError('not_member', 'That player is not in the room.');
  if (targetId === actorId) throw new RoomError('bad_target', 'Use Leave Room to leave.');
  if (room.status === 'playing' && t.connected)
    throw new RoomError(
      'still_connected',
      'Only disconnected players can be removed during a game.',
    );
  dropMember(room, targetId, `${t.name} was removed by the host.`);
}

/** A player deliberately leaves (this is NOT the same as a disconnection). */
export function leaveMember(room: Room, id: string) {
  const m = requireMember(room, id);
  dropMember(room, id, `${m.name} left the room.`);
}

export interface PublicMember {
  id: string;
  name: string;
  avatar: number;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface RoomView {
  code: string;
  status: RoomStatus;
  hostId: string;
  you: string;
  members: PublicMember[];
  rules: HouseRules;
  game: GameView | null;
  scores: Record<string, number>;
  round: number;
  log: LogEntry[];
  version: number;
  waitingFor: { id: string; name: string } | null;
  limits: { min: number; max: number };
}

export function buildRoomView(room: Room, viewerId: string): RoomView {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    you: viewerId,
    members: room.members.map((m) => ({
      id: m.id,
      name: m.name,
      avatar: m.avatar,
      ready: m.ready,
      connected: m.connected,
      isHost: m.id === room.hostId,
    })),
    rules: room.rules,
    game: room.game ? gameViewFor(room.game, viewerId) : null,
    scores: room.scores,
    round: room.round,
    log: room.log,
    version: room.version,
    waitingFor: waitingFor(room),
    limits: { min: MIN_PLAYERS, max: MAX_PLAYERS },
  };
}
