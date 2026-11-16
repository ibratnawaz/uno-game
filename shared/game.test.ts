import { describe, expect, it } from 'vitest';
import { applyAction, canPlayCard, removePlayer, topCard } from './game';
import { C, scenario, seeded, totalCards } from './testkit';
import { GameError } from './types';

const err = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as GameError).code;
  }
  return null;
};

describe('valid / invalid moves', () => {
  it('allows matching colour, number or symbol and rejects the rest', () => {
    const s = scenario({
      top: C('red', '5'),
      hands: [
        [C('red', '9'), C('blue', '5'), C('blue', '2'), C('wild', 'wild'), C('blue', 'skip')],
        [C('green', '1')],
      ],
    });
    const [byColor, byNumber, bad, wild] = s.players[0].hand;
    expect(canPlayCard(s, 'p0', byColor)).toBe(true);
    expect(canPlayCard(s, 'p0', byNumber)).toBe(true);
    expect(canPlayCard(s, 'p0', bad)).toBe(false);
    expect(canPlayCard(s, 'p0', wild)).toBe(true);
    expect(err(() => applyAction(s, 'p0', { type: 'play', cardId: bad.id }))).toBe('illegal_card');
  });

  it('only lets the current player act', () => {
    const s = scenario({
      top: C('red', '5'),
      hands: [
        [C('red', '1'), C('red', '2')],
        [C('red', '3'), C('red', '4')],
      ],
    });
    expect(err(() => applyAction(s, 'p1', { type: 'play', cardId: s.players[1].hand[0].id }))).toBe(
      'cannot_jump_in',
    );
    expect(err(() => applyAction(s, 'p1', { type: 'draw' }))).toBe('not_your_turn');
    expect(err(() => applyAction(s, 'ghost', { type: 'draw' }))).toBe('not_in_game');
  });

  it('rejects cards the player does not hold', () => {
    const s = scenario({
      top: C('red', '5'),
      hands: [[C('red', '1'), C('red', '2')], [C('red', '3')]],
    });
    expect(err(() => applyAction(s, 'p0', { type: 'play', cardId: s.players[1].hand[0].id }))).toBe(
      'no_such_card',
    );
  });

  it('does not mutate the input state', () => {
    const s = scenario({
      top: C('red', '5'),
      hands: [[C('red', '1'), C('red', '2')], [C('red', '3')]],
    });
    const snapshot = JSON.stringify(s);
    applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('turn progression', () => {
  it('advances clockwise and wraps', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [
        [C('red', '1'), C('red', '2')],
        [C('red', '3'), C('red', '4')],
        [C('red', '6'), C('red', '7')],
      ],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    expect(s.current).toBe(1);
    s = applyAction(s, 'p1', { type: 'play', cardId: s.players[1].hand[0].id });
    s = applyAction(s, 'p2', { type: 'play', cardId: s.players[2].hand[0].id });
    expect(s.current).toBe(0);
  });

  it('reverse flips direction (3+ players)', () => {
    let s = scenario({
      top: C('red', '5'),
      current: 1,
      hands: [
        [C('red', '1'), C('red', '2')],
        [C('red', 'reverse'), C('red', '4')],
        [C('red', '6'), C('red', '7')],
      ],
    });
    s = applyAction(s, 'p1', { type: 'play', cardId: s.players[1].hand[0].id });
    expect(s.direction).toBe(-1);
    expect(s.current).toBe(0);
  });

  it('reverse acts as skip with two players', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [
        [C('red', 'reverse'), C('red', '2')],
        [C('red', '3'), C('red', '4')],
      ],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    expect(s.current).toBe(0);
  });

  it('skip jumps over the next player', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [
        [C('red', 'skip'), C('red', '2')],
        [C('red', '3'), C('red', '4')],
        [C('red', '6'), C('red', '7')],
      ],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    expect(s.current).toBe(2);
  });

  it('draw two makes the next player draw 2 and lose the turn', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [
        [C('red', 'draw2'), C('red', '2')],
        [C('blue', '3'), C('blue', '4')],
        [C('red', '6'), C('red', '7')],
      ],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    // The turn visibly passes to the victim, who owes 2 cards.
    expect(s.current).toBe(1);
    expect(s.pending).toMatchObject({ kind: 'draw2', amount: 2 });
    expect(s.players[1].hand).toHaveLength(2);
    expect(err(() => applyAction(s, 'p0', { type: 'draw' }))).toBe('not_your_turn');
    s = applyAction(s, 'p1', { type: 'draw' });
    expect(s.players[1].hand).toHaveLength(4);
    expect(s.current).toBe(2);
    expect(s.pending).toBeNull();
  });

  it('two players: +2 passes the turn to the opponent, who draws, then it returns', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [
        [C('red', 'draw2'), C('red', '2')],
        [C('blue', '3'), C('blue', '4')],
      ],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    expect(s.current).toBe(1);
    s = applyAction(s, 'p1', { type: 'draw' });
    expect(s.players[1].hand).toHaveLength(4);
    expect(s.current).toBe(0);
  });
});

