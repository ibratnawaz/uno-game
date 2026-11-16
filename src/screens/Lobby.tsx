import { useState } from 'react';
import { ActiveRulesSummary, HouseRulesPanel } from '../components/HouseRulesPanel';
import { Avatar, Modal } from '../components/ui';
import { loadCreds } from '../net/online';
import { api } from '../net/api';
import { useStore } from '../store';

export const inviteUrl = (code: string) => `${location.origin}${location.pathname}?room=${code}`;
const groups = (t: string) => t.replace(/(.{4})/g, '$1-').replace(/-$/, '');

async function copy(text: string, say: (t: string) => void, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    say(`${what} copied!`);
  } catch {
    window.prompt(`Copy ${what}:`, text);
  }
}

export function Lobby() {
  const view = useStore((s) => s.view)!;
  const say = useStore((s) => s.say);
  const [showRules, setShowRules] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const me = view.members.find((m) => m.id === view.you);
  const isHost = view.hostId === view.you;
  const link = inviteUrl(view.code);
  const token = loadCreds(view.code)?.token ?? '';
  const n = view.members.length;
  const connected = view.members.filter((m) => m.connected).length;
  const canStart = isHost && n >= view.limits.min && connected >= view.limits.min;

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my Card Rush game',
          text: `Join my game! Room code ${view.code}`,
          url: link,
        });
        return;
      } catch {
        /* user cancelled */
      }
    }
    copy(link, say, 'Invite link');
  };

  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 py-6">
      <div className="panel mb-4 p-5 text-center">
        <p className="text-xs font-black tracking-widest text-white/55 uppercase">Room code</p>
        <button
          className="font-display my-1 text-5xl font-black tracking-[0.25em] text-[#ffd34d] sm:text-6xl"
          onClick={() => copy(view.code, say, 'Room code')}
          aria-label={`Room code ${view.code.split('').join(' ')}. Tap to copy`}
        >
          {view.code}
        </button>
        <div className="mt-3 flex flex-col justify-center gap-2 sm:flex-row">
          <button className="btn" onClick={share}>
            📤 Share invite
          </button>
          <button className="btn btn-ghost" onClick={() => copy(link, say, 'Invite link')}>
            🔗 Copy invite link
          </button>
        </div>
      </div>

      <div className="panel mb-4 p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-xl font-black">Players</h2>
          <span className="text-sm text-white/60">
            {n} / {view.limits.max}
            {n < view.limits.min ? ` · need ${view.limits.min - n} more` : ''}
          </span>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2" aria-live="polite">
          {view.members.map((m) => (
            <li key={m.id} className="anim-pop flex items-center gap-3 rounded-2xl bg-white/5 p-3">
              <Avatar index={m.avatar} size={46} ring={m.connected ? '#2fa866' : '#777'} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 truncate font-bold">
                  {m.name}
                  {m.id === view.you && <span className="text-xs text-white/50">(you)</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {m.isHost && <span className="chip bg-[#ffd34d] text-[#2b1d00]">Host</span>}
                  {m.isHost || m.ready ? (
                    <span className="chip bg-[#2fa866]/40">✓ Ready</span>
                  ) : (
                    <span className="chip">Not ready</span>
                  )}
                  {!m.connected && <span className="chip bg-red-500/40">Disconnected</span>}
                </div>
              </div>
              {isHost && m.id !== view.you && (
                <button
                  className="btn btn-ghost !min-h-9 !px-3 text-xs"
                  onClick={() => setConfirmRemove(m.id)}
                  aria-label={`Remove ${m.name}`}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {n < view.limits.max && (
          <p className="mt-3 text-center text-sm text-white/50">
            {view.limits.max - n} seats open · share the code or link to invite friends
          </p>
        )}
      </div>

      <div className="panel mb-4 p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-display text-xl font-black">Game rules</h2>
          <button
            className="btn btn-ghost !min-h-10 text-sm"
            onClick={() => setShowRules(!showRules)}
            aria-expanded={showRules}
          >
            {isHost ? '⚙️ Edit house rules' : 'Details'} {showRules ? '▲' : '▼'}
          </button>
        </div>
        <ActiveRulesSummary rules={view.rules} />
        {showRules && (
          <div className="mt-4">
            <HouseRulesPanel
              rules={view.rules}
              readOnly={!isHost}
              onChange={(r) => api.setRules(r)}
            />
            {!isHost && (
              <p className="mt-2 text-xs text-white/50">Only the host can change the rules.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {isHost ? (
          <button className="btn btn-lg btn-gold" disabled={!canStart} onClick={() => api.start()}>
            {canStart ? 'Start game' : `Waiting for players (${n}/${view.limits.min} minimum)`}
          </button>
        ) : (
          <>
            <button
              className={`btn btn-lg ${me?.ready ? 'btn-good' : ''}`}
              onClick={() => api.setReady(!me?.ready)}
            >
              {me?.ready ? '✓ Ready — tap to undo' : "I'm ready"}
            </button>
            <p className="text-center text-sm text-white/55">
              Waiting for the host to start the game…
            </p>
          </>
        )}
        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={() => setShowSecret(true)}>
            🔑 My recovery code
          </button>
          <button className="btn btn-ghost flex-1" onClick={() => setConfirmLeave(true)}>
            Leave room
          </button>
        </div>
      </div>

      {showSecret && (
        <RecoveryModal code={view.code} token={token} onClose={() => setShowSecret(false)} />
      )}
      {confirmRemove && (
        <Modal title="Remove player?" onClose={() => setConfirmRemove(null)}>
          <p className="mb-4 text-white/75">
            Remove {view.members.find((m) => m.id === confirmRemove)?.name} from the room?
          </p>
          <div className="flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={() => setConfirmRemove(null)}>
              Cancel
            </button>
            <button
              className="btn btn-danger flex-1"
              onClick={() => {
                api.remove(confirmRemove);
                setConfirmRemove(null);
              }}
            >
              Remove
            </button>
          </div>
        </Modal>
      )}
      {confirmLeave && (
        <Modal title="Leave this room?" onClose={() => setConfirmLeave(false)}>
          <p className="mb-4 text-white/75">
            {isHost
              ? 'Host rights will pass to another player.'
              : 'You can rejoin with the room code while the lobby is open.'}
          </p>
          <div className="flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={() => setConfirmLeave(false)}>
              Stay
            </button>
            <button className="btn btn-danger flex-1" onClick={() => api.leave()}>
              Leave
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function RecoveryModal({
  code,
  token,
  onClose,
}: {
  code: string;
  token: string;
  onClose: () => void;
}) {
  const say = useStore((s) => s.say);
  return (
    <Modal title="Your recovery code" onClose={onClose}>
      <p className="mb-3 text-sm text-white/70">
        This browser reconnects automatically. To continue on <b>another device</b>, open Card Rush
        → Play With Friends → Recover and enter the room code plus this code. Keep it private – it
        is your seat key.
      </p>
      <div className="mb-3 rounded-xl bg-black/30 p-3 text-center">
        <div className="text-xs text-white/50">Room {code}</div>
        <div className="font-mono text-lg font-black tracking-widest break-all">
          {token ? groups(token) : 'Not available'}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          className="btn btn-ghost flex-1"
          onClick={() => copy(token, say, 'Recovery code')}
          disabled={!token}
        >
          Copy
        </button>
        <button className="btn flex-1" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
