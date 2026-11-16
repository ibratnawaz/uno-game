import { describe, expect, it } from 'vitest';
import {
  act,
  addMember,
  backToLobby,
  buildRoomView,
  createRoom,
  leaveMember,
  removeMember,
  RoomError,
  setConnected,
  setReady,
  setRules,
  startGame,
  waitingFor,
  type Room,
} from './room';
import { seeded } from './testkit';
import { defaultRules } from './types';

const mk = (id: string, name = id.toUpperCase()) => ({ id, name, avatar: 0, tokenHash: 'h' + id });
const errCode = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as RoomError).code;
  }
  return null;
};

function lobby(n: number): Room {
  const room = createRoom('ABCDEF', mk('p0'));
  for (let i = 1; i < n; i++) addMember(room, mk('p' + i));
  return room;
}

describe('room lobby', () => {
  it('host occupies a slot and rooms hold at most 20 players', () => {
    const room = lobby(20);
    expect(room.members).toHaveLength(20);
    expect(errCode(() => addMember(room, mk('p20')))).toBe('room_full');
    expect(room.members).toHaveLength(20);
  });

  it('needs at least 2 players to start', () => {
    const room = lobby(1);
    expect(errCode(() => startGame(room, 'p0'))).toBe('too_few_players');
    addMember(room, mk('p1'));
    startGame(room, 'p0', seeded(1));
    expect(room.status).toBe('playing');
  });

  it('only the host starts, configures rules, and removes players', () => {
    const room = lobby(3);
    expect(errCode(() => startGame(room, 'p1'))).toBe('not_host');
    expect(errCode(() => setRules(room, 'p1', defaultRules()))).toBe('not_host');
    expect(errCode(() => removeMember(room, 'p1', 'p2'))).toBe('not_host');
  });

  it('sanitises rules and rejects duplicate nicknames', () => {
    const room = lobby(2);
    setRules(room, 'p0', { jumpIn: true, evil: 1, stacking: { draw2OnDraw2: 'yes' } });
    expect(room.rules.jumpIn).toBe(true);
    expect(room.rules.stacking.draw2OnDraw2).toBe(false);
    expect(errCode(() => addMember(room, mk('x', 'p1')))).toBe('name_taken');
    expect(errCode(() => addMember(room, mk('y', '   ')))).toBe('bad_name');
  });

  it('cannot join after the game started; rules are locked', () => {
    const room = lobby(3);
    startGame(room, 'p0', seeded(1));
    expect(errCode(() => addMember(room, mk('late')))).toBe('game_started');
    expect(errCode(() => setRules(room, 'p0', defaultRules()))).toBe('game_started');
  });

  it('tracks ready status and returns to the lobby after a round', () => {
    const room = lobby(2);
    setReady(room, 'p1', true);
    expect(room.members[1].ready).toBe(true);
    startGame(room, 'p0', seeded(1));
    room.status = 'over';
    backToLobby(room, 'p0');
    expect(room.status).toBe('lobby');
    expect(room.game).toBeNull();
  });
});

