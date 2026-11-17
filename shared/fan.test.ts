import { describe, expect, it } from 'vitest';
import { FAN_MAX, fanLayout } from './fan';

describe('fanLayout', () => {
  it('draws one back per card up to the cap', () => {
    for (let n = 0; n <= FAN_MAX; n++) {
      const f = fanLayout(n);
      expect(f.shown).toBe(n);
      expect(f.overflow).toBe(0);
      expect(f.cards).toHaveLength(n);
    }
  });

  it('caps the fan and reports the overflow', () => {
    expect(fanLayout(8)).toMatchObject({ shown: FAN_MAX, overflow: 1 });
    expect(fanLayout(40)).toMatchObject({ shown: FAN_MAX, overflow: 33 });
    expect(fanLayout(40, 5)).toMatchObject({ shown: 5, overflow: 35 });
  });

  it('a single card is upright; larger fans are symmetric and ordered left to right', () => {
    expect(fanLayout(1).cards[0].rot).toBe(0);
    const { cards } = fanLayout(5);
    expect(cards[0].rot).toBeCloseTo(-cards[4].rot);
    expect(cards[2].rot).toBeCloseTo(0);
    cards.slice(1).forEach((c, i) => {
      expect(c.rot).toBeGreaterThan(cards[i].rot);
      expect(c.x).toBeGreaterThan(cards[i].x);
    });
  });

  it('is safe for bad input', () => {
    expect(fanLayout(-3).shown).toBe(0);
    expect(fanLayout(NaN).shown).toBe(0);
    expect(fanLayout(2.9).shown).toBe(2);
  });
});
