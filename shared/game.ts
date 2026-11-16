/**
 * Pure, deterministic (given an Rng) UNO game engine.
 * `applyAction` never mutates its input; it returns a new state or throws GameError.
 */
import { buildDeck, cardName, cardPoints, colorName, decksFor, shuffle } from './deck';
import { anyStacking, canStack, isPlayable, wild4Legal } from './rules';
import {
  COLORS,
  GameError,
  HAND_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type Card,
  type GameAction,
  type GameState,
  type HouseRules,
  type PlayerState,
  type Rng,
} from './types';

const LOG_CAP = 40;

// ---------------------------------------------------------------- helpers

const clone = <T>(v: T): T => structuredClone(v);
const idxOf = (s: GameState, id: string) => s.players.findIndex((p) => p.id === id);
export const topCard = (s: GameState): Card => s.discard[s.discard.length - 1];
export const currentPlayer = (s: GameState): PlayerState => s.players[s.current];

function log(s: GameState, text: string) {
  s.log.push({ n: s.version, text });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}

/** Index `steps` seats away from `from` in the current direction. */
function seatAfter(s: GameState, from: number, steps = 1): number {
  const n = s.players.length;
  return (((from + s.direction * steps) % n) + n) % n;
}
const advance = (s: GameState, steps = 1) => {
  s.current = seatAfter(s, s.current, steps);
};

/** Draw up to `count` cards, reshuffling the discard pile (keeping the top card) if needed. */
function drawCards(s: GameState, count: number, rng: Rng): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (s.drawPile.length === 0) {
      if (s.discard.length <= 1) break;
      const top = s.discard.pop() as Card;
      s.drawPile = shuffle(s.discard, rng);
      s.discard = [top];
      log(s, 'The discard pile was reshuffled into the draw pile.');
    }
    out.push(s.drawPile.pop() as Card);
  }
  return out;
}

function give(s: GameState, p: PlayerState, count: number, rng: Rng): Card[] {
  const cards = drawCards(s, count, rng);
  p.hand.push(...cards);
  if (p.hand.length > 2) p.unoCalled = false;
  return cards;
}

// ---------------------------------------------------------------- setup

export interface PlayerSeed {
  id: string;
  name: string;
}

export function createGame(
  seeds: PlayerSeed[],
  rules: HouseRules,
  rng: Rng = Math.random,
): GameState {
  if (seeds.length < MIN_PLAYERS)
    throw new GameError('too_few_players', 'At least 2 players are required.');
  if (seeds.length > MAX_PLAYERS)
    throw new GameError('too_many_players', 'At most 20 players are allowed.');
  if (new Set(seeds.map((p) => p.id)).size !== seeds.length)
    throw new GameError('duplicate_player', 'Duplicate player id.');

  const decks = decksFor(seeds.length);
  const s: GameState = {
    rules: clone(rules),
    players: seeds.map((p) => ({ id: p.id, name: p.name, hand: [], unoCalled: false })),
    drawPile: shuffle(buildDeck(decks), rng),
    discard: [],
    current: 0,
    direction: 1,
    activeColor: 'red',
    phase: 'play',
    pending: null,
    wild: null,
    drawnCardId: null,
    vulnerable: null,
    winner: null,
    roundPoints: 0,
    decks,
    version: 0,
    log: [],
  };

  for (let r = 0; r < HAND_SIZE; r++)
    for (const p of s.players) p.hand.push(s.drawPile.pop() as Card);

  // Starting card: a Wild Draw Four is returned to the deck and replaced.
  let start = s.drawPile.pop() as Card;
  while (start.value === 'wild4') {
    s.drawPile.unshift(start);
    shuffle(s.drawPile, rng);
    start = s.drawPile.pop() as Card;
  }
  s.discard.push(start);
  s.activeColor = start.color === 'wild' ? COLORS[Math.floor(rng() * 4)] : start.color;

  // The dealer is chosen at random; play starts with the player on the dealer's left.
  const dealer = Math.floor(rng() * s.players.length);
  s.current = dealer;
  advance(s, 1);
  log(s, `Game started. ${currentPlayer(s).name} goes first. Top card: ${cardName(start)}.`);

  switch (start.value) {
    case 'skip':
      log(s, `${currentPlayer(s).name} is skipped by the starting card.`);
      advance(s, 1);
      break;
    case 'reverse':
      // Direction reverses and the dealer plays first.
      s.direction = -1;
      s.current = dealer;
      log(s, 'Starting Reverse: direction flipped, the dealer goes first.');
      break;
    case 'draw2': {
      const p = currentPlayer(s);
      give(s, p, 2, rng);
      log(s, `${p.name} draws 2 and is skipped (starting Draw Two).`);
      advance(s, 1);
      break;
    }
    case 'wild':
      // Starting wild: the first player chooses the colour as the "wild" is theirs to set.
      s.phase = 'chooseColor';
      s.wild = { wild4: false, legal: true, initial: true };
      log(s, `${currentPlayer(s).name} chooses the starting colour.`);
      break;
    default:
      break;
  }
  return s;
}