describe('room game flow', () => {
  function started(n = 3) {
    const room = lobby(n);
    startGame(room, 'p0', seeded(5));
    return room;
  }
  const currentId = (r: Room) => r.game!.players[r.game!.current].id;
  const drawFor = (r: Room, id: string, opts = {}) => act(r, id, { type: 'draw' }, opts, seeded(2));

  it('is idempotent for duplicate action ids and rejects stale versions', () => {
    const room = started();
    const id = currentId(room);
    const v = room.game!.version;
    // Phase 'chooseColor' at start possible; resolve generically
    if (room.game!.phase === 'chooseColor')
      act(room, id, { type: 'chooseColor', color: 'red' }, {}, seeded(1));
    const v2 = room.game!.version;
    expect(v2).toBeGreaterThanOrEqual(v);
    const cur = currentId(room);
    expect(drawFor(room, cur, { actionId: 'a1', expectedVersion: v2 })).toBe(true);
    const after = JSON.stringify(room.game);
    expect(drawFor(room, cur, { actionId: 'a1', expectedVersion: v2 })).toBe(false); // retry: no-op
    expect(JSON.stringify(room.game)).toBe(after);
    expect(errCode(() => drawFor(room, currentId(room), { expectedVersion: 0 }))).toBe(
      'stale_state',
    );
  });

  it('pauses when the current player is disconnected and resumes on reconnect', () => {
    const room = started();
    if (room.game!.phase === 'chooseColor')
      act(room, currentId(room), { type: 'chooseColor', color: 'red' }, {}, seeded(1));
    const cur = currentId(room);
    const other = room.members.find((m) => m.id !== cur)!.id;
    setConnected(room, cur, false);
    expect(waitingFor(room)?.id).toBe(cur);
    expect(errCode(() => act(room, other, { type: 'draw' }))).toBe('paused');
    const snapshot = JSON.stringify(room.game);
    setConnected(room, cur, true);
    expect(waitingFor(room)).toBeNull();
    expect(JSON.stringify(room.game)).toBe(snapshot); // untouched
    expect(buildRoomView(room, cur).game!.hand).toHaveLength(
      room.game!.players.find((p) => p.id === cur)!.hand.length,
    );
  });

  it('does not pause when a non-current player is disconnected', () => {
    const room = started(4);
    if (room.game!.phase === 'chooseColor')
      act(room, currentId(room), { type: 'chooseColor', color: 'red' }, {}, seeded(1));
    const cur = currentId(room);
    const away = room.members.find((m) => m.id !== cur)!.id;
    setConnected(room, away, false);
    expect(waitingFor(room)).toBeNull();
    expect(() => drawFor(room, cur)).not.toThrow();
  });

  it('host can only remove DISCONNECTED players mid-game, keeping state consistent', () => {
    const room = started(4);
    if (room.game!.phase === 'chooseColor')
      act(room, currentId(room), { type: 'chooseColor', color: 'red' }, {}, seeded(1));
    const cur = currentId(room);
    const victim = cur === 'p0' ? 'p1' : cur; // never the host
    expect(errCode(() => removeMember(room, 'p0', victim))).toBe('still_connected');
    setConnected(room, victim, false);
    const cardsBefore =
      room.game!.drawPile.length +
      room.game!.players.reduce((n, p) => n + p.hand.length, 0) +
      room.game!.discard.length;
    removeMember(room, 'p0', victim);
    const g = room.game!;
    expect(g.players.map((p) => p.id)).not.toContain(victim);
    expect(
      g.drawPile.length + g.players.reduce((n, p) => n + p.hand.length, 0) + g.discard.length,
    ).toBe(cardsBefore);
    expect(room.removed).toContain('h' + victim);
    expect(room.members.map((m) => m.id)).not.toContain(victim);
    expect(g.current).toBeGreaterThanOrEqual(0);
    expect(g.current).toBeLessThan(g.players.length);
  });

  it('removing the disconnected CURRENT player lets the game continue', () => {
    const room = started(3);
    if (room.game!.phase === 'chooseColor')
      act(room, currentId(room), { type: 'chooseColor', color: 'red' }, {}, seeded(1));
    let cur = currentId(room);
    if (cur === 'p0') {
      // make the host not the current player
      act(room, cur, { type: 'draw' }, {}, seeded(4));
      cur = currentId(room);
    }
    setConnected(room, cur, false);
    expect(waitingFor(room)?.id).toBe(cur);
    removeMember(room, 'p0', cur);
    expect(waitingFor(room)).toBeNull();
    const next = currentId(room);
    expect(next).not.toBe(cur);
    expect(() => act(room, next, { type: 'draw' }, {}, seeded(3))).not.toThrow();
  });

  it('a deliberate leave is a removal; host role transfers', () => {
    const room = started(3);
    leaveMember(room, 'p0');
    expect(room.hostId).not.toBe('p0');
    expect(room.members).toHaveLength(2);
    expect(room.removed).toContain('hp0');
  });

  it('hides other players hands in every view', () => {
    const room = started(4);
    const view = buildRoomView(room, 'p1');
    const text = JSON.stringify(view);
    for (const p of room.game!.players.filter((x) => x.id !== 'p1'))
      for (const c of p.hand) expect(text.includes(`"id":${c.id},"color"`)).toBe(false);
    expect(Object.keys(JSON.parse(text))).not.toContain('tokenHash');
    expect(text).not.toContain('tokenHash');
  });

  it('completes a game and awards the score to the winner', () => {
    const room = lobby(2);
    startGame(room, 'p0', seeded(1));
    const g = room.game!;
    // fabricate a near-finished game
    g.players[0].hand = [g.players[0].hand[0]];
    g.players[1].hand = g.players[1].hand.slice(0, 3);
    g.phase = 'play';
    g.wild = null;
    g.current = 0;
    g.pending = null;
    g.drawnCardId = null;
    const c = g.players[0].hand[0];
    g.discard.push({ id: 99999, color: c.color === 'wild' ? 'red' : c.color, value: c.value });
    g.activeColor = c.color === 'wild' ? 'red' : c.color;
    act(room, 'p0', { type: 'play', cardId: c.id }, {}, seeded(1));
    expect(room.status).toBe('over');
    expect(room.scores.p0).toBeGreaterThan(0);
    // rematch
    backToLobby(room, 'p0');
    startGame(room, 'p0', seeded(2));
    expect(room.round).toBe(2);
    expect(room.status).toBe('playing');
  });
});
