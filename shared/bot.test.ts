import { describe, expect, it } from 'vitest';
import { botCallsUno, botDelay, botReflex, botTurn } from './bot';
import { planBotMove, type BotMap } from './botdriver';
import { applyAction, createGame } from './game';
import { C, scenario, seeded, totalCards } from './testkit';
import { defaultRules, type Difficulty, type HouseRules } from './types';
import { gameViewFor } from './view';

const view = (s: ReturnType<typeof scenario>, id: string) => gameViewFor(s, id);

describe('bot decisions', () => {
  it('plays only legal cards, never an obvious Wild Draw Four bluff', () => {
    for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
      for (let seed = 0; seed < 50; seed++) {
        const s = scenario({
          top: C('red', '5'),
          hands: [
            [C('wild', 'wild4'), C('red', '9'), C('blue', '2')],
            [C('green', '1'), C('green', '2')],
          ],
        });
        const a = botTurn(view(s, 'p0'), diff, seeded(seed));
        expect(a).not.toBeNull();
        if (a?.type === 'play') {
          const card = s.players[0].hand.find((c) => c.id === a.cardId)!;
          expect(card.value).not.toBe('wild4'); // holds a red card: would be a bluff
          expect(() => applyAction(s, 'p0', a)).not.toThrow();
        }
      }
    }
  });

  it('plays Wild Draw Four when it is the only legal option and it is honest', () => {
    const s = scenario({
      top: C('red', '5'),
      hands: [
        [C('wild', 'wild4'), C('blue', '2')],
        [C('green', '1'), C('green', '2')],
      ],
    });
    expect(botTurn(view(s, 'p0'), 'hard', seeded(1))).toMatchObject({ type: 'play' });
  });

  it('draws when nothing is playable', () => {
    const s = scenario({ top: C('red', '5'), hands: [[C('blue', '1')], [C('green', '2')]] });
    expect(botTurn(view(s, 'p0'), 'medium', seeded(1))).toEqual({ type: 'draw' });
  });

  it('chooses a colour it holds when playing a wild (medium/hard)', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [
        [C('wild', 'wild'), C('blue', '1'), C('blue', '2'), C('green', '3')],
        [C('green', '1')],
      ],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    for (const d of ['medium', 'hard'] as Difficulty[])
      expect(botTurn(view(s, 'p0'), d, seeded(2))).toEqual({ type: 'chooseColor', color: 'blue' });
  });

  it('hard bot saves wilds but attacks a player about to win', () => {
    const s = scenario({
      top: C('red', '5'),
      hands: [
        [C('wild', 'wild'), C('red', '9'), C('red', 'skip'), C('red', '3')],
        [C('green', '1')],
        [C('green', '2'), C('green', '4')],
      ],
    });
    const a = botTurn(view(s, 'p0'), 'hard', seeded(1));
    expect(a).toEqual({ type: 'play', cardId: s.players[0].hand[2].id }); // skip the player on one card
  });

  it('challenge decisions only occur when a challenge exists, and stacking is used when allowed', () => {
    let s = scenario({
      top: C('red', '5'),
      rules: { stacking: { draw2OnDraw2: true } },
      hands: [
        [C('red', 'draw2'), C('red', '1')],
        [C('blue', 'draw2'), C('blue', '1')],
        [C('green', '1')],
      ],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    const a = botTurn(view(s, 'p1'), 'hard', seeded(1));
    expect(a).toEqual({ type: 'play', cardId: s.players[1].hand[0].id });
    expect(botTurn(view(s, 'p1'), 'hard', seeded(1))).not.toEqual({ type: 'challenge' });
  });

  it('challenges sometimes and responds to Wild Draw Four', () => {
    const w4 = C('wild', 'wild4');
    let s = scenario({
      top: C('red', '5'),
      hands: [[w4, C('red', '1')], [C('blue', '1'), C('blue', '2')], [C('green', '1')]],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: w4.id });
    s = applyAction(s, 'p0', { type: 'chooseColor', color: 'green' });
    const kinds = new Set<string>();
    for (let i = 0; i < 100; i++) kinds.add(botTurn(view(s, 'p1'), 'medium', seeded(i))!.type);
    expect(kinds).toEqual(new Set(['challenge', 'draw']));
  });

  it('catches missed UNO calls and calls UNO itself, depending on difficulty', () => {
    let s = scenario({
      top: C('red', '5'),
      hands: [
        [C('red', '1'), C('red', '2')],
        [C('blue', '1'), C('blue', '2')],
        [C('green', '1'), C('green', '2')],
      ],
    });
    s = applyAction(s, 'p0', { type: 'play', cardId: s.players[0].hand[0].id });
    let hard = 0;
    let easy = 0;
    for (let i = 0; i < 200; i++) {
      if (botReflex(view(s, 'p2'), 'hard', seeded(i))?.type === 'catchUno') hard++;
      if (botReflex(view(s, 'p2'), 'easy', seeded(i))?.type === 'catchUno') easy++;
    }
    expect(hard).toBeGreaterThan(easy);
    expect(botCallsUno('hard', seeded(1))).toBe(true);
  });

  it('jumps in only when the house rule is on', () => {
    const jumper = C('red', '5');
    const mk = (jumpIn: boolean) =>
      scenario({
        top: C('red', '5'),
        rules: { jumpIn },
        hands: [[C('green', '1')], [C('blue', '1')], [jumper, C('green', '2')]],
      });
    expect(botReflex(view(mk(true), 'p2'), 'hard', seeded(1))).toEqual({
      type: 'play',
      cardId: jumper.id,
    });
    expect(botReflex(view(mk(false), 'p2'), 'hard', seeded(1))).toBeNull();
  });

  it('thinks for a realistic amount of time', () => {
    for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
      const ms = botDelay(d, seeded(4));
      expect(ms).toBeGreaterThanOrEqual(500);
      expect(ms).toBeLessThanOrEqual(2000);
    }
  });

  it('never receives hidden information', () => {
    const s = scenario({ top: C('red', '5'), hands: [[C('red', '1')], [C('blue', '9')]] });
    const v = view(s, 'p0');
    expect(JSON.stringify(v)).not.toContain(String(s.players[1].hand[0].id));
    expect(v.players.find((p) => p.id === 'p1')).toEqual({
      id: 'p1',
      name: 'P1',
      handCount: 1,
      unoCalled: false,
    });
  });
});

