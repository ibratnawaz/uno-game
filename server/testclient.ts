/** Minimal WebSocket client used by integration tests. */
import WebSocket from 'ws';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import type { RoomView } from '../shared/room';
import type { GameAction } from '../shared/types';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function until<T>(
  fn: () => T | undefined | false,
  timeout = 5000,
  label = 'condition',
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${label}`);
    await sleep(10);
  }
}

let counter = 0;

export class TestClient {
  ws!: WebSocket;
  msgs: ServerMsg[] = [];
  state?: RoomView;
  code = '';
  playerId = '';
  token = '';
  closed = false;

  static async open(port: number) {
    const c = new TestClient();
    await c.connect(port);
    return c;
  }

  connect(port: number) {
    this.closed = false;
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      this.msgs.push(m);
      if (m.t === 'state') this.state = m.view;
      if (m.t === 'welcome') {
        this.code = m.code;
        this.playerId = m.playerId;
        this.token = m.token;
      }
    });
    this.ws.on('close', () => (this.closed = true));
    return new Promise<void>((res, rej) => {
      this.ws.once('open', () => res());
      this.ws.once('error', rej);
    });
  }

  send(msg: ClientMsg) {
    this.ws.send(JSON.stringify(msg));
  }

  /** Send and wait for the next message of the given type(s). */
  async request(msg: ClientMsg, types: ServerMsg['t'][]) {
    const from = this.msgs.length;
    this.send(msg);
    return until(
      () => this.msgs.slice(from).find((m) => types.includes(m.t)),
      5000,
      `reply to ${msg.t}`,
    );
  }

  async create(name: string) {
    const r = await this.request({ t: 'create', name, avatar: 1 }, ['welcome', 'error']);
    if (r.t === 'error') throw new Error(r.code);
    await until(() => this.state, 2000, 'state');
    return this.code;
  }

  async join(code: string, name: string) {
    const r = await this.request({ t: 'join', code, name, avatar: 2 }, ['welcome', 'error']);
    if (r.t === 'error') throw new Error(r.code);
    await until(() => this.state, 2000, 'state');
  }

  async resume(code: string, token: string) {
    const from = this.msgs.length;
    this.send({ t: 'resume', code, token });
    return until(
      () => this.msgs.slice(from).find((m) => m.t === 'state' || m.t === 'error'),
      5000,
      'resume reply',
    );
  }

  /** Perform a game action and return the ack. */
  async act(action: GameAction, opts: { id?: string; v?: number | 'current' } = {}) {
    const id = opts.id ?? `t${++counter}`;
    const v = opts.v === 'current' ? this.state?.game?.version : opts.v;
    const from = this.msgs.length;
    this.send({ t: 'act', id, v, action });
    const ack = await until(
      () => this.msgs.slice(from).find((m) => m.t === 'ack' && m.id === id),
      5000,
      'ack',
    );
    return ack as Extract<ServerMsg, { t: 'ack' }>;
  }

  /** Last error message received (any type), if newer than `from`. */
  errorsSince(from: number) {
    return this.msgs.slice(from).filter((m) => m.t === 'error');
  }

  close() {
    this.ws.close();
    return until(() => this.closed, 2000, 'close');
  }
}
