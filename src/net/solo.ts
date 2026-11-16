/**
 * Solo "Play With Bots" session. Runs the very same engine and room logic as the server,
 * entirely in the browser, and persists after every move so a refresh resumes the game.
 */
import { botDelay } from '../../shared/bot';
import { planBotMove, type BotMap } from '../../shared/botdriver';
import {
  act,
  addMember,
  buildRoomView,
  createRoom,
  startGame,
  setRules,
  type Room,
} from '../../shared/room';
import {
  defaultRules,
  type Difficulty,
  type GameAction,
  type HouseRules,
} from '../../shared/types';
import { useStore } from '../store';

const KEY = 'chromarush.solo.v1';
export const YOU = 'you';

const BOT_NAMES = [
  'Pixel',
  'Nova',
  'Echo',
  'Blitz',
  'Juno',
  'Rex',
  'Mochi',
  'Zephyr',
  'Ember',
  'Orbit',
  'Pico',
  'Sage',
  'Turbo',
  'Willow',
  'Axel',
  'Luna',
  'Dash',
  'Fizz',
  'Onyx',
  'Kiwi',
];

interface Saved {
  room: Room;
  bots: BotMap;
}

let room: Room | null = null;
let bots: BotMap = {};
let timer = 0;

const safe = (fn: () => void) => {
  try {
    fn();
  } catch {
    /* storage unavailable */
  }
};

function save() {
  const r = room;
  if (!r) return;
  safe(() => localStorage.setItem(KEY, JSON.stringify({ room: r, bots } satisfies Saved)));
}

function publish() {
  if (!room) return;
  useStore.getState().setView(buildRoomView(room, YOU), 'local');
  useStore.getState().setConn('online');
}

function schedule() {
  window.clearTimeout(timer);
  if (!room?.game || room.status !== 'playing') return;
  const plan = planBotMove(room.game, bots, Math.random);
  if (!plan) return;
  timer = window.setTimeout(() => {
    if (!room || room.status !== 'playing') return;
    try {
      act(room, plan.botId, plan.action);
    } catch {
      /* state moved on; re-plan below */
    }
    afterChange();
  }, plan.delay);
}

function afterChange() {
  save();
  publish();
  schedule();
}

export function startSolo(opts: {
  name: string;
  avatar: number;
  botCount: number;
  difficulty: Difficulty;
  rules: HouseRules;
}) {
  const count = Math.max(1, Math.min(19, Math.floor(opts.botCount)));
  room = createRoom('SOLO', { id: YOU, name: opts.name, avatar: opts.avatar, tokenHash: '' });
  bots = {};
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < count; i++) {
    const id = `bot${i + 1}`;
    const base = names[i % names.length];
    const name = i < names.length ? `🤖 ${base}` : `🤖 ${base} ${Math.floor(i / names.length) + 1}`;
    addMember(room, { id, name, avatar: (i * 5 + 3) % 12, tokenHash: '' });
    bots[id] = opts.difficulty;
  }
  setRules(room, YOU, opts.rules ?? defaultRules());
  startGame(room, YOU);
  afterChange();
}

/** Restore a saved solo game after a refresh. Returns true when one was resumed. */
export function resumeSolo(): boolean {
  let saved: Saved | null = null;
  safe(() => (saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')));
  if (!saved || !(saved as Saved).room?.game) return false;
  room = (saved as Saved).room;
  bots = (saved as Saved).bots;
  afterChange();
  return true;
}

export function soloAct(action: GameAction): Promise<void> {
  if (!room) return Promise.reject(new Error('No game'));
  try {
    act(room, YOU, action);
  } catch (e) {
    return Promise.reject(e as Error);
  }
  afterChange();
  return Promise.resolve();
}

export function soloRematch() {
  if (!room) return;
  startGame(room, YOU);
  afterChange();
}

export function soloQuit() {
  window.clearTimeout(timer);
  room = null;
  bots = {};
  safe(() => localStorage.removeItem(KEY));
  useStore.getState().setView(null, null);
  useStore.getState().setConn('idle');
}

export const soloThinkingHint = (d: Difficulty) => botDelay(d, () => 0.5);
