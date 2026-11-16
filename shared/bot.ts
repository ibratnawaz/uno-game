/**
 * Bot decision logic.
 *
 * Bots receive ONLY a GameView (their own hand + public information), exactly like a human
 * client, so they cannot peek at hidden cards. Difficulty changes the *strategy* used to pick
 * among legal moves, never what information is available.
 */
import { COLORS, type Card, type Color, type Difficulty, type GameAction, type Rng } from './types';
import type { GameView, PublicPlayer } from './view';

const chance = (rng: Rng, p: number) => rng() < p;
const pick = <T>(arr: T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)];

/** The player whose turn follows ours, in the current direction. */
function nextOpponent(view: GameView): PublicPlayer {
  const i = view.players.findIndex((p) => p.id === view.you);
  const n = view.players.length;
  return view.players[(((i + view.direction) % n) + n) % n];
}

function colorCounts(hand: Card[]): Record<Color, number> {
  const counts: Record<Color, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of hand) if (c.color !== 'wild') counts[c.color]++;
  return counts;
}

function chooseColor(view: GameView, diff: Difficulty, rng: Rng): Color {
  if (diff === 'easy') return pick([...COLORS], rng);
  const counts = colorCounts(view.hand);
  const max = Math.max(...Object.values(counts));
  if (max === 0) return pick([...COLORS], rng);
  return pick(
    COLORS.filter((c) => counts[c] === max),
    rng,
  );
}

function chooseSwapTarget(view: GameView, diff: Difficulty, rng: Rng): string {
  const others = view.players.filter((p) => p.id !== view.you);
  if (diff === 'easy') return pick(others, rng).id;
  const fewest = Math.min(...others.map((p) => p.handCount));
  return pick(
    others.filter((p) => p.handCount === fewest),
    rng,
  ).id;
}

/** Wild Draw Four held while an active-colour card is in hand would be a bluff; bots never bluff. */
function isBluff(view: GameView, card: Card): boolean {
  return (
    card.value === 'wild4' &&
    !view.pending &&
    view.hand.some((c) => c.id !== card.id && c.color === view.activeColor)
  );
}

function scoreCard(view: GameView, card: Card, diff: Difficulty, rng: Rng): number {
  const next = nextOpponent(view);
  const counts = colorCounts(view.hand);
  const attack = card.value === 'skip' || card.value === 'draw2' || card.value === 'wild4';
  let s = 0;
  if (card.color === 'wild')
    s -= card.value === 'wild4' ? 40 : 30; // keep wilds for emergencies
  else {
    s += counts[card.color]; // lean towards the colour we hold most of
    s += /^\d$/.test(card.value) ? Number(card.value) / 3 : 4;
  }
  if (next.handCount <= 2 && attack) s += 45;
  if (next.handCount <= 2 && card.value === 'reverse' && view.players.length > 2) s += 15;
  if (diff === 'hard') {
    if (view.hand.length <= 2 && card.color === 'wild') s += 60; // finish quickly
    if (view.rules.sevenZero && card.value === '7') {
      const fewest = Math.min(
        ...view.players.filter((p) => p.id !== view.you).map((p) => p.handCount),
      );
      if (view.hand.length - 1 > fewest + 1) s += 25;
    }
    if (next.handCount <= 4 && attack) s += 10;
  }
  return s + (diff === 'medium' ? rng() * 3 : rng() * 0.01);
}

/** Choose the next action when it is this bot's turn (or it owes a pending choice). */
export function botTurn(view: GameView, diff: Difficulty, rng: Rng): GameAction | null {
  if (view.phase === 'over' || view.current !== view.you) return null;

  if (view.phase === 'chooseColor')
    return { type: 'chooseColor', color: chooseColor(view, diff, rng) };
  if (view.phase === 'chooseSwap')
    return { type: 'chooseSwap', target: chooseSwapTarget(view, diff, rng) };

  const playable = view.hand.filter((c) => view.playable.includes(c.id));

  if (view.pending) {
    if (view.pending.challengeable) {
      const p =
        diff === 'easy' ? 0.1 : diff === 'medium' ? 0.25 : view.hand.length >= 5 ? 0.45 : 0.2;
      if (chance(rng, p)) return { type: 'challenge' };
    }
    const stackProb = diff === 'easy' ? 0.5 : diff === 'medium' ? 0.85 : 1;
    if (playable.length > 0 && chance(rng, stackProb)) {
      return { type: 'play', cardId: pick(playable, rng).id };
    }
    return { type: 'draw' };
  }

  if (view.drawnCardId !== null) {
    const drawn = view.hand.find((c) => c.id === view.drawnCardId);
    if (drawn && view.playable.includes(drawn.id) && !isBluff(view, drawn)) {
      return { type: 'play', cardId: drawn.id };
    }
    return { type: 'pass' };
  }

  const options = playable.filter((c) => !isBluff(view, c));
  if (options.length === 0) return { type: 'draw' };
  if (diff === 'easy') return { type: 'play', cardId: pick(options, rng).id };
  const best = options
    .map((c) => ({ c, s: scoreCard(view, c, diff, rng) }))
    .sort((a, b) => b.s - a.s)[0];
  return { type: 'play', cardId: best.c.id };
}

/** Should the bot call UNO right after reducing its hand to one card? */
export function botCallsUno(diff: Difficulty, rng: Rng): boolean {
  return chance(rng, diff === 'easy' ? 0.6 : diff === 'medium' ? 0.9 : 1);
}

/**
 * Out-of-turn reactions: catching an opponent who forgot UNO, or jumping in (house rule).
 * Called by the bot driver on a timer; returns null when there is nothing to do.
 */
export function botReflex(view: GameView, diff: Difficulty, rng: Rng): GameAction | null {
  if (view.phase === 'over') return null;
  if (view.vulnerable && view.vulnerable !== view.you) {
    const p = diff === 'easy' ? 0.15 : diff === 'medium' ? 0.5 : 0.9;
    if (chance(rng, p)) return { type: 'catchUno', target: view.vulnerable };
  }
  if (view.rules.jumpIn && view.current !== view.you && view.phase === 'play' && !view.pending) {
    const p = diff === 'easy' ? 0 : diff === 'medium' ? 0.35 : 0.8;
    const playable = view.hand.filter((c) => view.playable.includes(c.id));
    if (playable.length > 0 && chance(rng, p)) return { type: 'play', cardId: playable[0].id };
  }
  return null;
}

/** Realistic "thinking" delay in ms. */
export function botDelay(diff: Difficulty, rng: Rng): number {
  const [lo, hi] = diff === 'easy' ? [1100, 2000] : diff === 'medium' ? [800, 1600] : [600, 1300];
  return Math.round(lo + rng() * (hi - lo));
}