function simulate(botsCount: number, diff: Difficulty, rules: HouseRules, seed: number) {
  const rng = seeded(seed);
  const ids = Array.from({ length: botsCount }, (_, i) => `b${i}`);
  let s = createGame(
    ids.map((id) => ({ id, name: id })),
    rules,
    rng,
  );
  const bots: BotMap = Object.fromEntries(ids.map((id) => [id, diff]));
  const total = totalCards(s);
  let steps = 0;
  while (s.phase !== 'over' && steps++ < 20000) {
    const move = planBotMove(s, bots, rng);
    if (!move) throw new Error('bot had no move in phase ' + s.phase);
    s = applyAction(s, move.botId, move.action, rng); // throws if the bot made an illegal move
    if (totalCards(s) !== total) throw new Error('card conservation broken');
  }
  return { s, steps };
}

describe('bots complete full games legally', () => {
  const allRules: HouseRules = {
    stacking: { draw2OnDraw2: true, draw4OnDraw4: true, draw4OnDraw2: true, draw2OnDraw4: true },
    sevenZero: true,
    jumpIn: true,
    drawUntilPlayable: true,
    forcePlay: true,
  };
  const cases: [number, Difficulty, HouseRules][] = [
    [2, 'easy', defaultRules()],
    [2, 'hard', defaultRules()],
    [4, 'medium', defaultRules()],
    [8, 'hard', allRules],
    [20, 'easy', defaultRules()],
    [20, 'medium', allRules],
    [20, 'hard', defaultRules()],
  ];
  for (const [n, d, r] of cases) {
    it(`${n} bots (${d}${r === allRules ? ', all house rules' : ''})`, () => {
      for (let seed = 1; seed <= 3; seed++) {
        const { s, steps } = simulate(n, d, r, seed * 7 + n);
        expect(s.phase).toBe('over');
        expect(s.winner).toBeTruthy();
        expect(steps).toBeLessThan(20000);
      }
    });
  }
});