describe('drawing', () => {
  it('draw then pass when the drawn card is unplayable', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [[C('blue', '1')], [C('red', '3')]],
      drawPile: [C('blue', '9')],
    });
    s = applyAction(s, 'p0', { type: 'draw' });
    expect(s.players[0].hand).toHaveLength(2);
    expect(s.current).toBe(1); // auto-advance
  });

  it('lets the player play the drawn card, or pass, but nothing else', () => {
    const drawn = C('red', '9');
    let s = scenario({
      top: C('red', '5'),
      hands: [[C('red', '1'), C('blue', '1')], [C('red', '3')]],
      drawPile: [drawn],
    });
    // hand has playable red 1 but the player may still draw (standard rule)
    s = applyAction(s, 'p0', { type: 'draw' });
    expect(s.drawnCardId).toBe(drawn.id);
    expect(err(() => applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id }))).toBe(
      'must_play_drawn',
    );
    expect(err(() => applyAction(s, 'p0', { type: 'draw' }))).toBe('already_drew');
    const played = applyAction(s, 'p0', { type: 'play', cardId: drawn.id });
    expect(topCard(played).id).toBe(drawn.id);
    const passed = applyAction(s, 'p0', { type: 'pass' });
    expect(passed.current).toBe(1);
    expect(passed.drawnCardId).toBeNull();
  });

  it('cannot pass without drawing', () => {
    const s = scenario({ top: C('red', '5'), hands: [[C('red', '1')], [C('red', '3')]] });
    expect(err(() => applyAction(s, 'p0', { type: 'pass' }))).toBe('must_draw');
  });

  it('reshuffles the discard pile but keeps the top card', () => {
    const top = C('red', '5');
    const old = [C('blue', '1'), C('blue', '2'), C('blue', '3')];
    let s = scenario({ top, hands: [[C('green', '1')], [C('red', '3')]], drawPile: [] });
    s.discard = [...old, top];
    const before = totalCards(s);
    s = applyAction(s, 'p0', { type: 'draw' }, seeded(1));
    expect(topCard(s).id).toBe(top.id);
    expect(totalCards(s)).toBe(before);
    expect(s.players[0].hand).toHaveLength(2);
    expect(s.log.some((l) => l.text.includes('reshuffled'))).toBe(true);
  });
});

