import { useEffect, type ReactNode } from 'react';
import { AVATAR_COUNT } from '../../shared/room';

const EMOJI = ['🦊', '🐼', '🐸', '🦁', '🐙', '🦄', '🐯', '🐨', '🦉', '🐧', '🐲', '🦖'];
const HUES = [12, 200, 130, 38, 330, 280, 20, 160, 45, 190, 100, 70];
export const avatarCount = AVATAR_COUNT;

export function Avatar({
  index,
  size = 44,
  ring,
}: {
  index: number;
  size?: number;
  ring?: string;
}) {
  const i = ((index % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT;
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: size * 0.55,
        background: `linear-gradient(145deg, hsl(${HUES[i]} 80% 62%), hsl(${HUES[i] + 40} 70% 40%))`,
        boxShadow: ring ? `0 0 0 3px ${ring}` : 'inset 0 0 0 2px rgba(255,255,255,.35)',
      }}
      className="inline-grid shrink-0 place-items-center rounded-full leading-none"
    >
      {EMOJI[i]}
    </span>
  );
}

export function Logo({ size = 1 }: { size?: number }) {
  return (
    <div className="flex items-center gap-3 select-none" style={{ fontSize: `${size}rem` }}>
      <svg viewBox="0 0 64 64" width="2.6em" height="2.6em" aria-hidden>
        <g transform="rotate(-14 32 32)">
          <rect
            x="12"
            y="8"
            width="38"
            height="48"
            rx="8"
            fill="#e8404f"
            stroke="#fff"
            strokeWidth="3"
          />
          <ellipse cx="31" cy="32" rx="12" ry="18" fill="#fff" transform="rotate(25 31 32)" />
          <path d="M25 33h12M31 27v12" stroke="#e8404f" strokeWidth="5" strokeLinecap="round" />
        </g>
        <rect
          x="30"
          y="14"
          width="22"
          height="30"
          rx="5"
          fill="#3a78f2"
          stroke="#fff"
          strokeWidth="2.5"
          transform="rotate(14 41 29)"
          opacity=".95"
        />
      </svg>
      <span className="font-display text-[1.7em] leading-none font-black tracking-tight">
        Chroma<span className="text-[#ffd34d]">Rush</span>
      </span>
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title?: string;
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`panel anim-pop max-h-[90dvh] w-full overflow-y-auto p-5 ${wide ? 'max-w-2xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="font-display mb-3 text-xl font-black">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Toggle({
  on,
  onChange,
  disabled,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? 'bg-[#2fa866]' : 'bg-white/20'} ${disabled ? 'opacity-60' : ''}`}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-7' : 'left-1'}`}
      />
    </button>
  );
}

export const COLOR_HEX = {
  red: '#e8404f',
  yellow: '#f6b800',
  green: '#2fa866',
  blue: '#3a78f2',
} as const;
