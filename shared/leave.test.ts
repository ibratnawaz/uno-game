import { describe, expect, it } from 'vitest';
import {
  addMember,
  backToLobby,
  buildRoomView,
  createRoom,
  leaveMember,
  removeMember,
  setConnected,
  startGame,
  waitingFor,
  type Room,
} from './room';
import { seeded } from './testkit';

const mk = (id: string) => ({ id, name: id.toUpperCase(), avatar: 0, tokenHash: 'h' + id });
function started(n: number, seed = 3): Room {
  const room = createRoom('ABCDEF', mk('p0'));
  for (let i = 1; i < n; i++) addMember(room, mk('p' + i));
  startGame(room, 'p0', seeded(seed));
  return room;
}
const currentId = (r: Room) => r.game!.players[r.game!.current].id;

/** The last remaining player must get a valid, finished view and no "waiting" state. */
function expectForfeitWin(room: Room, survivor: string) {
  const v = buildRoomView(room, survivor); // used to throw when `current` was out of range
  expect(room.status).toBe('over');
  expect(v.game?.phase).toBe('over');
  expect(v.game?.winner).toBe(survivor);
  expect(v.game?.current).toBe(survivor);
  expect(v.waitingFor).toBeNull();
  expect(waitingFor(room)).toBeNull();
  expect(v.members).toHaveLength(1);
  expect(v.hostId).toBe(survivor);
}

describe('everyone else leaves mid-game', () => {
  for (const n of [2, 3, 4, 6]) {
    it(`${n} players: the others leave one by one; the survivor wins by forfeit`, () => {
      const room = started(n);
      for (const m of room.members.filter((x) => x.id !== 'p0')) leaveMember(room, m.id);
      expectForfeitWin(room, 'p0');
    });

    it(`${n} players: the survivor is the last non-current, then the current player leaves`, () => {
      const room = started(n);
      const cur = currentId(room);
      const survivor = room.members.map((m) => m.id).find((id) => id !== cur)!;
      for (const m of room.members.filter((x) => x.id !== survivor && x.id !== cur))
        leaveMember(room, m.id);
      leaveMember(room, cur);
      expectForfeitWin(room, survivor);
    });
  }

  it('works for every seat order and starting player (seeds)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (const n of [2, 3, 5]) {
        const room = started(n, seed);
        const keep = room.members[seed % n].id;
        for (const m of [...room.members].filter((x) => x.id !== keep)) leaveMember(room, m.id);
        expectForfeitWin(room, keep);
      }
    }
  });

  it('the host leaving first hands the host role to the survivor', () => {
    const room = started(3);
    leaveMember(room, 'p0');
    leaveMember(room, 'p1');
    expectForfeitWin(room, 'p2');
  });

  it('host removal of disconnected players ends the round the same way', () => {
    const room = started(3);
    setConnected(room, 'p1', false);
    setConnected(room, 'p2', false);
    removeMember(room, 'p0', 'p1');
    removeMember(room, 'p0', 'p2');
    expectForfeitWin(room, 'p0');
  });

  it('a pending colour choice or penalty owed to a leaver does not wedge the survivor', () => {
    const room = started(2);
    const g = room.game!;
    g.phase = 'chooseColor';
    g.wild = { wild4: true, legal: true };
    g.pending = { kind: 'draw4', amount: 4, challenge: { offender: 'p0', legal: true } };
    leaveMember(room, currentId(room) === 'p0' ? 'p1' : 'p0');
    expect(room.status).toBe('over');
    const survivor = room.members[0].id;
    const v = buildRoomView(room, survivor);
    expect(v.game?.pending).toBeNull();
    expect(v.game?.phase).toBe('over');
  });

  it('the survivor can go back to the lobby and friends can rejoin with the code', () => {
    const room = started(3);
    leaveMember(room, 'p1');
    leaveMember(room, 'p2');
    backToLobby(room, 'p0');
    expect(room.status).toBe('lobby');
    addMember(room, mk('p9'));
    expect(room.members).toHaveLength(2);
    startGame(room, 'p0', seeded(4));
    expect(room.status).toBe('playing');
  });

  it('a disconnection is still NOT a leave: the table pauses and nobody is dropped', () => {
    const room = started(3);
    const cur = currentId(room);
    setConnected(room, cur, false);
    expect(waitingFor(room)?.id).toBe(cur);
    expect(room.game!.players).toHaveLength(3);
    expect(room.status).toBe('playing');
  });
});