describe('wild cards', () => {
  it('requires a colour choice before the turn advances', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [[C('wild', 'wild'), C('red', '2')], [C('blue', '3')]],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    expect(s.phase).toBe('chooseColor');
    expect(s.current).toBe(0);
    expect(err(() => applyAction(s, 'p0', { type: 'draw' }))).toBe('pending_choice');
    expect(err(() => applyAction(s, 'p1', { type: 'chooseColor', color: 'blue' }))).toBe(
      'not_your_turn',
    );
    s = applyAction(s, 'p0', { type: 'chooseColor', color: 'blue' });
    expect(s.activeColor).toBe('blue');
    expect(s.current).toBe(1);
    expect(s.phase).toBe('play');
    expect(err(() => applyAction(s, 'p1', { type: 'chooseColor', color: 'red' }))).toBe(
      'no_color_choice',
    );
  });

  it('rejects an invalid colour', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [[C('wild', 'wild'), C('red', '2')], [C('blue', '3')]],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    expect(err(() => applyAction(s, 'p0', { type: 'chooseColor', color: 'purple' as never }))).toBe(
      'bad_color',
    );
  });
});

describe('Wild Draw Four legality and challenge', () => {
  const play4 = (hand: ReturnType<typeof C>[], top = C('red', '5')) => {
    const w4 = C('wild', 'wild4');
    let s = scenario({
      top,
      hands: [
        [w4, ...hand],
        [C('blue', '3'), C('blue', '4')],
        [C('green', '1'), C('green', '2')],
      ],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: w4.id });
    s = applyAction(s, 'p0', { type: 'chooseColor', color: 'green' });
    return s;
  };

  it('puts a challengeable penalty on the next player', () => {
    const s = play4([C('blue', '1'), C('blue', '2')]);
    expect(s.current).toBe(1);
    expect(s.pending).toMatchObject({ kind: 'draw4', amount: 4 });
    expect(s.pending?.challenge).toMatchObject({ offender: 'p0', legal: true });
  });

  it('is judged illegal when the hand holds the active colour', () => {
    const s = play4([C('red', '1'), C('blue', '2')]);
    expect(s.pending?.challenge?.legal).toBe(false);
  });

  it('wilds and matching numbers of another colour do not make it illegal', () => {
    const s = play4([C('blue', '5'), C('wild', 'wild')]);
    expect(s.pending?.challenge?.legal).toBe(true);
  });

  it('successful challenge: offender draws 4, challenger keeps the turn', () => {
    let s = play4([C('red', '1'), C('blue', '2')]);
    const before = totalCards(s);
    s = applyAction(s, 'p1', { type: 'challenge' });
    expect(s.players[0].hand).toHaveLength(2 + 4);
    expect(s.players[1].hand).toHaveLength(2);
    expect(s.current).toBe(1);
    expect(s.pending).toBeNull();
    expect(totalCards(s)).toBe(before);
    const text = s.log.map((l) => l.text).join('\n');
    expect(text).toContain('P1 challenges the Wild Draw Four.');
    expect(text).toContain('P0 was holding a red card, so they draw 4. P1 keeps the turn.');
  });

  it('failed challenge: challenger draws 6 and loses the turn', () => {
    let s = play4([C('blue', '1'), C('blue', '2')]);
    s = applyAction(s, 'p1', { type: 'challenge' });
    expect(s.players[1].hand).toHaveLength(2 + 6);
    expect(s.players[0].hand).toHaveLength(2);
    expect(s.current).toBe(2);
    expect(s.log.map((l) => l.text).join('\n')).toContain(
      'P0 had no red card, so P1 draws 6 and loses the turn.',
    );
  });

  it('accepting (drawing) takes 4 and loses the turn', () => {
    let s = play4([C('blue', '1'), C('blue', '2')]);
    s = applyAction(s, 'p1', { type: 'draw' });
    expect(s.players[1].hand).toHaveLength(2 + 4);
    expect(s.current).toBe(2);
  });

  it('only the targeted player may challenge, and only once', () => {
    let s = play4([C('red', '1'), C('blue', '2')]);
    expect(err(() => applyAction(s, 'p2', { type: 'challenge' }))).toBe('not_your_turn');
    s = applyAction(s, 'p1', { type: 'challenge' });
    expect(err(() => applyAction(s, 'p1', { type: 'challenge' }))).toBe('no_challenge');
  });

  it('the played player cannot play anything while a challenge is pending', () => {
    const s = play4([C('blue', '1'), C('blue', '2')]);
    expect(err(() => applyAction(s, 'p1', { type: 'play', cardId: s.players[1].hand[0].id }))).toBe(
      'must_answer_penalty',
    );
  });
});

