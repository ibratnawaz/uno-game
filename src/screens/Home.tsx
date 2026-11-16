import { useState } from 'react';
import { CardFace } from '../components/Card';
import { HowToPlay } from '../components/HowToPlay';
import { Logo } from '../components/ui';
import { useStore } from '../store';

export function Home() {
  const nav = useStore((s) => s.nav);
  const [menu, setMenu] = useState(false);
  const go = (id: string) => {
    setMenu(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0d1030]/80 backdrop-blur">
        <nav
          className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3"
          aria-label="Main"
        >
          <Logo size={0.8} />
          <div className="hidden items-center gap-6 text-sm font-bold text-white/80 md:flex">
            <button onClick={() => go('how')}>How to play</button>
            <button onClick={() => go('rules')}>Rules</button>
            <button className="btn" onClick={() => nav('friends', 'create')}>
              Play now
            </button>
          </div>
          <button
            className="btn btn-ghost md:!hidden"
            aria-expanded={menu}
            aria-label="Menu"
            onClick={() => setMenu(!menu)}
          >
            ☰
          </button>
        </nav>
        {menu && (
          <div className="flex flex-col gap-1 border-t border-white/10 px-4 py-3 md:hidden">
            <button className="py-3 text-left font-bold" onClick={() => go('how')}>
              How to play
            </button>
            <button className="py-3 text-left font-bold" onClick={() => go('rules')}>
              Standard & house rules
            </button>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16">
        <section className="grid items-center gap-8 py-10 md:grid-cols-2 md:py-16">
          <div>
            <p className="chip mb-4 bg-[#ffd34d] text-[#2b1d00]">
              Free · No install · 2–20 players
            </p>
            <h1 className="font-display text-4xl leading-[1.05] font-black md:text-6xl">
              The colourful card game <span className="text-[#ffd34d]">everyone</span> knows, on
              every screen.
            </h1>
            <p className="mt-4 max-w-lg text-lg text-white/75">
              Create a private room, share the link and play with friends on any device — or
              practise against clever bots. Reconnect any time: your seat and cards are always
              waiting for you.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button className="btn btn-lg" onClick={() => nav('friends', 'create')}>
                👥 Play With Friends
              </button>
              <button className="btn btn-lg btn-gold" onClick={() => nav('bots')}>
                🤖 Play With Bots
              </button>
            </div>
          </div>
          <div className="relative mx-auto h-64 w-full max-w-sm md:h-80" aria-hidden>
            {[
              { c: { id: 1, color: 'red', value: '7' }, r: -22, x: -90, y: 20 },
              { c: { id: 2, color: 'yellow', value: 'reverse' }, r: -8, x: -35, y: 0 },
              { c: { id: 3, color: 'green', value: 'draw2' }, r: 8, x: 20, y: 0 },
              { c: { id: 4, color: 'wild', value: 'wild4' }, r: 22, x: 75, y: 20 },
            ].map((x, i) => (
              <div
                key={i}
                className="absolute top-1/2 left-1/2"
                style={{
                  transform: `translate(calc(-50% + ${x.x}px), calc(-50% + ${x.y}px)) rotate(${x.r}deg)`,
                }}
              >
                <div className="anim-pop" style={{ animationDelay: `${i * 90}ms` }}>
                  <CardFace card={x.c as never} w={92} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="scroll-mt-20 py-6">
          <HowToPlay />
        </section>
        <section id="rules" className="scroll-mt-20 py-6" aria-label="Disclaimer">
          <p className="text-center text-xs text-white/45">
            Card Rush is an unofficial, fan-made, UNO-inspired card game with original artwork. It
            is not affiliated with, endorsed by or connected to Mattel or the UNO® brand.
          </p>
        </section>
      </main>
    </div>
  );
}
