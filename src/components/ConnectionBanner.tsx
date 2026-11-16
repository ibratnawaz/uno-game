import { api } from '../net/api';
import { useStore } from '../store';

/** Shown whenever the realtime connection is not healthy (multiplayer only). */
export function ConnectionBanner() {
  const conn = useStore((s) => s.conn);
  const mode = useStore((s) => s.mode);
  if (mode !== 'online' || conn === 'online' || conn === 'idle') return null;
  const failed = conn === 'failed';
  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-3 px-3 py-2 text-sm font-bold ${failed ? 'bg-red-600' : 'bg-amber-500 text-black'}`}
    >
      <span className={failed ? '' : 'animate-pulse'}>
        {failed ? 'Connection lost.' : 'Reconnecting… your seat and cards are safe.'}
      </span>
      <button
        className="rounded-full bg-black/25 px-3 py-1 text-xs font-black text-white"
        onClick={() => api.reconnectNow()}
      >
        Reconnect to Game
      </button>
    </div>
  );
}