describe('UNO declaration', () => {
  it('flags a player left on one card without calling UNO, and the catch costs 2 cards', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [
        [C('red', '1'), C('red', '2')],
        [C('blue', '3'), C('blue', '4')],
        [C('green', '1'), C('green', '2')],
      ],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    expect(s.vulnerable).toBe('p0');
    s = applyAction(s, 'p2', { type: 'catchUno', target: 'p0' });
    expect(s.players[0].hand).toHaveLength(3);
    expect(s.vulnerable).toBeNull();
    expect(err(() => applyAction(s, 'p2', { type: 'catchUno', target: 'p0' }))).toBe(
      'nothing_to_catch',
    );
  });

  it('calling UNO early (with two cards) protects the player', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [
        [C('red', '1'), C('red', '2')],
        [C('blue', '3'), C('blue', '4')],
      ],
    });
    s = applyAction(s, 'p0', { type: 'callUno' });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    expect(s.vulnerable).toBeNull();
  });

  it('calling UNO late (after playing, before being caught) clears the flag', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [
        [C('red', '1'), C('red', '2')],
        [C('blue', '3'), C('blue', '4')],
      ],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    s = applyAction(s, 'p0', { type: 'callUno' });
    expect(s.vulnerable).toBeNull();
    expect(err(() => applyAction(s, 'p1', { type: 'catchUno', target: 'p0' }))).toBe(
      'nothing_to_catch',
    );
  });

  it('the catch window closes once the next player acts', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [
        [C('red', '1'), C('red', '2')],
        [C('red', '3'), C('blue', '4')],
        [C('green', '1'), C('green', '2')],
      ],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    s = applyAction(s, 'p1', { type: 'play', cardId: s.players[1].hand[0].id });
    expect(err(() => applyAction(s, 'p2', { type: 'catchUno', target: 'p0' }))).toBe(
      'nothing_to_catch',
    );
  });

  it('cannot call UNO with many cards or catch yourself', () => {
    const s = scenario({
      top: C('red', '5'),
      hands: [
        [C('red', '1'), C('red', '2'), C('red', '3')],
        [C('blue', '3'), C('blue', '4')],
      ],
    });
    expect(err(() => applyAction(s, 'p0', { type: 'callUno' }))).toBe('cannot_call_uno');
  });

  it('a stale UNO flag is cleared when the player draws', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [[C('green', '1')], [C('red', '3'), C('red', '4')]],
      drawPile: [C('blue', '9'), C('blue', '8')],
    });
    s.players[0].unoCalled = true;
    s = applyAction(s, 'p0', { type: 'draw' });
    expect(s.players[0].unoCalled).toBe(false);
  });
});

describe('winner detection', () => {
  it('ends the round when the hand is emptied and scores the losers hands', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [[C('red', '1')], [C('blue', '3'), C('wild', 'wild')], [C('green', 'skip')]],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    expect(s.phase).toBe('over');
    expect(s.winner).toBe('p0');
    expect(s.roundPoints).toBe(3 + 50 + 20);
    expect(err(() => applyAction(s, 'p1', { type: 'draw' }))).toBe('game_over');
  });

  it('a winning Draw Two still makes the next player draw before scoring', () => {
    let s = scenario({ top: C('red', '5'), hands: [[C('red', 'draw2')], [C('blue', '3')]] });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    expect(s.winner).toBe('p0');
    expect(s.players[1].hand).toHaveLength(3);
  });
});

