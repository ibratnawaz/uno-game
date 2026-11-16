import type { Card as CardModel } from '../../shared/types';

function Glyph({ value, big }: { value: CardModel['value']; big: boolean }) {
  const s = big ? 1 : 0.34;
  switch (value) {
    case 'skip':
      return (
        <svg viewBox="0 0 40 40" width={`${s * 52}%`} aria-label="Skip">
          <circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" strokeWidth="6" />
          <path d="M10 30 30 10" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        </svg>
      );
    case 'reverse':
      return (
        <svg viewBox="0 0 40 40" width={`${s * 56}%`} aria-label="Reverse" fill="currentColor">
          <path
            d="M6 18 20 4v8h10c4 0 6 2 6 6s-2 6-6 6h-4v-5h3c1 0 1.500-.4 1.500-1s-.5-1-1.500-1H20v8z"
            transform="translate(-2 -2) scale(.95)"
          />
          <path
            d="M34 22 20 36v-8H10c-4 0-6-2-6-6s2-6 6-6h4v5h-3c-1 0-1.500.4-1.500 1s.5 1 1.500 1h9v-8z"
            transform="translate(2 2) scale(.95)"
            opacity=".85"
          />
        </svg>
      );
    case 'draw2':
      return <span>+2</span>;
    case 'wild4':
      return <span style={{ color: '#fff', WebkitTextStroke: '1.5px #14172e' }}>+4</span>;
    case 'wild':
      return <div className="quad" />;
    default:
      return <span>{value}</span>;
  }
}

const short = (v: CardModel['value']) =>
  v === 'draw2'
    ? '+2'
    : v === 'wild4'
      ? '+4'
      : v === 'skip'
        ? '⊘'
        : v === 'reverse'
          ? '⇄'
          : v === 'wild'
            ? '★'
            : v;

export function CardFace({
  card,
  w = 64,
  playable,
  dim,
  onClick,
  className = '',
  title,
}: {
  card: CardModel;
  w?: number;
  playable?: boolean;
  dim?: boolean;
  onClick?: () => void;
  className?: string;
  title?: string;
}) {
  const wildish = card.color === 'wild';
  const cls = `uc ${card.color} ${playable ? 'playable' : ''} ${dim ? 'dim' : ''} ${onClick ? 'btn-card' : ''} ${className}`;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cls}
      style={{ ['--w' as string]: `${w}px`, padding: 0 }}
      aria-label={title ?? `${card.color} ${card.value}`}
      title={title}
    >
      {wildish && card.value === 'wild' ? null : <div className="oval" />}
      <div className={`mid ${card.value === 'wild4' ? '' : ''}`}>
        {card.value === 'wild4' ? (
          <div
            className="quad"
            style={{
              display: 'grid',
              placeItems: 'center',
              width: '66%',
              fontSize: w * 0.34,
              fontWeight: 900,
              color: '#fff',
              WebkitTextStroke: '1.5px #14172e',
            }}
          >
            +4
          </div>
        ) : (
          <Glyph value={card.value} big />
        )}
      </div>
      <span className="corner tl">{short(card.value)}</span>
      <span className="corner br">{short(card.value)}</span>
    </Tag>
  );
}

export function CardBack({
  w = 64,
  onClick,
  label,
  className = '',
}: {
  w?: number;
  onClick?: () => void;
  label?: string;
  className?: string;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={label ?? 'Draw pile'}
      className={`uc back ${onClick ? 'btn-card' : ''} ${className}`}
      style={{ ['--w' as string]: `${w}px`, padding: 0 }}
    >
      <div className="oval" />
      <div className="mid">CR</div>
    </Tag>
  );
}
