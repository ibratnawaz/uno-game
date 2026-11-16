import { useEffect } from 'react';
import { ConnectionBanner } from './components/ConnectionBanner';
import { Logo } from './components/ui';
import { api } from './net/api';
import { BotSetup } from './screens/BotSetup';
import { Friends } from './screens/Friends';
import { Game } from './screens/Game';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { useStore } from './store';

function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role="status"
      className={`anim-pop fixed top-[max(1rem,env(safe-area-inset-top))] left-1/2 z-[70] max-w-[92vw] -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-bold shadow-2xl ${toast.kind === 'error' ? 'bg-red-600' : 'bg-[#2fa866]'}`}
    >
      {toast.text}
    </div>
  );
}

export default function App() {
  const { view, screen, restoring } = useStore();

  useEffect(() => {
    api.restore();
  }, []);

  let body;
  if (restoring && !view) {
    body = (
      <div className="grid min-h-dvh place-items-center">
        <div className="text-center">
          <Logo size={1.2} />
          <p className="mt-4 animate-pulse text-white/70">Restoring your game…</p>
        </div>
      </div>
    );
  } else if (view) {
    body = view.status === 'lobby' || !view.game ? <Lobby /> : <Game />;
  } else if (screen === 'bots') body = <BotSetup />;
  else if (screen === 'friends') body = <Friends />;
  else body = <Home />;

  return (
    <>
      <ConnectionBanner />
      {body}
      <Toast />
    </>
  );
}