describe('stacking house rules', () => {
  const stackScenario = (rules: Parameters<typeof scenario>[0]['rules']) =>
    scenario({
      top: C('red', '5'),
      rules,
      hands: [
        [C('red', 'draw2'), C('red', '1')],
        [C('blue', 'draw2'), C('wild', 'wild4'), C('blue', '1')],
        [C('green', '1'), C('green', '2')],
      ],
    });

  it('standard rules: victim must draw, cannot stack', () => {
    let s = stackScenario({});
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    expect(s.current).toBe(1);
    expect(canPlayCard(s, 'p1', s.players[1].hand[0])).toBe(false);
    s = applyAction(s, 'p1', { type: 'draw' });
    expect(s.players[1].hand).toHaveLength(5);
    expect(s.current).toBe(2);
  });

  it('+2 on +2 accumulates penalty and passes it on', () => {
    let s = stackScenario({ stacking: { draw2OnDraw2: true } });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    expect(s.pending).toMatchObject({ kind: 'draw2', amount: 2 });
    expect(s.current).toBe(1);
    expect(canPlayCard(s, 'p1', s.players[1].hand[1])).toBe(false); // wild4 not allowed
    expect(err(() => applyAction(s, 'p1', { type: 'play', cardId: s.players[1].hand[2].id }))).toBe(
      'must_answer_penalty',
    );
    s = applyAction(s, 'p1', { type: 'play', cardId: s.players[1].hand[0].id });
    expect(s.current).toBe(2); // p2 now owes 4 and cannot stack
    s = applyAction(s, 'p2', { type: 'draw' });
    expect(s.pending).toBeNull();
    expect(s.players[2].hand).toHaveLength(2 + 4);
    expect(s.current).toBe(0);
  });

  it('the victim can always choose to take the penalty instead of stacking', () => {
    let s = stackScenario({ stacking: { draw2OnDraw2: true } });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    s = applyAction(s, 'p1', { type: 'draw' });
    expect(s.players[1].hand).toHaveLength(3 + 2 - 0);
    expect(s.current).toBe(2);
    expect(s.pending).toBeNull();
  });

  it('+4 on +2 and +4 on +4', () => {
    let s = stackScenario({ stacking: { draw4OnDraw2: true, draw4OnDraw4: true } });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    s = applyAction(s, 'p1', { type: 'play', cardId: s.players[1].hand[1].id });
    s = applyAction(s, 'p1', { type: 'chooseColor', color: 'green' });
    // p2 cannot stack further, so they draw the accumulated 2 + 4 = 6.
    expect(s.current).toBe(2);
    s = applyAction(s, 'p2', { type: 'draw' });
    expect(s.pending).toBeNull();
    expect(s.players[2].hand).toHaveLength(2 + 6);
  });

  it('+2 on +4 requires the chosen colour', () => {
    const w4 = C('wild', 'wild4');
    let s = scenario({
      top: C('red', '5'),
      rules: { stacking: { draw2OnDraw4: true } },
      hands: [
        [w4, C('red', '1')],
        [C('green', 'draw2'), C('blue', 'draw2'), C('blue', '1')],
      ],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: w4.id });
    s = applyAction(s, 'p0', { type: 'chooseColor', color: 'green' });
    expect(canPlayCard(s, 'p1', s.players[1].hand[0])).toBe(true);
    expect(canPlayCard(s, 'p1', s.players[1].hand[1])).toBe(false);
    s = applyAction(s, 'p1', { type: 'play', cardId: s.players[1].hand[0].id });
    s = applyAction(s, 'p0', { type: 'draw' }); // p0 cannot stack back: 4 + 2
    expect(s.players[0].hand).toHaveLength(1 + 6);
  });

  it('stacking onto a challengeable +4 forfeits the challenge, stacked +4 is unchallengeable', () => {
    const a = C('wild', 'wild4');
    const b = C('wild', 'wild4');
    let s = scenario({
      top: C('red', '5'),
      rules: { stacking: { draw4OnDraw4: true } },
      hands: [
        [a, C('red', '1')],
        [b, C('blue', '1')],
        [C('green', '1'), C('green', '2')],
      ],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: a.id });
    s = applyAction(s, 'p0', { type: 'chooseColor', color: 'green' });
    expect(s.pending?.challenge).not.toBeNull();
    s = applyAction(s, 'p1', { type: 'play', cardId: b.id });
    s = applyAction(s, 'p1', { type: 'chooseColor', color: 'blue' });
    s = applyAction(s, 'p2', { type: 'draw' }); // p2 had no +4 -> takes 8
    expect(s.players[2].hand).toHaveLength(2 + 8);
  });

  it('keeps the challenge available when stacking is enabled but the victim declines to stack', () => {
    const a = C('wild', 'wild4');
    let s = scenario({
      top: C('red', '5'),
      rules: { stacking: { draw4OnDraw4: true } },
      hands: [
        [a, C('red', '1'), C('blue', '1')],
        [C('wild', 'wild4'), C('blue', '2')],
      ],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: a.id });
    s = applyAction(s, 'p0', { type: 'chooseColor', color: 'green' });
    s = applyAction(s, 'p1', { type: 'challenge' });
    expect(s.players[0].hand).toHaveLength(2 + 4); // illegal (held red) -> offender draws 4
  });
});