// ---------------------------------------------------------------- queries

/** Can `playerId` legally play `card` right now (including jump-in and stacking)? */
export function canPlayCard(s: GameState, playerId: string, card: Card): boolean {
  if (s.phase !== 'play') return false;
  const i = idxOf(s, playerId);
  if (i < 0) return false;
  const p = s.players[i];
  if (!p.hand.some((c) => c.id === card.id)) return false;
  const top = topCard(s);
  if (i !== s.current) {
    return (
      s.rules.jumpIn &&
      !s.pending &&
      s.drawnCardId === null &&
      card.color !== 'wild' &&
      top.color !== 'wild' &&
      card.color === top.color &&
      card.value === top.value
    );
  }
  if (s.pending) return canStack(s.rules, s.pending, card, s.activeColor);
  if (s.drawnCardId !== null)
    return card.id === s.drawnCardId && isPlayable(card, top, s.activeColor);
  return isPlayable(card, top, s.activeColor);
}

export function playableCards(s: GameState, playerId: string): Card[] {
  const p = s.players.find((x) => x.id === playerId);
  return p ? p.hand.filter((c) => canPlayCard(s, playerId, c)) : [];
}

// ---------------------------------------------------------------- effects

/** If the current player owes a penalty and cannot stack, apply it immediately. */
function autoResolvePenalty(s: GameState, rng: Rng) {
  const pen = s.pending;
  if (!pen || pen.challenge || s.phase === 'over') return;
  const p = currentPlayer(s);
  if (anyStacking(s.rules) && p.hand.some((c) => canStack(s.rules, pen, c, s.activeColor))) return;
  takePenalty(s, rng);
}

function takePenalty(s: GameState, rng: Rng) {
  const pen = s.pending as NonNullable<GameState['pending']>;
  const p = currentPlayer(s);
  const got = give(s, p, pen.amount, rng);
  log(s, `${p.name} draws ${got.length} card${got.length === 1 ? '' : 's'} and loses the turn.`);
  s.pending = null;
  advance(s, 1);
}

function endRound(s: GameState, winnerIdx: number, rng: Rng, last: Card) {
  // A final +2/+4 still forces the next player to draw before points are counted.
  if (last.value === 'draw2' || last.value === 'wild4') {
    const amount = (s.pending?.amount ?? 0) + (last.value === 'draw2' ? 2 : 4);
    const victim = s.players[seatAfter(s, winnerIdx, 1)];
    if (victim.id !== s.players[winnerIdx].id) give(s, victim, amount, rng);
  }
  s.phase = 'over';
  s.pending = null;
  s.wild = null;
  s.vulnerable = null;
  s.drawnCardId = null;
  s.winner = s.players[winnerIdx].id;
  s.roundPoints = s.players.reduce(
    (sum, p, i) => (i === winnerIdx ? sum : sum + p.hand.reduce((a, c) => a + cardPoints(c), 0)),
    0,
  );
  log(s, `${s.players[winnerIdx].name} wins the round and scores ${s.roundPoints} points!`);
}

