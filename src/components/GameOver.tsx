import { useMemo } from 'react';
import { cardPoints } from '../../shared/deck';
import type { RoomView } from '../../shared/room';
import { api } from '../net/api';
import { useStore } from '../store';
import { Avatar } from './ui';

const CONFETTI = ['#e8404f', '#f6b800', '#2fa866', '#3a78f2', '#ffffff', '#c084fc'];

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.6,
        dur: 2.4 + Math.random() * 2.2,
        color: CONFETTI[i % CONFETTI.length],
      })),
    [],
  );
  return (
    <div aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          className="confetti"
          style={{
            left: `${b.left}%`,
            background: b.color,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

export function GameOver({ view, onLeave }: { view: RoomView; onLeave: () => void }) {
  const mode = useStore((s) => s.mode);
  const g = view.game!;
  const winner = view.members.find((m) => m.id === g.winner);
  const iWon = g.winner === view.you;
  const isHost = view.hostId === view.you;
  const rows = view.members
    .map((m) => ({
      m,
      left: g.finalHands?.[m.id]?.reduce((a, c) => a + cardPoints(c), 0) ?? 0,
      cards: g.finalHands?.[m.id]?.length ?? 0,
      total: view.scores[m.id] ?? 0,
    }))
    .sort((a, b) => b.total - a.total);

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-[#0d1030]/90 p-4 backdrop-blur"
      role="dialog"
      aria-label="Game over"
    >
      <Confetti />
      <div className="panel anim-pop w-full max-w-md p-6 text-center">
        <p className="text-sm font-black tracking-widest text-[#ffd34d] uppercase">
          {iWon ? 'Victory!' : 'Round over'}
        </p>
        <div className="my-3 flex justify-center">
          <Avatar index={winner?.avatar ?? 0} size={96} ring="#ffd34d" />
        </div>
        <h2 className="font-display text-3xl font-black">
          {iWon ? 'You win!' : `${winner?.name ?? 'Someone'} wins!`}
        </h2>
        <p className="mt-1 text-white/70">
          scored <b className="text-[#ffd34d]">{g.roundPoints}</b> points · round {view.round}
        </p>
        <ol className="mt-4 space-y-1.5 text-left" aria-label="Scores">
          {rows.slice(0, 10).map((r, i) => (
            <li
              key={r.m.id}
              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 ${r.m.id === g.winner ? 'bg-[#ffd34d]/20' : 'bg-white/5'}`}
            >
              <span className="w-5 text-sm text-white/50">{i + 1}</span>
              <Avatar index={r.m.avatar} size={28} />
              <span className="flex-1 truncate font-bold">{r.m.name}</span>
              <span className="text-xs text-white/55">
                {r.m.id === g.winner ? 'winner' : `${r.cards} cards · ${r.left} pts`}
              </span>
              <b className="w-12 text-right">{r.total}</b>
            </li>
          ))}
        </ol>
        {view.members.length > 10 && (
          <p className="mt-1 text-xs text-white/50">…and {view.members.length - 10} more</p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          {mode === 'local' || isHost ? (
            <button className="btn btn-lg btn-gold" onClick={() => api.start()}>
              Play again
            </button>
          ) : (
            <p className="rounded-xl bg-white/5 p-3 text-sm text-white/65">
              Waiting for the host to start the next round…
            </p>
          )}
          {mode === 'online' && isHost && (
            <button className="btn btn-ghost" onClick={() => api.toLobby()}>
              Return to lobby
            </button>
          )}
          <button className="btn btn-ghost" onClick={onLeave}>
            {mode === 'local' ? 'Home' : 'Leave room'}
          </button>
        </div>
      </div>
    </div>
  );
}
