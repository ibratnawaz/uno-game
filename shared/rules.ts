import { defaultRules, type Card, type Color, type HouseRules, type Pending } from './types';

/** Standard matching rule: wilds always; otherwise colour or symbol. */
export function isPlayable(card: Card, top: Card, activeColor: Color): boolean {
  if (card.color === 'wild') return true;
  return card.color === activeColor || card.value === top.value;
}

/** Wild Draw Four is only *legal* when the hand holds no card of the active colour. */
export function wild4Legal(hand: Card[], activeColor: Color, playedId: number): boolean {
  return !hand.some((c) => c.id !== playedId && c.color === activeColor);
}

/**
 * Can `card` be played on top of an outstanding draw penalty (stacking house rules)?
 * +2 on +2 and +4 on any stack ignore colour; +2 on +4 must match the chosen colour.
 */
export function canStack(
  rules: HouseRules,
  pending: Pending,
  card: Card,
  activeColor: Color,
): boolean {
  const s = rules.stacking;
  if (card.value === 'draw2') {
    if (pending.kind === 'draw2') return s.draw2OnDraw2;
    return s.draw2OnDraw4 && card.color === activeColor;
  }
  if (card.value === 'wild4') return pending.kind === 'draw2' ? s.draw4OnDraw2 : s.draw4OnDraw4;
  return false;
}

export const anyStacking = (r: HouseRules) => Object.values(r.stacking).some(Boolean);

/** Validate untrusted rule input (from a client) into a well-formed HouseRules. */
export function sanitizeRules(input: unknown): HouseRules {
  const base = defaultRules();
  if (!input || typeof input !== 'object') return base;
  const i = input as Record<string, unknown>;
  const st = (i.stacking ?? {}) as Record<string, unknown>;
  return {
    stacking: {
      draw2OnDraw2: st.draw2OnDraw2 === true,
      draw4OnDraw4: st.draw4OnDraw4 === true,
      draw4OnDraw2: st.draw4OnDraw2 === true,
      draw2OnDraw4: st.draw2OnDraw4 === true,
    },
    sevenZero: i.sevenZero === true,
    jumpIn: i.jumpIn === true,
    drawUntilPlayable: i.drawUntilPlayable === true,
    forcePlay: i.forcePlay === true,
  };
}

export interface RuleInfo {
  key: string;
  name: string;
  description: string;
  get: (r: HouseRules) => boolean;
  set: (r: HouseRules, v: boolean) => HouseRules;
}

const flat = (key: 'sevenZero' | 'jumpIn' | 'drawUntilPlayable' | 'forcePlay') => ({
  get: (r: HouseRules) => r[key],
  set: (r: HouseRules, v: boolean): HouseRules => ({ ...r, [key]: v }),
});
const stack = (key: keyof HouseRules['stacking']) => ({
  get: (r: HouseRules) => r.stacking[key],
  set: (r: HouseRules, v: boolean): HouseRules => ({ ...r, stacking: { ...r.stacking, [key]: v } }),
});

/** UI + docs metadata for every house rule. */
export const RULE_CATALOG: RuleInfo[] = [
  {
    key: 'draw2OnDraw2',
    name: '+2 on +2',
    description: 'Answer a Draw Two with another Draw Two; the penalty grows by 2.',
    ...stack('draw2OnDraw2'),
  },
  {
    key: 'draw4OnDraw4',
    name: '+4 on +4',
    description: 'Answer a Wild Draw Four with another one; the penalty grows by 4.',
    ...stack('draw4OnDraw4'),
  },
  {
    key: 'draw4OnDraw2',
    name: '+4 on +2',
    description: 'Answer a Draw Two with a Wild Draw Four.',
    ...stack('draw4OnDraw2'),
  },
  {
    key: 'draw2OnDraw4',
    name: '+2 on +4',
    description: 'Answer a Wild Draw Four with a Draw Two of the chosen colour.',
    ...stack('draw2OnDraw4'),
  },
  {
    key: 'sevenZero',
    name: '7-0 Swap',
    description:
      'Playing a 7 swaps hands with a player you choose. Playing a 0 passes every hand one seat in the direction of play.',
    ...flat('sevenZero'),
  },
  {
    key: 'jumpIn',
    name: 'Jump-In',
    description:
      'Play an identical card (same colour and symbol) out of turn the moment it matches the top card.',
    ...flat('jumpIn'),
  },
  {
    key: 'drawUntilPlayable',
    name: 'Draw Until Playable',
    description: 'When you draw, keep drawing until you get a card you can play.',
    ...flat('drawUntilPlayable'),
  },
  {
    key: 'forcePlay',
    name: 'Force Play',
    description: 'A drawn card that can be played is played automatically.',
    ...flat('forcePlay'),
  },
];

export function activeRuleNames(r: HouseRules): string[] {
  return RULE_CATALOG.filter((x) => x.get(r)).map((x) => x.name);
}