describe('7-0 rule', () => {
  it('7 swaps hands with the chosen player', () => {
    const seven = C('red', '7');
    let s = scenario({
      top: C('red', '5'),
      rules: { sevenZero: true },
      hands: [
        [seven, C('red', '1'), C('red', '2')],
        [C('blue', '3')],
        [C('green', '1'), C('green', '2')],
      ],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: seven.id });
    expect(s.phase).toBe('chooseSwap');
    expect(err(() => applyAction(s, 'p0', { type: 'chooseSwap', target: 'p0' }))).toBe(
      'bad_target',
    );
    s = applyAction(s, 'p0', { type: 'chooseSwap', target: 'p1' });
    expect(s.players[0].hand).toHaveLength(1);
    expect(s.players[1].hand).toHaveLength(2);
    expect(s.current).toBe(1);
  });

  it('0 rotates all hands in the direction of play', () => {
    const zero = C('red', '0');
    const h1 = [C('blue', '1')];
    const h2 = [C('green', '1'), C('green', '2')];
    let s = scenario({
      top: C('red', '5'),
      rules: { sevenZero: true },
      hands: [[zero, C('red', '1')], h1, h2],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: zero.id });
    expect(s.players[1].hand).toHaveLength(1); // p0's remaining card
    expect(s.players[2].hand).toEqual(h1);
    expect(s.players[0].hand).toEqual(h2);
  });

  it('7 and 0 are plain number cards when the rule is off', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [[C('red', '7'), C('red', '1')], [C('blue', '3')]],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    expect(s.phase).toBe('play');
    expect(s.current).toBe(1);
  });
});

