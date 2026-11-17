/** Layout of the small "fanned card backs" shown for an opponent's hand size. */
export interface FanLayout {
  /** How many card backs are drawn (capped). */
  shown: number;
  /** Cards not drawn because of the cap. */
  overflow: number;
  /** Per-card horizontal offset (in card widths) and rotation (degrees). */
  cards: { x: number; rot: number }[];
}

export const FAN_MAX = 7;
export const FAN_SPREAD_DEG = 26; // total angle covered by a full fan
export const FAN_STEP = 0.42; // horizontal step between cards, as a fraction of card width

export function fanLayout(count: number, max = FAN_MAX): FanLayout {
  const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  const shown = Math.min(n, max);
  const cards = Array.from({ length: shown }, (_, i) => ({
    x: i * FAN_STEP,
    rot: shown === 1 ? 0 : -FAN_SPREAD_DEG / 2 + (FAN_SPREAD_DEG * i) / (shown - 1),
  }));
  return { shown, overflow: n - shown, cards };
}