/** Core card placement shared by normal play, drawn-card play, force play and jump-in. */
function placeCard(
  s: GameState,
  idx: number,
  card: Card,
  rng: Rng,
  how: 'play' | 'jump' | 'forced',
) {
  const p = s.players[idx];
  const prevColor = s.activeColor;
  p.hand.splice(
    p.hand.findIndex((c) => c.id === card.id),
    1,
  );
  s.discard.push(card);
  s.drawnCardId = null;
  s.vulnerable = null;
  if (how === 'jump') {
    s.current = idx;
    log(s, `${p.name} jumps in with ${cardName(card)}!`);
  } else {
    log(s, `${p.name} ${how === 'forced' ? 'is forced to play' : 'plays'} ${cardName(card)}.`);
  }

  if (p.hand.length === 0) {
    if (card.color !== 'wild') s.activeColor = card.color;
    return endRound(s, idx, rng, card);
  }
  if (p.hand.length === 1 && !p.unoCalled) s.vulnerable = p.id;

  if (card.color !== 'wild') s.activeColor = card.color;

  switch (card.value) {
    case 'skip':
      log(s, `${s.players[seatAfter(s, idx, 1)].name} is skipped.`);
      advance(s, 2);
      break;
    case 'reverse':
      if (s.players.length === 2) {
        advance(s, 2);
        log(s, 'Reverse acts as a Skip with two players.');
      } else {
        s.direction = s.direction === 1 ? -1 : 1;
        advance(s, 1);
        log(s, 'Direction reversed.');
      }
      break;
    case 'draw2': {
      const base = s.pending ? s.pending.amount : 0;
      s.pending = { kind: 'draw2', amount: base + 2, challenge: null };
      advance(s, 1);
      autoResolvePenalty(s, rng);
      break;
    }
    case 'wild':
      s.phase = 'chooseColor';
      s.wild = { wild4: false, legal: true };
      break;
    case 'wild4': {
      s.phase = 'chooseColor';
      // Legality is judged against the colour that was active BEFORE this card.
      s.wild = { wild4: true, legal: s.pending ? true : wild4Legal(p.hand, prevColor, card.id) };
      break;
    }
    case '7':
      if (s.rules.sevenZero) {
        s.phase = 'chooseSwap';
        break;
      }
      advance(s, 1);
      break;
    case '0':
      if (s.rules.sevenZero) rotateHands(s);
      advance(s, 1);
      break;
    default:
      advance(s, 1);
  }
}

function rotateHands(s: GameState) {
  const hands = s.players.map((p) => p.hand);
  s.players.forEach((p, i) => {
    p.hand = hands[seatAfter(s, i, -1)];
    p.unoCalled = false;
  });
  s.vulnerable = null;
  log(s, 'Everyone passes their hand along (0 played).');
}

// ---------------------------------------------------------------- actions

function requireTurn(s: GameState, i: number) {
  if (s.phase === 'over') throw new GameError('game_over', 'The round is over.');
  if (i < 0) throw new GameError('not_in_game', 'You are not in this game.');
  if (i !== s.current) throw new GameError('not_your_turn', 'It is not your turn.');
}

/**
 * Apply a validated action on behalf of `playerId`. Returns the NEW state.
 * Throws GameError for anything illegal; the input state is left untouched.
 */
