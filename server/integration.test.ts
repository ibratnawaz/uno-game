import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { botTurn } from '../shared/bot';
import { seeded } from '../shared/testkit';
import { startApp, type RunningApp } from './app';
import { FileStore, MemoryStore } from './store';
import { TestClient, sleep, until } from './testclient';

const apps: RunningApp[] = [];
const clients: TestClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.ws.terminate();
  for (const a of apps.splice(0)) await a.close();
});

async function boot(opts: Partial<Parameters<typeof startApp>[0]> = {}) {
  const app = await startApp({
    port: 0,
    store: new MemoryStore(),
    graceMs: 150,
    rng: seeded(11),
    ...opts,
  });
  apps.push(app);
  return app;
}
async function client(app: RunningApp) {
  const c = await TestClient.open(app.port);
  clients.push(c);
  return c;
}

/** Room with a host + (n-1) joined players. */
async function setup(app: RunningApp, n: number) {
  const cs: TestClient[] = [];
  const host = await client(app);
  const code = await host.create('Host');
  cs.push(host);
  for (let i = 1; i < n; i++) {
    const c = await client(app);
    await c.join(code, `Player${i}`);
    cs.push(c);
  }
  await until(() => cs.every((c) => c.state?.members.length === n), 3000, 'lobby sync');
  return { cs, host, code };
}

async function startGame(cs: TestClient[]) {
  cs[0].send({ t: 'start' });
  await until(() => cs.every((c) => c.state?.status === 'playing'), 3000, 'game start');
}

const current = (cs: TestClient[]) => cs.find((c) => c.state!.game!.current === c.playerId)!;

/** Resolve a starting-wild colour choice so tests begin from a normal state. */
async function settle(cs: TestClient[]) {
  const cur = current(cs);
  if (cur.state!.game!.phase === 'chooseColor') {
    await cur.act({ type: 'chooseColor', color: 'red' });
    await until(() => cs.every((c) => c.state!.game!.phase === 'play'), 2000, 'settle');
  }
}

describe('rooms', () => {
  it('creates a room with a code, a token and a lobby the host controls', async () => {
    const app = await boot();
    const host = await client(app);
    const code = await host.create('Alice');
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(host.token.length).toBeGreaterThanOrEqual(16);
    expect(host.state).toMatchObject({ status: 'lobby', hostId: host.playerId });
    expect(host.state!.members).toHaveLength(1);
    expect(JSON.stringify(host.state)).not.toContain(host.token);
    expect(JSON.stringify(host.state)).not.toContain('tokenHash');
  });

  it('lets others join by code (case-insensitive) and syncs the lobby in real time', async () => {
    const app = await boot();
    const host = await client(app);
    const code = await host.create('Alice');
    const bob = await client(app);
    await bob.join(code.toLowerCase(), 'Bob');
    await until(() => host.state!.members.length === 2, 2000, 'host sees bob');
    expect(host.state!.members.map((m) => m.name)).toEqual(['Alice', 'Bob']);
    bob.send({ t: 'ready', ready: true });
    await until(() => host.state!.members[1].ready, 2000, 'ready sync');
    bob.send({ t: 'leave' });
    await until(() => host.state!.members.length === 1, 2000, 'leave sync');
  });

  it('reports meaningful errors for bad codes and duplicate nicknames', async () => {
    const app = await boot();
    const host = await client(app);
    const code = await host.create('Alice');
    const x = await client(app);
    await expect(x.join('ZZZZZZ', 'X')).rejects.toThrow('room_not_found');
    await expect(x.join(code, 'alice')).rejects.toThrow('name_taken');
  });

  it('never exceeds 20 players', async () => {
    const app = await boot();
    const { cs, code } = await setup(app, 20);
    expect(cs[0].state!.members).toHaveLength(20);
    const extra = await client(app);
    await expect(extra.join(code, 'Overflow')).rejects.toThrow('room_full');
    expect(cs[0].state!.members).toHaveLength(20);
    await startGame(cs);
    expect(cs[3].state!.game!.players).toHaveLength(20);
    expect(cs[3].state!.game!.decks).toBe(2);
  });

  it('needs 2 players and a host to start; closes the door once started', async () => {
    const app = await boot();
    const host = await client(app);
    const code = await host.create('Alice');
    const r1 = await host.request({ t: 'start' }, ['error', 'state']);
    expect(r1).toMatchObject({ t: 'error', code: 'too_few_players' });
    const bob = await client(app);
    await bob.join(code, 'Bob');
    const r2 = await bob.request({ t: 'start' }, ['error']);
    expect(r2).toMatchObject({ code: 'not_host' });
    await startGame([host, bob]);
    const late = await client(app);
    await expect(late.join(code, 'Late')).rejects.toThrow('game_started');
  });

  it('only the host can change house rules, and everyone sees them', async () => {
    const app = await boot();
    const { cs } = await setup(app, 2);
    const denied = await cs[1].request({ t: 'rules', rules: { jumpIn: true } }, ['error']);
    expect(denied).toMatchObject({ code: 'not_host' });
    cs[0].send({ t: 'rules', rules: { jumpIn: true, sevenZero: true } });
    await until(
      () => cs[1].state!.rules.jumpIn && cs[1].state!.rules.sevenZero,
      2000,
      'rules sync',
    );
    await startGame(cs);
    expect(cs[1].state!.game!.rules.jumpIn).toBe(true);
  });
});

