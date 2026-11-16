/** One API for the UI, regardless of whether the game is solo (local) or online. */
import { normalizeCode } from '../../shared/protocol';
import type { GameAction } from '../../shared/types';
import type { Difficulty, HouseRules } from '../../shared/types';
import { useStore } from '../store';
import { forgetCreds, lastCode, loadCreds, online, saveCreds } from './online';
import { resumeSolo, soloAct, soloQuit, soloRematch, startSolo } from './solo';

const st = () => useStore.getState();

export const api = {
  async createRoom(name: string, avatar: number) {
    await online.begin({ t: 'create', name, avatar });
  },
  async joinRoom(code: string, name: string, avatar: number) {
    await online.begin({ t: 'join', code: normalizeCode(code), name, avatar });
  },
  /** Recover a session from a recovery code (new browser/device). */
  async recover(code: string, token: string) {
    const c = normalizeCode(code);
    const t = token.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    saveCreds({ code: c, token: t, playerId: '' });
    st().setRestoring(true);
    online.start({ creds: { code: c, token: t, playerId: '' } });
  },
  startSolo(opts: {
    name: string;
    avatar: number;
    botCount: number;
    difficulty: Difficulty;
    rules: HouseRules;
  }) {
    online.stop();
    startSolo(opts);
  },
  act(action: GameAction): Promise<void> {
    const { mode, view } = st();
    if (mode === 'local') return soloAct(action);
    return online.act(action, view?.game?.version);
  },
  setRules: (rules: HouseRules) => online.send({ t: 'rules', rules }),
  setReady: (ready: boolean) => online.send({ t: 'ready', ready }),
  start() {
    if (st().mode === 'local') soloRematch();
    else online.send({ t: 'start' });
  },
  toLobby: () => online.send({ t: 'lobby' }),
  remove: (target: string) => online.send({ t: 'remove', target }),
  leave() {
    const { mode, view } = st();
    if (mode === 'local') return soloQuit();
    online.send({ t: 'leave' });
    // The server answers with "left"; make sure we reset even if the socket is already gone.
    window.setTimeout(() => {
      if (view) forgetCreds(view.code);
      online.stop();
      st().setView(null, null);
    }, 800);
  },
  reconnectNow: () => online.nudge(),

  /** Called once on page load: resume a solo game or an online session automatically. */
  restore() {
    const params = new URLSearchParams(location.search);
    const inviteCode = normalizeCode(params.get('room') ?? '');
    if (resumeSolo() && !inviteCode) {
      st().setRestoring(false);
      return;
    }
    const code = inviteCode || lastCode();
    const creds = code ? loadCreds(code) : null;
    if (creds && creds.token) {
      online.start({ creds });
      // Give the server a moment; if it fails (fatal) the store resets and we show Home.
      window.setTimeout(() => st().setRestoring(false), 4000);
      return;
    }
    if (inviteCode) st().nav('friends', 'join', inviteCode);
    st().setRestoring(false);
  },
};