export function applyAction(
  prev: GameState,
  playerId: string,
  action: GameAction,
  rng: Rng = Math.random,
): GameState {
  const s = clone(prev);
  const i = idxOf(s, playerId);
  s.version = prev.version + 1;

  switch (action.type) {
    case 'play': {
      if (s.phase === 'over') throw new GameError('game_over', 'The round is over.');
      if (i < 0) throw new GameError('not_in_game', 'You are not in this game.');
      if (s.phase !== 'play')
        throw new GameError('pending_choice', 'Finish the pending choice first.');
      const card = s.players[i].hand.find((c) => c.id === action.cardId);
      if (!card) throw new GameError('no_such_card', 'You do not hold that card.');
      if (!canPlayCard(s, playerId, card)) {
        if (i !== s.current)
          throw new GameError('cannot_jump_in', 'You can only jump in with an identical card.');
        if (s.pending)
          throw new GameError(
            'must_answer_penalty',
            'Stack a matching draw card or draw the penalty.',
          );
        if (s.drawnCardId !== null)
          throw new GameError('must_play_drawn', 'You may only play the card you just drew.');
        throw new GameError('illegal_card', 'That card cannot be played now.');
      }
      placeCard(s, i, card, rng, i === s.current ? 'play' : 'jump');
      return s;
    }

    case 'chooseColor': {
      requireTurn(s, i);
      if (s.phase !== 'chooseColor' || !s.wild)
        throw new GameError('no_color_choice', 'No colour choice pending.');
      if (!COLORS.includes(action.color)) throw new GameError('bad_color', 'Invalid colour.');
      const w = s.wild;
      s.activeColor = action.color;
      s.phase = 'play';
      s.wild = null;
      log(s, `${s.players[i].name} chose ${colorName(action.color)}.`);
      if (w.initial) return s; // starting wild: the chooser then plays normally
      if (w.wild4) {
        s.pending = s.pending
          ? { kind: 'draw4', amount: s.pending.amount + 4, challenge: null }
          : { kind: 'draw4', amount: 4, challenge: { offender: s.players[i].id, legal: w.legal } };
        advance(s, 1);
        autoResolvePenalty(s, rng);
      } else advance(s, 1);
      return s;
    }

    case 'chooseSwap': {
      requireTurn(s, i);
      if (s.phase !== 'chooseSwap') throw new GameError('no_swap_choice', 'No swap pending.');
      const t = idxOf(s, action.target);
      if (t < 0 || t === i) throw new GameError('bad_target', 'Choose another player.');
      [s.players[i].hand, s.players[t].hand] = [s.players[t].hand, s.players[i].hand];
      s.players[i].unoCalled = false;
      s.players[t].unoCalled = false;
      s.phase = 'play';
      s.vulnerable = null;
      log(s, `${s.players[i].name} swaps hands with ${s.players[t].name}.`);
      advance(s, 1);
      return s;
    }

    case 'draw': {
      requireTurn(s, i);
      if (s.phase !== 'play')
        throw new GameError('pending_choice', 'Finish the pending choice first.');
      if (s.drawnCardId !== null)
        throw new GameError('already_drew', 'You already drew. Play the card or pass.');
      s.vulnerable = null;
      const p = s.players[i];
      if (s.pending) {
        takePenalty(s, rng);
        return s;
      }
      let drawn: Card | undefined;
      let count = 0;
      const top = topCard(s);
      do {
        drawn = drawCards(s, 1, rng)[0];
        if (drawn) {
          p.hand.push(drawn);
          count++;
        }
      } while (s.rules.drawUntilPlayable && drawn && !isPlayable(drawn, top, s.activeColor));
      p.unoCalled = false;
      log(s, `${p.name} draws ${count} card${count === 1 ? '' : 's'}.`);
      if (drawn && isPlayable(drawn, top, s.activeColor)) {
        if (s.rules.forcePlay) {
          placeCard(s, i, drawn, rng, 'forced');
        } else {
          s.drawnCardId = drawn.id;
        }
      } else {
        advance(s, 1);
      }
      return s;
    }

    case 'pass': {
      requireTurn(s, i);
      if (s.drawnCardId === null) throw new GameError('must_draw', 'Draw a card before passing.');
      s.vulnerable = null;
      s.drawnCardId = null;
      log(s, `${s.players[i].name} passes.`);
      advance(s, 1);
      return s;
    }

    case 'challenge': {
      requireTurn(s, i);
      const ch = s.pending?.challenge;
      if (!s.pending || !ch) throw new GameError('no_challenge', 'There is nothing to challenge.');
      s.vulnerable = null;
      const offenderIdx = idxOf(s, ch.offender);
      const me = s.players[i];
      const offender = s.players[offenderIdx];
      if (!ch.legal && offender) {
        const got = give(s, offender, s.pending.amount, rng);
        log(
          s,
          `Challenge succeeded! ${offender.name} had a matching colour and draws ${got.length}.`,
        );
        s.pending = null; // challenger keeps the turn
      } else {
        const total = s.pending.amount + 2;
        const got = give(s, me, total, rng);
        log(s, `Challenge failed. ${me.name} draws ${got.length} and loses the turn.`);
        s.pending = null;
        advance(s, 1);
      }
      return s;
    }

    case 'callUno': {
      if (i < 0) throw new GameError('not_in_game', 'You are not in this game.');
      if (s.phase === 'over') throw new GameError('game_over', 'The round is over.');
      const p = s.players[i];
      const early = p.hand.length === 2 && i === s.current;
      if (p.hand.length !== 1 && !early)
        throw new GameError('cannot_call_uno', 'You can only call UNO with one card left.');
      if (p.unoCalled && s.vulnerable !== p.id)
        throw new GameError('already_called', 'UNO already called.');
      p.unoCalled = true;
      if (s.vulnerable === p.id) s.vulnerable = null;
      log(s, `${p.name} calls UNO!`);
      return s;
    }

    case 'catchUno': {
      if (i < 0) throw new GameError('not_in_game', 'You are not in this game.');
      if (s.phase === 'over') throw new GameError('game_over', 'The round is over.');
      const t = idxOf(s, action.target);
      if (t < 0 || s.vulnerable !== action.target || t === i)
        throw new GameError('nothing_to_catch', 'Nobody can be caught right now.');
      const target = s.players[t];
      give(s, target, 2, rng);
      target.unoCalled = false;
      s.vulnerable = null;
      log(s, `${s.players[i].name} caught ${target.name} without UNO! ${target.name} draws 2.`);
      return s;
    }
  }
}

