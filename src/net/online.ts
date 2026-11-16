/**
 * Browser side of the multiplayer connection: persistent credentials, automatic
 * reconnection with backoff, heartbeat, and idempotent action retries.
 */
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import type { GameAction } from '../../shared/types';
import { useStore } from '../store';

export interface Creds {
  code: string;
  token: string;
  playerId: string;
}

const KEY = (code: string) => `chromarush.session.${code}`;
const LAST = 'chromarush.last';

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const loadCreds = (code: string): Creds | null =>
  safe(() => JSON.parse(localStorage.getItem(KEY(code)) ?? 'null'), null);
export const lastCode = (): string | null => safe(() => localStorage.getItem(LAST), null);
export function saveCreds(c: Creds) {
  safe(() => {
    localStorage.setItem(KEY(c.code), JSON.stringify(c));
    localStorage.setItem(LAST, c.code);
  }, undefined);
}
export function forgetCreds(code: string) {
  safe(() => {
    localStorage.removeItem(KEY(code));
    if (localStorage.getItem(LAST) === code) localStorage.removeItem(LAST);
  }, undefined);
}

export const wsUrl = () => {
  const env = import.meta.env.VITE_WS_URL as string | undefined;
  if (env) return env;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
};

type Pending = { msg: ClientMsg; resolve: () => void; reject: (e: Error) => void; timer: number };

class OnlineClient {
  private ws: WebSocket | null = null;
  private creds: Creds | null = null;
  private first: ClientMsg | null = null; // create / join message for a brand-new session
  private attempt = 0;
  private retryTimer = 0;
  private hbTimer = 0;
  private lastSeen = 0;
  private wanted = false;
  private pending = new Map<string, Pending>();
  private waiters: Array<{ ok: (m: ServerMsg) => void }> = [];
  private seq = 0;

  get active() {
    return this.wanted;
  }

  /** Open (or re-open) a session. Either resumes `creds` or performs `first` (create/join). */
  start(opts: { creds?: Creds; first?: ClientMsg }) {
    this.stop(false);
    this.creds = opts.creds ?? null;
    this.first = opts.first ?? null;
    this.wanted = true;
    this.attempt = 0;
    useStore.getState().setConn('connecting');
    this.open();
    window.addEventListener('online', this.nudge);
    window.addEventListener('focus', this.nudge);
    document.addEventListener('visibilitychange', this.nudge);
  }

  stop(clearState = true) {
    this.wanted = false;
    window.clearTimeout(this.retryTimer);
    window.clearInterval(this.hbTimer);
    window.removeEventListener('online', this.nudge);
    window.removeEventListener('focus', this.nudge);
    document.removeEventListener('visibilitychange', this.nudge);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    for (const p of this.pending.values()) {
      window.clearTimeout(p.timer);
      p.reject(new Error('Disconnected'));
    }
    this.pending.clear();
    if (clearState) useStore.getState().setConn('idle');
  }

  /** Immediately try to reconnect (also bound to the "Reconnect now" button). */
  nudge = () => {
    if (!this.wanted) return;
    const alive =
      this.ws && this.ws.readyState === WebSocket.OPEN && Date.now() - this.lastSeen < 20000;
    if (alive) return;
    window.clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
    this.attempt = 0;
    useStore.getState().setConn('reconnecting');
    this.open();
  };

  private open() {
    if (!this.wanted) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      return this.scheduleRetry();
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.lastSeen = Date.now();
      if (this.creds) this.raw({ t: 'resume', code: this.creds.code, token: this.creds.token });
      else if (this.first) this.raw(this.first);
      window.clearInterval(this.hbTimer);
      this.hbTimer = window.setInterval(() => {
        if (Date.now() - this.lastSeen > 20000) {
          ws.close();
          return;
        }
        this.raw({ t: 'ping' });
      }, 7000);
    };
    ws.onmessage = (ev) => {
      this.lastSeen = Date.now();
      this.onMessage(JSON.parse(ev.data as string) as ServerMsg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      window.clearInterval(this.hbTimer);
      if (this.wanted) {
        useStore.getState().setConn(this.attempt > 0 ? 'reconnecting' : 'reconnecting');
        this.scheduleRetry();
      }
    };
    ws.onerror = () => ws.close();
  }

  private scheduleRetry() {
    window.clearTimeout(this.retryTimer);
    const delay = Math.min(8000, 400 * 2 ** this.attempt++);
    this.retryTimer = window.setTimeout(() => this.open(), delay);
    if (this.attempt > 12) useStore.getState().setConn('failed');
  }

  private raw(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private onMessage(m: ServerMsg) {
    const st = useStore.getState();
    switch (m.t) {
      case 'welcome':
        this.creds = { code: m.code, token: m.token, playerId: m.playerId };
        this.first = null;
        saveCreds(this.creds);
        st.setConn('online');
        this.attempt = 0;
        // Anything that was in flight when the socket dropped is retried (idempotent ids).
        for (const p of this.pending.values()) {
          if (p.msg.t === 'act') this.raw({ ...p.msg, v: undefined });
        }
        break;
      case 'state':
        st.setView(m.view, 'online');
        st.setRestoring(false);
        break;
      case 'ack': {
        const p = this.pending.get(m.id);
        if (p) {
          window.clearTimeout(p.timer);
          this.pending.delete(m.id);
          if (m.ok) p.resolve();
          else p.reject(new Error(m.error?.message ?? 'Move rejected'));
        }
        break;
      }
      case 'error':
        if (m.fatal) {
          if (this.creds) forgetCreds(this.creds.code);
          this.stop();
          st.setView(null, null);
          st.setRestoring(false);
          st.say(m.message, 'error');
        } else if (m.code !== 'rate_limited') {
          // Errors for create/join are surfaced to whoever is waiting on a reply.
          const w = this.waiters.splice(0);
          if (w.length) w.forEach((x) => x.ok(m));
          else st.say(m.message, 'error');
        }
        break;
      case 'left':
        if (this.creds) forgetCreds(this.creds.code);
        this.stop();
        st.setView(null, null);
        st.say(
          m.reason === 'removed'
            ? 'You were removed from the game by the host.'
            : 'You left the room.',
        );
        break;
      case 'pong':
        break;
    }
    if (m.t === 'welcome' || m.t === 'state') this.waiters.splice(0).forEach((x) => x.ok(m));
  }

  /** Send a one-shot message and wait for the first welcome/state/error reply. */
  async begin(first: ClientMsg): Promise<void> {
    const reply = new Promise<ServerMsg>((ok) => this.waiters.push({ ok }));
    this.start({ first });
    const m = await Promise.race([
      reply,
      new Promise<ServerMsg>((_, rej) =>
        setTimeout(() => rej(new Error('Could not reach the game server.')), 10000),
      ),
    ]).catch((e) => {
      this.stop();
      throw e;
    });
    if (m.t === 'error') {
      this.stop();
      throw new Error(m.message);
    }
  }

  send(msg: ClientMsg) {
    this.raw(msg);
  }

  act(action: GameAction, version?: number): Promise<void> {
    const id = `${Date.now().toString(36)}-${++this.seq}-${Math.random().toString(36).slice(2, 6)}`;
    const msg: ClientMsg = { t: 'act', id, v: version, action };
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('The server did not respond.'));
      }, 15000);
      this.pending.set(id, { msg, resolve, reject, timer });
      this.raw(msg);
    });
  }
}

export const online = new OnlineClient();
