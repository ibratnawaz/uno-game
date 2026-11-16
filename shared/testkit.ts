/** Helpers for building hand-crafted game states in tests. */
import {
  defaultRules,
  type Card,
  type CardValue,
  type Color,
  type GameState,
  type HouseRules,
} from './types';

let nextId = 10_000;
export const C = (color: Card['color'], value: CardValue): Card => ({ id: nextId++, color, value });

/** Deterministic rng (mulberry32). */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Scenario {
  hands: Card[][];
  top: Card;
  active?: Color;
  rules?: Partial<Omit<HouseRules, 'stacking'>> & { stacking?: Partial<HouseRules['stacking']> };
  drawPile?: Card[];
  current?: number;
  direction?: 1 | -1;
}

/** Players are named p0, p1, ... with ids "p0", "p1", ... */
export function scenario(sc: Scenario): GameState {
  const base = defaultRules();
  const rules: HouseRules = {
    ...base,
    ...sc.rules,
    stacking: { ...base.stacking, ...(sc.rules?.stacking ?? {}) },
  };
  const filler = Array.from({ length: 40 }, (_, i) =>
    C(i % 2 ? 'blue' : 'green', String(i % 10) as CardValue),
  );
  return {
    rules,
    players: sc.hands.map((hand, i) => ({ id: `p${i}`, name: `P${i}`, hand, unoCalled: false })),
    drawPile: sc.drawPile ?? filler,
    discard: [sc.top],
    current: sc.current ?? 0,
    direction: sc.direction ?? 1,
    activeColor: sc.active ?? (sc.top.color === 'wild' ? 'red' : sc.top.color),
    phase: 'play',
    pending: null,
    wild: null,
    drawnCardId: null,
    vulnerable: null,
    winner: null,
    roundPoints: 0,
    decks: 1,
    version: 0,
    log: [],
  };
}

/** Total number of cards anywhere in the game (conservation check). */
export const totalCards = (s: GameState) =>
  s.drawPile.length + s.discard.length + s.players.reduce((n, p) => n + p.hand.length, 0);