describe('game synchronisation and privacy', () => {
  it('shows each player only their own hand', async () => {
    const app = await boot();
    const { cs } = await setup(app, 4);
    await startGame(cs);
    const hands = cs.map((c) => c.state!.game!.hand);
    hands.forEach((h) => expect(h.length).toBeGreaterThanOrEqual(7));
    cs.forEach((c, i) => {
      const text = JSON.stringify(c.state);
      hands.forEach((h, j) => {
        if (i === j) return;
        for (const card of h) expect(text.includes(`"id":${card.id},`)).toBe(false);
      });
      expect(c.state!.game!.players.every((p) => typeof p.handCount === 'number')).toBe(true);
    });
  });

  it('broadcasts every move to every player in real time', async () => {
    const app = await boot();
    const { cs } = await setup(app, 3);
    await startGame(cs);
    await settle(cs);
    const cur = current(cs);
    const v = cur.state!.game!.version;
    const ack = await cur.act({ type: 'draw' }, { v: 'current' });
    expect(ack.ok).toBe(true);
    await until(() => cs.every((c) => c.state!.game!.version > v), 2000, 'broadcast');
    const counts = cs.map(
      (c) => c.state!.game!.players.find((p) => p.id === cur.playerId)!.handCount,
    );
    expect(new Set(counts).size).toBe(1);
  });

  it('rejects moves from players whose turn it is not', async () => {
    const app = await boot();
    const { cs } = await setup(app, 3);
    await startGame(cs);
    await settle(cs);
    const other = cs.find((c) => c !== current(cs))!;
    const ack = await other.act({ type: 'draw' });
    expect(ack.ok).toBe(false);
    expect(ack.error?.code).toBe('not_your_turn');
  });

  it('rejects malformed and forged actions', async () => {
    const app = await boot();
    const { cs } = await setup(app, 2);
    await startGame(cs);
    await settle(cs);
    const cur = current(cs);
    const bad = await cur.act({ type: 'play', cardId: 'x' as never });
    expect(bad.ok).toBe(false);
    const forged = await cur.act({ type: 'play', cardId: 424242 });
    expect(forged.ok).toBe(false);
    const other = cs.find((c) => c !== cur)!;
    const stolen = await cur.act({ type: 'play', cardId: other.state!.game!.hand[0].id });
    expect(stolen).toMatchObject({ ok: false, error: { code: 'no_such_card' } });
  });
});