// ---------------------------------------------------------------- removal

/**
 * Remove a player from an ongoing game (host action for disconnected/abandoned players).
 * Cleanup policy (deterministic): the removed player's hand is placed, in hand order, at the
 * BOTTOM of the draw pile; any pending choice/penalty aimed at them is cancelled and the turn
 * passes to the next player in the direction of play.
 */
export function removePlayer(prev: GameState, playerId: string): GameState {
  const s = clone(prev);
  const idx = idxOf(s, playerId);
  if (idx < 0) throw new GameError('not_in_game', 'Player is not in this game.');
  s.version = prev.version + 1;
  const [gone] = s.players.splice(idx, 1);
  s.drawPile.unshift(...[...gone.hand].reverse());
  log(s, `${gone.name} was removed from the game.`);

  if (s.vulnerable === gone.id) s.vulnerable = null;
  if (s.pending?.challenge?.offender === gone.id) s.pending.challenge = null;

  const n = s.players.length;
  if (s.phase !== 'over' && n === 1) {
    s.phase = 'over';
    s.winner = s.players[0].id;
    s.roundPoints = 0;
    s.pending = null;
    s.wild = null;
    log(s, `${s.players[0].name} wins because everyone else left.`);
    return s;
  }
  if (idx < s.current) {
    s.current -= 1;
  } else if (idx === s.current) {
    // The next player in the direction of play now sits at this seat (or the one before it).
    s.current = s.direction === 1 ? idx % n : (idx - 1 + n) % n;
    s.pending = null;
    s.wild = null;
    s.drawnCardId = null;
    if (s.phase !== 'over') s.phase = 'play';
  }
  s.current = ((s.current % n) + n) % n;
  return s;
}
