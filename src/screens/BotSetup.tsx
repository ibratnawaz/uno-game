import { useState } from 'react';
import { HouseRulesPanel } from '../components/HouseRulesPanel';
import { ProfileFields, useProfile } from '../components/profile';
import { api } from '../net/api';
import { useStore } from '../store';
import { defaultRules, type Difficulty } from '../../shared/types';

const LEVELS: { id: Difficulty; label: string; blurb: string }[] = [
  { id: 'easy', label: 'Easy', blurb: 'Plays random legal cards, often forgets UNO.' },
  { id: 'medium', label: 'Medium', blurb: 'Keeps wilds, dumps long colours, attacks sometimes.' },
  { id: 'hard', label: 'Hard', blurb: 'Counts hands, attacks leaders, rarely forgets UNO.' },
];

export function BotSetup() {
  const nav = useStore((s) => s.nav);
  const say = useStore((s) => s.say);
  const profile = useProfile();
  const [bots, setBots] = useState(3);
  const [diff, setDiff] = useState<Difficulty>('medium');
  const [rules, setRules] = useState(defaultRules());
  const [showRules, setShowRules] = useState(false);

  const start = () => {
    const name = profile.name.trim();
    if (!name) return say('Please enter a nickname first.', 'error');
    api.startSolo({ name, avatar: profile.avatar, botCount: bots, difficulty: diff, rules });
  };

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 py-6">
      <button className="btn btn-ghost mb-4" onClick={() => nav('home')}>
        ← Back
      </button>
      <div className="panel space-y-6 p-5">
        <h1 className="font-display text-3xl font-black">Play With Bots</h1>
        <ProfileFields p={profile} />
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label htmlFor="botcount" className="text-sm font-bold text-white/70">
              Number of bots
            </label>
            <span className="text-sm text-white/60">
              <b className="text-lg text-white">{bots}</b> bots · {bots + 1} players total
            </span>
          </div>
          <input
            id="botcount"
            type="range"
            min={1}
            max={19}
            value={bots}
            onChange={(e) => setBots(Number(e.target.value))}
            className="h-10 w-full accent-[#ffd34d]"
            aria-valuetext={`${bots} bots`}
          />
          <div className="mt-1 flex justify-between text-xs text-white/40">
            <span>1</span>
            <span>19</span>
          </div>
          {bots + 1 > 8 && (
            <p className="mt-2 text-xs text-white/55">
              Large table: extended capacity — two decks are shuffled together. Hands still start at
              7 cards.
            </p>
          )}
        </div>
        <div>
          <span className="mb-2 block text-sm font-bold text-white/70">Difficulty</span>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Difficulty">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                role="radio"
                aria-checked={diff === l.id}
                onClick={() => setDiff(l.id)}
                className={`rounded-2xl border-2 p-3 text-left transition-colors ${diff === l.id ? 'border-[#ffd34d] bg-[#ffd34d]/15' : 'border-white/10 bg-white/5'}`}
              >
                <b>{l.label}</b>
                <p className="text-xs text-white/60">{l.blurb}</p>
              </button>
            ))}
          </div>
        </div>
        <div>
          <button
            className="btn btn-ghost w-full"
            aria-expanded={showRules}
            onClick={() => setShowRules(!showRules)}
          >
            ⚙️ House rules {showRules ? '▲' : '▼'}
          </button>
          {showRules && (
            <div className="mt-3">
              <HouseRulesPanel rules={rules} onChange={setRules} />
            </div>
          )}
        </div>
        <button className="btn btn-lg btn-gold w-full" onClick={start}>
          Start game
        </button>
      </div>
    </div>
  );
}
