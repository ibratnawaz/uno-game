import { describe, expect, it } from 'vitest';
import { buildDeck, cardPoints, decksFor, shuffle } from './deck';
import { createGame, playableCards } from './game';
import { defaultRules, GameError } from './types';
import { seeded, totalCards } from './testkit';

describe('deck', () => {
  it('builds a standard 108 card deck', () => {
    const d = buildDeck();
    expect(d).toHaveLength(108);
    const count = (f: (c: (typeof d)[number]) => boolean) => d.filter(f).length;
    expect(count((c) => c.value === '0')).toBe(4);
    expect(count((c) => c.color === 'red' && c.value === '7')).toBe(2);
    expect(count((c) => c.value === 'skip')).toBe(8);
    expect(count((c) => c.value === 'reverse')).toBe(8);
    expect(count((c) => c.value === 'draw2')).toBe(8);
    expect(count((c) => c.value === 'wild')).toBe(4);
    expect(count((c) => c.value === 'wild4')).toBe(4);
    expect(new Set(d.map((c) => c.id)).size).toBe(108);
  });

  it('scales decks with player count but never the hand size', () => {
    expect(decksFor(2)).toBe(1);
    expect(decksFor(8)).toBe(1);
    expect(decksFor(20)).toBe(2);
    const g = createGame(
      Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
      defaultRules(),
      seeded(3),
    );
    expect(g.decks).toBe(2);
    g.players.forEach((p) => expect(p.hand.length).toBeGreaterThanOrEqual(7));
    expect(buildDeck(2).map((c) => c.id)).toEqual([...Array(216).keys()]);
  });

  it('shuffles without losing cards, reproducibly', () => {
    const a = shuffle(buildDeck(), seeded(1));
    const b = shuffle(buildDeck(), seeded(1));
    expect(a).toEqual(b);
    expect(a).not.toEqual(buildDeck());
    expect(new Set(a.map((c) => c.id)).size).toBe(108);
  });

  it('scores cards', () => {
    expect(cardPoints({ id: 1, color: 'red', value: '7' })).toBe(7);
    expect(cardPoints({ id: 1, color: 'red', value: 'skip' })).toBe(20);
    expect(cardPoints({ id: 1, color: 'wild', value: 'wild4' })).toBe(50);
  });
});

describe('dealing / player limits', () => {
  const seeds = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));

  it('deals 7 cards to each player and conserves cards', () => {
    for (const n of [2, 5, 20]) {
      const g = createGame(seeds(n), defaultRules(), seeded(n));
      expect(totalCards(g)).toBe(108 * g.decks);
      // Starting Draw Two may give the first player two extra cards.
      const sizes = g.players.map((p) => p.hand.length).sort();
      expect(sizes.filter((x) => x === 7).length).toBeGreaterThanOrEqual(n - 1);
      expect(g.discard).toHaveLength(1);
    }
  });

  it('never starts on a Wild Draw Four', () => {
    for (let i = 0; i < 200; i++) {
      const g = createGame(seeds(3), defaultRules(), seeded(i));
      expect(g.discard[0].value).not.toBe('wild4');
    }
  });

  it('rejects fewer than 2 or more than 20 players', () => {
    expect(() => createGame(seeds(1), defaultRules())).toThrow(GameError);
    expect(() => createGame(seeds(21), defaultRules())).toThrow(GameError);
    expect(() => createGame(seeds(2), defaultRules())).not.toThrow();
    expect(() => createGame(seeds(20), defaultRules())).not.toThrow();
  });

  it('applies starting-card effects consistently', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const g = createGame(seeds(4), defaultRules(), seeded(i));
      seen.add(g.discard[0].value);
      if (g.discard[0].value === 'reverse') expect(g.direction).toBe(-1);
      if (g.discard[0].value === 'wild') expect(g.phase).toBe('chooseColor');
      else expect(g.phase).toBe('play');
      expect(playableCards(g, g.players[g.current].id).length).toBeGreaterThanOrEqual(0);
    }
    expect(seen.has('skip') && seen.has('reverse') && seen.has('draw2') && seen.has('wild')).toBe(
      true,
    );
  });
});
