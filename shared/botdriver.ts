/**
 * Decides which bot should act next. Pure: the caller owns timers and applies the action.
 * Used by the browser's solo mode and by the bot simulation tests.
 */
import { botCallsUno, botDelay, botReflex, botTurn } from './bot';
import type { Difficulty, GameAction, GameState, Rng } from './types';
import { gameViewFor } from './view';

export type BotMap = Record<string, Difficulty>;

export interface BotMove {
  botId: string;
  action: GameAction;
  /** Suggested wait before applying, to feel human. */
  delay: number;
}

export function planBotMove(game: GameState, bots: BotMap, rng: Rng): BotMove | null {
  if (game.phase === 'over') return null;

  // 1. A bot that just dropped to one card may call UNO (or forget, depending on difficulty).
  if (game.vulnerable && bots[game.vulnerable] && botCallsUno(bots[game.vulnerable], rng)) {
    return {
      botId: game.vulnerable,
      action: { type: 'callUno' },
      delay: 250 + Math.round(rng() * 450),
    };
  }

  // 2. Out-of-turn reactions (catching a missed UNO, jump-in).
  const current = game.players[game.current].id;
  for (const p of game.players) {
    const diff = bots[p.id];
    if (!diff || p.id === current) continue;
    const action = botReflex(gameViewFor(game, p.id), diff, rng);
    if (action) return { botId: p.id, action, delay: 500 + Math.round(rng() * 700) };
  }

  // 3. The bot whose turn it is.
  const diff = bots[current];
  if (!diff) return null;
  const action = botTurn(gameViewFor(game, current), diff, rng);
  return action ? { botId: current, action, delay: botDelay(diff, rng) } : null;
}
