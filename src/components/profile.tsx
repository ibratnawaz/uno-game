import { useState } from 'react';
import { Avatar, avatarCount } from './ui';

const read = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

export function useProfile() {
  const [name, setName] = useState(() => read('chromarush.name', ''));
  const [avatar, setAvatar] = useState(() =>
    Number(read('chromarush.avatar', String(Math.floor(Math.random() * avatarCount)))),
  );
  return {
    name,
    avatar,
    setName: (v: string) => {
      setName(v);
      write('chromarush.name', v);
    },
    setAvatar: (v: number) => {
      setAvatar(v);
      write('chromarush.avatar', String(v));
    },
  };
}

export function ProfileFields({ p }: { p: ReturnType<typeof useProfile> }) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-white/70">Nickname</span>
        <input
          className="input"
          value={p.name}
          maxLength={16}
          placeholder="e.g. Sunny"
          autoComplete="nickname"
          onChange={(e) => p.setName(e.target.value)}
        />
      </label>
      <div>
        <span className="mb-1 block text-sm font-bold text-white/70">Avatar</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Avatar">
          {Array.from({ length: avatarCount }, (_, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={p.avatar === i}
              aria-label={`Avatar ${i + 1}`}
              onClick={() => p.setAvatar(i)}
              className={`rounded-full p-0.5 ${p.avatar === i ? 'bg-white' : 'bg-transparent opacity-70'}`}
            >
              <Avatar index={i} size={40} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
