import { useState } from 'react';
import { normalizeCode } from '../../shared/protocol';
import { ProfileFields, useProfile } from '../components/profile';
import { api } from '../net/api';
import { useStore } from '../store';

export function Friends() {
  const { nav, friendsTab, prefillCode, say } = useStore();
  const profile = useProfile();
  const [tab, setTab] = useState<'create' | 'join' | 'recover'>(friendsTab);
  const [code, setCode] = useState(prefillCode);
  const [recovery, setRecovery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setError('');
    if (tab !== 'recover' && !profile.name.trim())
      return setError('Please enter a nickname first.');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      say(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 py-6">
      <button className="btn btn-ghost mb-4" onClick={() => nav('home')}>
        ← Back
      </button>
      <div className="panel p-5">
        <h1 className="font-display mb-4 text-3xl font-black">Play With Friends</h1>
        <div className="mb-5 grid grid-cols-3 gap-1 rounded-full bg-black/30 p-1" role="tablist">
          {(['create', 'join', 'recover'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setError('');
              }}
              className={`rounded-full py-2.5 text-sm font-black ${tab === t ? 'bg-[#5b6bff] text-white' : 'text-white/65'}`}
            >
              {t === 'create' ? 'Create Room' : t === 'join' ? 'Join Room' : 'Recover'}
            </button>
          ))}
        </div>

        {tab !== 'recover' && <ProfileFields p={profile} />}

        {tab === 'create' && (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-white/65">
              You get a private room code and an invite link. Up to 20 players can join, including
              you.
            </p>
            <button
              className="btn btn-lg w-full"
              disabled={busy}
              onClick={() => run(() => api.createRoom(profile.name, profile.avatar))}
            >
              {busy ? 'Creating…' : 'Create private room'}
            </button>
          </div>
        )}

        {tab === 'join' && (
          <div className="mt-5 space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-white/70">Room code</span>
              <input
                className="input text-center text-2xl font-black tracking-[0.35em] uppercase"
                value={code}
                maxLength={8}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="ABC123"
                aria-label="Room code"
                onChange={(e) => setCode(normalizeCode(e.target.value))}
              />
            </label>
            <button
              className="btn btn-lg w-full"
              disabled={busy || code.length < 6}
              onClick={() => run(() => api.joinRoom(code, profile.name, profile.avatar))}
            >
              {busy ? 'Joining…' : 'Join room'}
            </button>
          </div>
        )}

        {tab === 'recover' && (
          <div className="mt-1 space-y-3">
            <p className="text-sm text-white/65">
              Switching browser or device? Enter the room code and the <b>recovery code</b> shown in
              your lobby / game menu to get your seat, cards and host rights back.
            </p>
            <input
              className="input text-center font-black tracking-[0.3em] uppercase"
              placeholder="ROOM CODE"
              aria-label="Room code"
              value={code}
              maxLength={8}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
            />
            <input
              className="input text-center font-mono tracking-widest uppercase"
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
              aria-label="Recovery code"
              value={recovery}
              onChange={(e) => setRecovery(e.target.value)}
            />
            <button
              className="btn btn-lg w-full"
              disabled={
                busy || code.length < 6 || recovery.replace(/[^A-Za-z0-9]/g, '').length < 16
              }
              onClick={() => run(() => api.recover(code, recovery))}
            >
              Reconnect to Game
            </button>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-red-500/20 p-3 text-sm font-semibold text-red-200"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