describe('concurrency', () => {
  it('two tabs of one player cannot submit conflicting actions', async () => {
    const app = await boot();
    const { cs } = await setup(app, 2);
    await startGame(cs);
    await settle(cs);
    const tab1 = current(cs);
    const tab2 = await client(app);
    await tab2.resume(tab1.code, tab1.token);
    await until(() => tab2.state?.game, 2000, 'tab2 state');
    expect(tab2.state!.game!.hand).toEqual(tab1.state!.game!.hand);
    const v = tab1.state!.game!.version;
    const [a, b] = await Promise.all([
      tab1.act({ type: 'draw' }, { id: 'one', v }),
      tab2.act({ type: 'draw' }, { id: 'two', v }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const failed = a.ok ? b : a;
    expect(['stale_state', 'already_drew', 'not_your_turn']).toContain(failed.error!.code);
    await sleep(100);
    const hand = cs.find((c) => c.playerId === tab1.playerId)!.state!.game!;
    expect(hand.players.find((p) => p.id === tab1.playerId)!.handCount).toBeLessThanOrEqual(
      tab1.state!.game!.hand.length,
    );
  });

  it('retried actions with the same id are applied exactly once', async () => {
    const app = await boot();
    const { cs } = await setup(app, 2);
    await startGame(cs);
    await settle(cs);
    const cur = current(cs);
    const before = cur.state!.game!.hand.length;
    const v = cur.state!.game!.version;
    const first = await cur.act({ type: 'draw' }, { id: 'dup', v });
    const again = await cur.act({ type: 'draw' }, { id: 'dup', v });
    expect(first.ok && again.ok).toBe(true);
    await sleep(100);
    expect(
      app.manager.rooms.get(cur.code)!.game!.players.find((p) => p.id === cur.playerId)!.hand
        .length,
    ).toBe(before + 1);
  });
});

describe('persistent sessions and reconnection', () => {
  it('a refresh during your own turn resumes the same hand and turn, with no duplicate member', async () => {
    const app = await boot();
    const { cs, code } = await setup(app, 3);
    await startGame(cs);
    await settle(cs);
    const cur = current(cs);
    const hand = cur.state!.game!.hand;
    const { playerId, token } = cur;
    await cur.close();
    const fresh = await client(app);
    const r = await fresh.resume(code, token);
    expect(r.t).toBe('state');
    expect(fresh.playerId).toBe(playerId);
    expect(fresh.state!.members).toHaveLength(3);
    expect(fresh.state!.game!.hand).toEqual(hand);
    expect(fresh.state!.game!.current).toBe(playerId);
    // No "disconnected" notice because it came back inside the grace period.
    await sleep(300);
    expect(fresh.state!.members.every((m) => m.connected)).toBe(true);
    expect(fresh.state!.log.some((l) => l.text.includes('disconnected'))).toBe(false);
    expect((await fresh.act({ type: 'draw' }, { v: 'current' })).ok).toBe(true);
  });

  it('pauses on a disconnected current player and lets them resume where they left off', async () => {
    const app = await boot();
    const { cs, code } = await setup(app, 3);
    await startGame(cs);
    await settle(cs);
    const cur = current(cs);
    const others = cs.filter((c) => c !== cur);
    const snapshot = JSON.stringify(app.manager.rooms.get(code)!.game);
    const { token, playerId } = cur;
    await cur.close();
    await until(() => others[0].state!.waitingFor?.id === playerId, 3000, 'waiting indicator');
    expect(others[0].state!.members.find((m) => m.id === playerId)!.connected).toBe(false);
    // Other players cannot act in the meantime and the game state is frozen.
    const blocked = await others[0].act({ type: 'draw' });
    expect(blocked).toMatchObject({ ok: false, error: { code: 'paused' } });
    expect(JSON.stringify(app.manager.rooms.get(code)!.game)).toBe(snapshot);
    await sleep(400); // nothing auto-skips
    expect(JSON.stringify(app.manager.rooms.get(code)!.game)).toBe(snapshot);
    const back = await client(app);
    await back.resume(code, token);
    await until(() => others[0].state!.waitingFor === null, 2000, 'resumed');
    expect(back.state!.game!.current).toBe(playerId);
    expect((await back.act({ type: 'draw' }, { v: 'current' })).ok).toBe(true);
  });

  it('keeps the game going while a non-current player is away, then waits for them', async () => {
    const app = await boot();
    const { cs, code } = await setup(app, 4);
    await startGame(cs);
    await settle(cs);
    const first = current(cs);
    const seats = first.state!.game!.players.map((p) => p.id);
    const dir = first.state!.game!.direction;
    const at = (n: number) => seats[(((seats.indexOf(first.playerId) + dir * n) % 4) + 4) % 4];
    const away = cs.find((c) => c.playerId === at(2))!; // not the next player
    const awayHand = away.state!.game!.hand;
    const { token } = away;
    await away.close();
    const rest = cs.filter((c) => c !== away);
    await until(
      () => rest[0].state!.members.find((m) => m.id === away.playerId)!.connected === false,
      3000,
      'away detected',
    );
    expect(rest[0].state!.waitingFor).toBeNull(); // not their turn yet
    // Play turns until it reaches the absent player (bots auto-play from views).
    const rng = seeded(3);
    for (let i = 0; i < 20 && rest[0].state!.waitingFor?.id !== away.playerId; i++) {
      const c = rest.find((x) => x.state!.game!.current === x.playerId);
      if (!c) {
        await sleep(20);
        continue;
      }
      const a = botTurn(c.state!.game!, 'easy', rng);
      if (a) await c.act(a, { v: 'current' });
      await sleep(20);
    }
    await until(
      () => rest[0].state!.waitingFor?.id === away.playerId,
      3000,
      'game waits for absent player',
    );
    expect(rest[0].state!.game!.current).toBe(away.playerId);
    const back = await client(app);
    await back.resume(code, token);
    // Hand may have grown from penalties but still contains all the original cards.
    for (const c of awayHand) expect(back.state!.game!.hand.map((x) => x.id)).toContain(c.id);
    expect(back.state!.game!.current).toBe(away.playerId);
    await until(() => rest[0].state!.waitingFor === null, 2000, 'unpaused');
  });

  it('the host keeps host privileges after refreshing', async () => {
    const app = await boot();
    const { cs, host, code } = await setup(app, 2);
    const { token } = host;
    await host.close();
    await until(() => cs[1].state!.members[0].connected === false, 3000, 'host offline');
    const again = await client(app);
    await again.resume(code, token);
    expect(again.state!.hostId).toBe(again.playerId);
    expect(again.state!.members.filter((m) => m.isHost)).toHaveLength(1);
    again.send({ t: 'start' });
    await until(() => again.state!.status === 'playing', 2000, 'host starts after refresh');
  });

  it('the host can drop out while others play; nothing is destroyed', async () => {
    const app = await boot();
    const { cs, host, code } = await setup(app, 3);
    await startGame(cs);
    await settle(cs);
    await host.close();
    const rest = cs.slice(1);
    await until(() => rest[0].state!.members[0].connected === false, 3000, 'host offline');
    expect(app.manager.rooms.has(code)).toBe(true);
    expect(rest[0].state!.status).toBe('playing');
    expect(rest[0].state!.hostId).toBe(host.playerId);
  });

  it('survives temporary network loss: the client simply resumes with its credential', async () => {
    const app = await boot({ graceMs: 1000 });
    const { cs, code } = await setup(app, 2);
    await startGame(cs);
    const victim = cs[1];
    const { token } = victim;
    victim.ws.terminate();
    await sleep(50);
    const again = await client(app);
    await again.resume(code, token);
    await sleep(1200);
    expect(again.state!.members.every((m) => m.connected)).toBe(true);
    expect(cs[0].state!.log.some((l) => l.text.includes('disconnected'))).toBe(false);
  });

  it('rejects wrong credentials and unknown rooms without leaking anything', async () => {
    const app = await boot();
    const { code } = await setup(app, 2);
    const x = await client(app);
    const bad = await x.resume(code, 'WRONGWRONGWRONGWRONG');
    expect(bad).toMatchObject({ t: 'error', code: 'invalid_credentials', fatal: true });
    const none = await x.resume('QQQQQQ', 'whatever');
    expect(none).toMatchObject({ t: 'error', code: 'room_not_found' });
    expect(x.state).toBeUndefined();
  });

  it('reconnecting does not expose other private cards', async () => {
    const app = await boot();
    const { cs, code } = await setup(app, 3);
    await startGame(cs);
    const secret = cs[1].state!.game!.hand;
    const { token } = cs[2];
    await cs[2].close();
    const back = await client(app);
    await back.resume(code, token);
    const text = JSON.stringify(back.msgs);
    for (const c of secret) expect(text.includes(`"id":${c.id},`)).toBe(false);
  });
});

describe('host removal of disconnected players', () => {
  it('lets the host remove a disconnected player (after a confirm in the UI) and blocks their credential', async () => {
    const app = await boot();
    const { cs, host, code } = await setup(app, 4);
    await startGame(cs);
    await settle(cs);
    const victim = cs.find((c) => c !== host && c !== current(cs))!;
    const { token, playerId } = victim;

    const conn = await host.request({ t: 'remove', target: playerId }, ['error']);
    expect(conn).toMatchObject({ code: 'still_connected' });

    await victim.close();
    await until(
      () => host.state!.members.find((m) => m.id === playerId)!.connected === false,
      3000,
      'offline',
    );
    const regular = cs.find((c) => c !== host && c !== victim)!;
    const denied = await regular.request({ t: 'remove', target: playerId }, ['error']);
    expect(denied).toMatchObject({ code: 'not_host' });

    host.send({ t: 'remove', target: playerId });
    await until(() => host.state!.members.length === 3, 3000, 'removed');
    expect(host.state!.game!.players.map((p) => p.id)).not.toContain(playerId);
    expect(host.state!.log.some((l) => l.text.includes('removed'))).toBe(true);

    const ghost = await client(app);
    const r = await ghost.resume(code, token);
    expect(r).toMatchObject({ t: 'error', code: 'removed', fatal: true });
  });

  it('removing the disconnected player whose turn it is lets everyone else continue', async () => {
    const app = await boot();
    const { cs, host, code } = await setup(app, 3);
    await startGame(cs);
    await settle(cs);
    // Ensure the current player is not the host by drawing until it is a guest's turn.
    const rng = seeded(8);
    for (let i = 0; i < 6 && current(cs) === host; i++) {
      const a = botTurn(host.state!.game!, 'easy', rng)!;
      await host.act(a, { v: 'current' });
      await sleep(30);
    }
    const cur = current(cs);
    expect(cur).not.toBe(host);
    await cur.close();
    await until(() => host.state!.waitingFor?.id === cur.playerId, 3000, 'waiting');
    host.send({ t: 'remove', target: cur.playerId });
    await until(
      () => host.state!.waitingFor === null && host.state!.members.length === 2,
      3000,
      'removed',
    );
    const room = app.manager.rooms.get(code)!;
    const next = room.game!.players[room.game!.current].id;
    expect(next).not.toBe(cur.playerId);
    const nextClient = cs.find((c) => c.playerId === next)!;
    await until(() => nextClient.state!.game!.current === next, 2000, 'state');
    const a = botTurn(nextClient.state!.game!, 'easy', rng);
    expect((await nextClient.act(a!, { v: 'current' })).ok).toBe(true);
  });
});

describe('backend persistence', () => {
  it('recovers an active game after the server restarts', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'chromarush-'));
    try {
      const app1 = await boot({ store: new FileStore(dir) });
      const { cs, code } = await setup(app1, 3);
      await startGame(cs);
      await settle(cs);
      const cur = current(cs);
      await cur.act({ type: 'draw' }, { v: 'current' });
      await sleep(50);
      const creds = cs.map((c) => ({ token: c.token, id: c.playerId, hand: c.state!.game!.hand }));
      const gameBefore = JSON.stringify(app1.manager.rooms.get(code)!.game);
      await app1.manager.flush();
      await app1.close();
      apps.splice(apps.indexOf(app1), 1);

      const app2 = await boot({ store: new FileStore(dir) });
      expect(app2.manager.rooms.has(code)).toBe(true);
      expect(JSON.stringify(app2.manager.rooms.get(code)!.game)).toBe(gameBefore);
      for (const c of creds) {
        const fresh = await client(app2);
        await fresh.resume(code, c.token);
        expect(fresh.playerId).toBe(c.id);
        expect(fresh.state!.game!.hand).toEqual(c.hand);
        expect(fresh.state!.members).toHaveLength(3);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('expires idle rooms', async () => {
    let now = 1_000_000;
    const app = await boot({ lobbyTtlMs: 1000, now: () => now });
    const host = await client(app);
    const code = await host.create('Alice');
    await host.close();
    await sleep(300);
    now += 5000;
    await app.manager.sweep();
    expect(app.manager.rooms.has(code)).toBe(false);
    const x = await client(app);
    const r = await x.resume(code, 'x');
    expect(r).toMatchObject({ code: 'room_not_found' });
  });
});

describe('game completion over the network', () => {
  it('plays a complete 3 player game via sockets, then restarts', async () => {
    const app = await boot({ rng: seeded(21) });
    const { cs } = await setup(app, 3);
    await startGame(cs);
    const rng = seeded(5);
    let actions = 0;
    while (cs[0].state!.status === 'playing' && actions++ < 3000) {
      const c = cs.find((x) => x.state!.game!.current === x.playerId)!;
      const a = botTurn(c.state!.game!, 'medium', rng);
      if (!a) throw new Error('no action');
      const ack = await c.act(a, { v: 'current' });
      if (!ack.ok) throw new Error(`rejected ${JSON.stringify(a)}: ${ack.error?.code}`);
      await until(
        () => cs.every((x) => x.state!.game!.version >= c.state!.game!.version),
        1000,
        'sync',
      );
    }
    await until(() => cs.every((c) => c.state!.status === 'over'), 3000, 'over');
    const g = cs[0].state!.game!;
    expect(g.winner).toBeTruthy();
    expect(g.finalHands).not.toBeNull();
    expect(cs[0].state!.scores[g.winner!]).toBeGreaterThan(0);

    cs[0].send({ t: 'start' }); // play again with the same players
    await until(
      () => cs.every((c) => c.state!.status === 'playing' && c.state!.round === 2),
      3000,
      'rematch',
    );
    expect(cs[1].state!.scores[g.winner!]).toBeGreaterThan(0); // scores persist across rounds
  });
});
