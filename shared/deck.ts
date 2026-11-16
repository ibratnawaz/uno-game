import { COLORS, HAND_SIZE, type Card, type CardValue, type Color, type Rng } from './types';

export const DECK_SIZE = 108;

/**
 * Number of standard 108-card decks required for `players` players.
 * One deck is used while enough cards remain after dealing; larger tables
 * automatically get a second deck. Cards-per-player never changes.
 */
export function decksFor(players: number): number {
  return Math.ceil((players * HAND_SIZE + 40) / DECK_SIZE);
}

/** One standard deck: 19 numbers + 2x(1-9), 2x skip/reverse/draw2 per colour; 4 wild; 4 wild4. */
export function buildDeck(decks = 1): Card[] {
  const cards: Card[] = [];
  let id = 0;
  const push = (color: Card['color'], value: CardValue) => cards.push({ id: id++, color, value });
  for (let d = 0; d < decks; d++) {
    for (const color of COLORS) {
      push(color, '0');
      for (let n = 1; n <= 9; n++) {
        push(color, String(n) as CardValue);
        push(color, String(n) as CardValue);
      }
      for (const v of ['skip', 'reverse', 'draw2'] as const) {
        push(color, v);
        push(color, v);
      }
    }
    for (let i = 0; i < 4; i++) {
      push('wild', 'wild');
      push('wild', 'wild4');
    }
  }
  return cards;
}

/** Fisher-Yates, in place. */
export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Score value of a card when counting the losers' hands. */
export function cardPoints(card: Card): number {
  if (card.value === 'wild' || card.value === 'wild4') return 50;
  if (card.value === 'skip' || card.value === 'reverse' || card.value === 'draw2') return 20;
  return Number(card.value);
}

const COLOR_NAMES: Record<Color | 'wild', string> = {
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  wild: '',
};
const VALUE_NAMES: Record<CardValue, string> = {
  '0': '0',
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  skip: 'Skip',
  reverse: 'Reverse',
  draw2: 'Draw Two',
  wild: 'Wild',
  wild4: 'Wild Draw Four',
};

export function cardName(card: Card): string {
  return `${COLOR_NAMES[card.color]} ${VALUE_NAMES[card.value]}`.trim();
}
export const colorName = (c: Color) => COLOR_NAMES[c];