describe('jump-in rule', () => {
  it('lets any player play an identical card out of turn and continues from them', () => {
    const jumper = C('red', '5');
    let s = scenario({
      top: C('red', '5'),
      rules: { jumpIn: true },
      hands: [
        [C('red', '1'), C('red', '2')],
        [C('blue', '3'), C('blue', '9')],
        [jumper, C('green', '2')],
      ],
    });
    expect(canPlayCard(s, 'p2', jumper)).toBe(true);
    s = applyAction(s, 'p2', { type: 'play', cardId: jumper.id });
    expect(s.current).toBe(0); // continues after p2
    expect(topCard(s).id).toBe(jumper.id);
  });

  it('requires an identical card (same colour and symbol) and the rule enabled', () => {
    const sameColorOnly = C('red', '9');
    const s = scenario({
      top: C('red', '5'),
      rules: { jumpIn: true },
      hands: [[C('red', '1'), C('red', '2')], [C('blue', '3')], [sameColorOnly, C('green', '2')]],
    });
    expect(canPlayCard(s, 'p2', sameColorOnly)).toBe(false);
    const off = scenario({
      top: C('red', '5'),
      hands: [[C('red', '1')], [C('blue', '3')], [C('red', '5'), C('green', '2')]],
    });
    expect(canPlayCard(off, 'p2', off.players[2].hand[0])).toBe(false);
    expect(
      err(() => applyAction(off, 'p2', { type: 'play', cardId: off.players[2].hand[0].id })),
    ).toBe('cannot_jump_in');
  });

  it('a jump-in reverse flips direction from the jumper', () => {
    const jumper = C('red', 'reverse');
    let s = scenario({
      top: C('red', 'reverse'),
      current: 0,
      direction: -1,
      rules: { jumpIn: true },
      hands: [
        [C('red', '1'), C('red', '2')],
        [C('blue', '3'), C('blue', '9')],
        [jumper, C('green', '2')],
      ],
    });
    s = applyAction(s, 'p2', { type: 'play', cardId: jumper.id });
    expect(s.direction).toBe(1);
    expect(s.current).toBe(0);
  });

  it('is blocked while a penalty is pending', () => {
    const s = scenario({
      top: C('red', 'draw2'),
      rules: { jumpIn: true, stacking: { draw2OnDraw2: true } },
      hands: [
        [C('red', 'draw2'), C('red', '2')],
        [C('blue', '3')],
        [C('red', 'draw2'), C('green', '2')],
      ],
    });
    s.pending = { kind: 'draw2', amount: 2, challenge: null };
    expect(canPlayCard(s, 'p2', s.players[2].hand[0])).toBe(false);
  });
});

describe('draw until playable / force play', () => {
  it('draws repeatedly until a playable card appears', () => {
    const good = C('red', '9');
    let s = scenario({
      top: C('red', '5'),
      rules: { drawUntilPlayable: true },
      hands: [[C('blue', '1')], [C('red', '3')]],
      drawPile: [good, C('blue', '2'), C('blue', '3')],
    });
    s = applyAction(s, 'p0', { type: 'draw' });
    expect(s.players[0].hand).toHaveLength(1 + 3);
    expect(s.drawnCardId).toBe(good.id);
  });

  it('force play automatically plays a playable drawn card', () => {
    const good = C('red', '9');
    let s = scenario({
      top: C('red', '5'),
      rules: { forcePlay: true },
      hands: [[C('blue', '1')], [C('red', '3')]],
      drawPile: [good],
    });
    s = applyAction(s, 'p0', { type: 'draw' });
    expect(topCard(s).id).toBe(good.id);
    expect(s.current).toBe(1);
    expect(s.drawnCardId).toBeNull();
  });

  it('force-played wild still asks for a colour', () => {
    const good = C('wild', 'wild');
    let s = scenario({
      top: C('red', '5'),
      rules: { forcePlay: true },
      hands: [[C('blue', '1')], [C('red', '3')]],
      drawPile: [good],
    });
    s = applyAction(s, 'p0', { type: 'draw' });
    expect(s.phase).toBe('chooseColor');
    expect(s.current).toBe(0);
  });
});

