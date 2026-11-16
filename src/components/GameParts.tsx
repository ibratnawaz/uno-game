import { useEffect, useMemo, useRef, useState } from 'react';
import { COLORS, type Card, type Color } from '../../shared/types';
import type { PublicMember } from '../../shared/room';
import type { GameView, PublicPlayer } from '../../shared/view';
import { CardFace } from './Card';
import { Avatar, COLOR_HEX, Modal } from './ui';

// ------------------------------------------------------------------ opponents

export function OpponentStrip({
  players,
  members,
  current,
  vulnerable,
  isHost,
  onRemove,
}: {
  players: PublicPlayer[];
  members: Map<string, PublicMember>;
  current: string;
  vulnerable: string | null;
  isHost: boolean;
  onRemove: (id: string) => void;
}) {
  const refs = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    refs.current
      .get(current)
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [current]);
  const compact = players.length > 8;
  return (
    <ul
      className="hand-scroll flex gap-2 overflow-x-auto px-3 pt-1 pb-2 md:flex-wrap md:justify-center md:overflow-visible"
      aria-label="Opponents"
    >
      {players.map((p) => {
        const m = members.get(p.id);
        const turn = p.id === current;
        const offline = m && !m.connected;
        return (
          <li
            key={p.id}
            ref={(el) => {
              if (el) refs.current.set(p.id, el);
            }}
            className={`relative flex shrink-0 items-center gap-2 rounded-2xl border bg-white/8 py-1.5 pr-3 pl-1.5 transition-all ${turn ? 'turn-ring border-[#ffd34d] bg-[#ffd34d]/15' : 'border-white/10'} ${offline ? 'opacity-70' : ''}`}
          >
            <span className="relative">
              <Avatar
                index={m?.avatar ?? 0}
                size={compact ? 34 : 42}
                ring={turn ? '#ffd34d' : offline ? '#888' : undefined}
              />
              {offline && (
                <span
                  className="absolute -right-1 -bottom-1 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-[10px]"
                  title="Disconnected"
                >
                  ⚡
                </span>
              )}
            </span>
            <span className="min-w-0 max-w-[92px]">
              <span className="block truncate text-sm leading-tight font-bold">{p.name}</span>
              <span className="flex items-center gap-1 text-xs text-white/70">
                <span
                  className="inline-block h-3.5 w-2.5 rounded-[3px] border border-white/60 bg-[#14172e]"
                  aria-hidden
                />
                <b className="text-sm text-white">{p.handCount}</b>
                {p.handCount === 1 && (
                  <span
                    className={`chip ml-1 !px-1.5 !py-0 ${p.unoCalled ? 'bg-[#ffd34d] text-[#2b1d00]' : vulnerable === p.id ? 'bg-red-500' : ''}`}
                  >
                    UNO
                  </span>
                )}
              </span>
            </span>
            {isHost && offline && (
              <button
                className="ml-1 rounded-full bg-red-500/80 px-2 py-1 text-[10px] font-black"
                aria-label={`Remove ${p.name}`}
                onClick={() => onRemove(p.id)}
              >
                Remove
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------ hand

const COLOR_ORDER: Record<string, number> = { red: 0, yellow: 1, green: 2, blue: 3, wild: 4 };
const VALUE_ORDER = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'skip',
  'reverse',
  'draw2',
  'wild',
  'wild4',
];

function useViewportWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

export function Hand({
  hand,
  playable,
  active,
  onPlay,
}: {
  hand: Card[];
  playable: Set<number>;
  active: boolean;
  onPlay: (c: Card) => void;
}) {
  const sorted = useMemo(
    () =>
      [...hand].sort(
        (a, b) =>
          COLOR_ORDER[a.color] - COLOR_ORDER[b.color] ||
          VALUE_ORDER.indexOf(a.value) - VALUE_ORDER.indexOf(b.value) ||
          a.id - b.id,
      ),
    [hand],
  );
  const vw = useViewportWidth();
  // Card width adapts to the screen; cards overlap just enough to fit, then the row scrolls.
  const w = vw < 480 ? 66 : 78;
  const avail = Math.min(vw, 1024) - 32;
  const n = sorted.length;
  const step = n <= 1 ? w : Math.max(w * 0.42, Math.min(w + 6, (avail - w) / (n - 1)));
  return (
    <div
      className="hand-scroll overflow-x-auto overflow-y-hidden pt-6 pb-2"
      aria-label="Your hand"
      role="list"
    >
      <div className="flex w-max min-w-full justify-center px-4">
        {sorted.map((c, i) => {
          const can = playable.has(c.id);
          return (
            <div
              key={c.id}
              role="listitem"
              className="anim-pop"
              style={{
                marginLeft: i === 0 ? 0 : step - w,
                transform: can ? 'translateY(-14px)' : undefined,
                zIndex: can ? 5 : 1,
                animationDelay: `${Math.min(i, 8) * 25}ms`,
              }}
            >
              <CardFace
                card={c}
                w={w}
                playable={can && active}
                dim={active && !can}
                onClick={() => onPlay(c)}
                title={`${c.color === 'wild' ? '' : c.color + ' '}${c.value}${can ? ' (playable)' : ''}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pickers

export function ColorPicker({ wild4, onPick }: { wild4: boolean; onPick: (c: Color) => void }) {
  return (
    <Modal title={wild4 ? 'Wild Draw Four – choose a colour' : 'Choose a colour'}>
      <div className="grid grid-cols-2 gap-3">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onPick(c)}
            className="h-24 rounded-2xl text-lg font-black capitalize shadow-lg transition-transform active:scale-95"
            style={{
              background: COLOR_HEX[c],
              color: c === 'yellow' ? '#2b1d00' : '#fff',
              border: '4px solid rgba(255,255,255,.85)',
            }}
          >
            {c}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function SwapPicker({
  players,
  members,
  me,
  onPick,
}: {
  players: PublicPlayer[];
  members: Map<string, PublicMember>;
  me: string;
  onPick: (id: string) => void;
}) {
  return (
    <Modal title="7 played – swap hands with…">
      <ul className="max-h-[50dvh] space-y-2 overflow-y-auto">
        {players
          .filter((p) => p.id !== me)
          .map((p) => (
            <li key={p.id}>
              <button
                className="flex w-full items-center gap-3 rounded-2xl bg-white/8 p-3 text-left hover:bg-white/15"
                onClick={() => onPick(p.id)}
              >
                <Avatar index={members.get(p.id)?.avatar ?? 0} size={40} />
                <span className="flex-1 font-bold">{p.name}</span>
                <span className="text-sm text-white/70">{p.handCount} cards</span>
              </button>
            </li>
          ))}
      </ul>
    </Modal>
  );
}

// ------------------------------------------------------------------ table center

export function Table({
  g,
  canDraw,
  onDraw,
}: {
  g: GameView;
  canDraw: boolean;
  onDraw: () => void;
}) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-3 py-2">
      <div className="flex items-center gap-6 sm:gap-10">
        <div className="flex flex-col items-center gap-1">
          <div className={canDraw ? 'turn-ring rounded-[12px]' : ''}>
            <div className="relative">
              <div className="absolute top-1 left-1 opacity-60">
                <CardBackStack />
              </div>
              <CardBackBtn onClick={canDraw ? onDraw : undefined} />
            </div>
          </div>
          <span className="text-xs font-bold text-white/70">Draw · {g.drawCount}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div
            className="rounded-[22px] p-1.5 transition-colors"
            style={{
              background: COLOR_HEX[g.activeColor],
              boxShadow: `0 0 36px 4px ${COLOR_HEX[g.activeColor]}88`,
            }}
            aria-label={`Active colour ${g.activeColor}`}
          >
            <CardFace key={g.top.id} card={g.top} w={84} className="anim-drop" />
          </div>
          <span className="flex items-center gap-1 text-xs font-bold text-white/80">
            <span
              className="inline-block h-3 w-3 rounded-full border border-white"
              style={{ background: COLOR_HEX[g.activeColor] }}
            />
            <span className="capitalize">{g.activeColor}</span>
          </span>
        </div>
      </div>
      {g.pending && (
        <div
          className="anim-pop rounded-full bg-red-500 px-4 py-1.5 text-sm font-black shadow-lg"
          role="status"
        >
          ⚠ +{g.pending.amount} pending
        </div>
      )}
    </div>
  );
}

import { CardBack } from './Card';
const CardBackBtn = ({ onClick }: { onClick?: () => void }) => (
  <CardBack w={84} onClick={onClick} label={onClick ? 'Draw a card' : 'Draw pile'} />
);
const CardBackStack = () => <CardBack w={84} />;
