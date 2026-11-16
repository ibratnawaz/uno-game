/**
 * Core domain types shared by the engine, bots, server and UI.
 * Nothing in /shared may import React, DOM or Node-only APIs.
 */

export type Color = 'red' | 'yellow' | 'green' | 'blue';
export const COLORS: readonly Color[] = ['red', 'yellow', 'green', 'blue'];

export type CardValue =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild4';

export interface Card {
  /** Unique across every deck in a game (used for identity, never for rules). */
  id: number;
  color: Color | 'wild';
  value: CardValue;
}

/** Which draw-card stacks are allowed. All false = standard rules. */
export interface StackRules {
  draw2OnDraw2: boolean;
  draw4OnDraw4: boolean;
  draw4OnDraw2: boolean;
  draw2OnDraw4: boolean;
}

export interface HouseRules {
  stacking: StackRules;
  sevenZero: boolean;
  jumpIn: boolean;
  drawUntilPlayable: boolean;
  forcePlay: boolean;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 20;
export const HAND_SIZE = 7;

export type Phase = 'play' | 'chooseColor' | 'chooseSwap' | 'over';

/** An outstanding draw penalty the current player must answer. */
export interface Pending {
  kind: 'draw2' | 'draw4';
  amount: number;
  /** Present only for the first (un-stacked) Wild Draw Four: it may be challenged. */
  challenge: { offender: string; legal: boolean; prevColor?: Color } | null;
}

export interface PlayerState {
  id: string;
  name: string;
  hand: Card[];
  unoCalled: boolean;
}

export interface LogEntry {
  n: number;
  text: string;
}

export interface GameState {
  rules: HouseRules;
  players: PlayerState[];
  /** Cards are drawn from the END of the array (pop). Index 0 is the bottom. */
  drawPile: Card[];
  discard: Card[];
  current: number;
  direction: 1 | -1;
  activeColor: Color;
  phase: Phase;
  pending: Pending | null;
  /** A wild card has been played and its colour is awaiting selection. */
  wild: { wild4: boolean; legal: boolean; initial?: boolean; prevColor?: Color } | null;
  /** Card drawn this turn that may still be played (or passed). */
  drawnCardId: number | null;
  /** Player who has one card and has not called UNO yet (catchable). */
  vulnerable: string | null;
  winner: string | null;
  roundPoints: number;
  decks: number;
  /** Increments with every accepted action. */
  version: number;
  log: LogEntry[];
}

export type GameAction =
  | { type: 'play'; cardId: number }
  | { type: 'chooseColor'; color: Color }
  | { type: 'chooseSwap'; target: string }
  | { type: 'draw' }
  | { type: 'pass' }
  | { type: 'challenge' }
  | { type: 'callUno' }
  | { type: 'catchUno'; target: string };

export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type Rng = () => number;

export const defaultRules = (): HouseRules => ({
  stacking: { draw2OnDraw2: false, draw4OnDraw4: false, draw4OnDraw2: false, draw2OnDraw4: false },
  sevenZero: false,
  jumpIn: false,
  drawUntilPlayable: false,
  forcePlay: false,
});

export type Difficulty = 'easy' | 'medium' | 'hard';
