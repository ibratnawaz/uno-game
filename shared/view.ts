/**
 * Per-player projection of the authoritative game state.
 * This is the ONLY shape ever sent to clients or handed to bots, so it must never
 * contain another player's hand, the draw pile order or the hidden discard history.
 */
import { canPlayCard, topCard } from './game';
import type { Card, Color, GameState, HouseRules, Phase } from './types';

export interface PublicPlayer {
  id: string;
  name: string;
  handCount: number;
  unoCalled: boolean;
}

export interface GameView {
  you: string;
  hand: Card[];
  /** Ids of cards in `hand` that can be played right now (turn, stacking or jump-in). */
  playable: number[];
  players: PublicPlayer[];
  current: string;
  direction: 1 | -1;
  activeColor: Color;
  top: Card;
  drawCount: number;
  discardCount: number;
  phase: Phase;
  /** Outstanding draw penalty (public); `challengeable` only matters to the current player. */
  pending: { kind: 'draw2' | 'draw4'; amount: number; challengeable: boolean } | null;
  drawnCardId: number | null;
  vulnerable: string | null;
  winner: string | null;
  roundPoints: number;
  decks: number;
  rules: HouseRules;
  version: number;
  /** Revealed only once the round is over. */
  finalHands: Record<string, Card[]> | null;
}

export function gameViewFor(s: GameState, playerId: string): GameView {
  const me = s.players.find((p) => p.id === playerId);
  const hand = me ? me.hand : [];
  return {
    you: playerId,
    hand,
    playable: me ? hand.filter((c) => canPlayCard(s, playerId, c)).map((c) => c.id) : [],
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      handCount: p.hand.length,
      unoCalled: p.unoCalled,
    })),
    current: s.players[s.current].id,
    direction: s.direction,
    activeColor: s.activeColor,
    top: topCard(s),
    drawCount: s.drawPile.length,
    discardCount: s.discard.length,
    phase: s.phase,
    pending: s.pending
      ? { kind: s.pending.kind, amount: s.pending.amount, challengeable: !!s.pending.challenge }
      : null,
    drawnCardId: playerId === s.players[s.current].id ? s.drawnCardId : null,
    vulnerable: s.vulnerable,
    winner: s.winner,
    roundPoints: s.roundPoints,
    decks: s.decks,
    rules: s.rules,
    version: s.version,
    finalHands:
      s.phase === 'over' ? Object.fromEntries(s.players.map((p) => [p.id, p.hand])) : null,
  };
}