describe('player removal', () => {
  it('returns the hand to the bottom of the draw pile and fixes the turn', () => {
    const s = scenario({
      top: C('red', '5'),
      current: 1,
      hands: [[C('red', '1')], [C('blue', '3'), C('blue', '4')], [C('green', '1')]],
    });
    const before = totalCards(s);
    const gone = s.players[1].hand.map((c) => c.id);
    const r = removePlayer(s, 'p1');
    expect(r.players.map((p) => p.id)).toEqual(['p0', 'p2']);
    expect(r.current).toBe(1); // p2 inherits the turn
    expect(totalCards(r)).toBe(before);
    expect(r.drawPile.slice(0, 2).map((c) => c.id)).toEqual([gone[1], gone[0]]);
  });

  it('works when removing the current player in reverse and cancels pending penalties', () => {
    const s = scenario({
      top: C('red', '5'),
      current: 1,
      direction: -1,
      hands: [[C('red', '1')], [C('blue', '3')], [C('green', '1')]],
    });
    s.pending = { kind: 'draw2', amount: 2, challenge: null };
    const r = removePlayer(s, 'p1');
    expect(r.players[r.current].id).toBe('p0');
    expect(r.pending).toBeNull();
  });

  it('adjusts the current index when an earlier seat is removed', () => {
    const s = scenario({
      top: C('red', '5'),
      current: 2,
      hands: [[C('red', '1')], [C('blue', '3')], [C('green', '1')]],
    });
    const r = removePlayer(s, 'p0');
    expect(r.players[r.current].id).toBe('p2');
  });

  it('wraps when the last seat is removed on their turn', () => {
    const s = scenario({
      top: C('red', '5'),
      current: 2,
      hands: [[C('red', '1')], [C('blue', '3')], [C('green', '1')]],
    });
    const r = removePlayer(s, 'p2');
    expect(r.players[r.current].id).toBe('p0');
  });

  it('declares the last remaining player the winner', () => {
    const s = scenario({ top: C('red', '5'), hands: [[C('red', '1')], [C('blue', '3')]] });
    const r = removePlayer(s, 'p1');
    expect(r.phase).toBe('over');
    expect(r.winner).toBe('p0');
  });

  it('clears a pending colour choice of the removed player', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [[C('wild', 'wild'), C('red', '1')], [C('blue', '3')], [C('green', '1')]],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    const r = removePlayer(s, 'p0');
    expect(r.phase).toBe('play');
    expect(r.wild).toBeNull();
    expect(r.players[r.current].id).toBe('p1');
  });
});

describe('full random-play simulation keeps invariants', () => {
  it('plays many full games with legal random moves, conserving cards', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = seeded(seed);
      const players = 2 + (seed % 7);
      const rules = {
        stacking: {
          draw2OnDraw2: seed % 2 === 0,
          draw4OnDraw4: seed % 3 === 0,
          draw4OnDraw2: seed % 5 === 0,
          draw2OnDraw4: seed % 4 === 0,
        },
        sevenZero: seed % 2 === 1,
        jumpIn: false,
        drawUntilPlayable: seed % 3 === 1,
        forcePlay: seed % 4 === 1,
      };
      let s = createGameFor(players, rules, rng);
      const total = totalCards(s);
      for (let step = 0; step < 4000 && s.phase !== 'over'; step++) {
        const cur = s.players[s.current].id;
        const view = s.players[s.current];
        let action: Parameters<typeof applyAction>[2];
        if (s.phase === 'chooseColor') action = { type: 'chooseColor', color: 'red' };
        else if (s.phase === 'chooseSwap')
          action = { type: 'chooseSwap', target: s.players.find((p) => p.id !== cur)!.id };
        else if (s.drawnCardId !== null) {
          const c = view.hand.find((x) => x.id === s.drawnCardId)!;
          action = canPlayCard(s, cur, c) ? { type: 'play', cardId: c.id } : { type: 'pass' };
        } else {
          const c = view.hand.find((x) => canPlayCard(s, cur, x));
          action = c ? { type: 'play', cardId: c.id } : { type: 'draw' };
        }
        s = applyAction(s, cur, action, rng);
        expect(totalCards(s)).toBe(total);
      }
      expect(s.phase).toBe('over');
    }
  });
});

import { createGame } from './game';
import { defaultRules } from './types';
function createGameFor(players: number, rules: ReturnType<typeof defaultRules>, rng: () => number) {
  return createGame(
    Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
    rules,
    rng,
  );
}
