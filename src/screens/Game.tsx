import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card, Color } from '../../shared/types';
import { ActiveRulesSummary } from '../components/HouseRulesPanel';
import { ColorPicker, Hand, OpponentStrip, SwapPicker, Table } from '../components/GameParts';
import { GameOver } from '../components/GameOver';
import { Avatar, Modal } from '../components/ui';
import { api } from '../net/api';
import { loadCreds } from '../net/online';
import { useStore } from '../store';
import { RecoveryModal, inviteUrl } from './Lobby';

export function Game() {
  const view = useStore((s) => s.view)!;
  const mode = useStore((s) => s.mode);
  const say = useStore((s) => s.say);
  const g = view.game!;
  const [menu, setMenu] = useState(false);
  const [feed, setFeed] = useState(false);
  const [secret, setSecret] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const members = useMemo(() => new Map(view.members.map((m) => [m.id, m])), [view.members]);

  const me = g.players.find((p) => p.id === g.you);
  const myTurn = g.current === g.you && g.phase !== 'over';
  const isHost = view.hostId === g.you;
  const playable = useMemo(() => new Set(g.playable), [g.playable]);
  const handCount = g.hand.length;

  // Opponents in turn order starting from the player after me.
  const opponents = useMemo(() => {
    const i = g.players.findIndex((p) => p.id === g.you);
    const n = g.players.length;
    return Array.from(
      { length: n - 1 },
      (_, k) => g.players[(((i + g.direction * (k + 1)) % n) + n) % n],
    );
  }, [g.players, g.you, g.direction]);

  const act = (a: Parameters<typeof api.act>[0]) =>
    api.act(a).catch((e: Error) => say(e.message, 'error'));

  const canDraw = myTurn && g.phase === 'play' && g.drawnCardId === null;
  const vulnerable =
    g.vulnerable && g.vulnerable !== g.you ? g.players.find((p) => p.id === g.vulnerable) : null;
  const unoNeeded =
    !!me && ((handCount === 1 && !me.unoCalled) || (handCount === 2 && myTurn && !me.unoCalled));
  const waiting = view.waitingFor;
  const current = g.players.find((p) => p.id === g.current);

  // Announce the newest activity line for screen readers and show it as a ticker.
  const lastLog = view.log[view.log.length - 1]?.text ?? '';
  const prevTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !prevTurn.current && navigator.vibrate) navigator.vibrate(60);
    prevTurn.current = myTurn;
  }, [myTurn]);

  const status = (() => {
    if (g.phase === 'over') return 'Round over';
    if (waiting)
      return waiting.id === g.you
        ? 'Reconnecting…'
        : `${waiting.name} disconnected. Waiting for reconnection.`;
    if (!myTurn) return `${current?.name ?? ''}'s turn`;
    if (g.phase === 'chooseColor') return 'Choose a colour';
    if (g.phase === 'chooseSwap') return 'Choose who to swap with';
    if (g.pending)
      return g.pending.challengeable
        ? `Wild Draw Four! Challenge it or draw ${g.pending.amount}`
        : `Stack a draw card or draw ${g.pending.amount}`;
    if (g.drawnCardId !== null) return 'Play the card you drew, or pass';
    return 'Your turn!';
  })();

  const onPlay = (c: Card) => {
    if (!playable.has(c.id)) {
      say(myTurn ? "That card can't be played now." : "It's not your turn.", 'error');
      return;
    }
    act({ type: 'play', cardId: c.id });
  };

  const leave = () => {
    setConfirmLeave(false);
    api.leave();
  };

  return (
    <div className="mx-auto flex h-dvh max-w-5xl flex-col overflow-hidden">
      <header className="flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1">
        <button
          className="btn btn-ghost !min-h-11 !px-4"
          aria-label="Menu"
          onClick={() => setMenu(true)}
        >
          ☰
        </button>
        <div
          role="status"
          aria-live="polite"
          className={`flex-1 truncate rounded-full px-4 py-2 text-center text-sm font-black ${myTurn && !waiting ? 'bg-[#ffd34d] text-[#2b1d00]' : waiting ? 'bg-red-500/80' : 'bg-white/10'}`}
        >
          {status}
        </div>
        <div
          className="flex flex-col items-center text-[10px] leading-tight font-bold text-white/70"
          title={g.direction === 1 ? 'Clockwise' : 'Counter-clockwise'}
        >
          <span
            className="text-2xl"
            aria-hidden
            style={{
              display: 'inline-block',
              animation: `spinDir 6s linear infinite ${g.direction === 1 ? 'normal' : 'reverse'}`,
            }}
          >
            ↻
          </span>
          <span className="sr-only">{g.direction === 1 ? 'Clockwise' : 'Counter-clockwise'}</span>
        </div>
      </header>

      {waiting && waiting.id !== g.you && (
        <div
          className="mx-3 mb-1 flex items-center justify-between gap-2 rounded-xl bg-red-500/20 px-3 py-2 text-sm"
          role="alert"
        >
          <span>⏸ Game paused — {waiting.name}&apos;s seat and cards are kept safe.</span>
          {isHost && (
            <button
              className="btn btn-danger !min-h-9 !px-3 text-xs"
              onClick={() => setConfirmRemove(waiting.id)}
            >
              Remove player
            </button>
          )}
        </div>
      )}

      <OpponentStrip
        players={opponents}
        members={members}
        current={g.current}
        vulnerable={g.vulnerable}
        isHost={isHost}
        onRemove={setConfirmRemove}
      />

      <Table g={g} canDraw={canDraw} onDraw={() => act({ type: 'draw' })} />

      <button
        className="mx-3 mb-1 truncate rounded-xl bg-black/25 py-1.5 pr-20 pl-3 text-left text-xs text-white/75"
        onClick={() => setFeed(true)}
        aria-label="Open activity log"
      >
        💬 {lastLog || 'Game started'}
      </button>

      {/* Contextual actions */}
      <div className="flex flex-wrap items-center justify-center gap-2 px-3 pb-1">
        {myTurn && g.pending?.challengeable && (
          <button className="btn btn-danger" onClick={() => act({ type: 'challenge' })}>
            ⚔️ Challenge
          </button>
        )}
        {myTurn && g.pending && (
          <button className="btn btn-gold" onClick={() => act({ type: 'draw' })}>
            Draw {g.pending.amount}
          </button>
        )}
        {myTurn && g.drawnCardId !== null && (
          <button className="btn btn-ghost" onClick={() => act({ type: 'pass' })}>
            Pass turn
          </button>
        )}
        {vulnerable && (
          <button
            className="btn btn-danger uno-need"
            onClick={() => act({ type: 'catchUno', target: vulnerable.id })}
          >
            🚨 Catch {vulnerable.name}!
          </button>
        )}
      </div>

      <div className="relative">
        <button
          className={`absolute right-3 -top-16 z-10 grid h-16 w-16 place-items-center rounded-full border-4 border-white text-lg font-black shadow-xl ${unoNeeded ? 'uno-need bg-[#e8404f]' : 'bg-[#8a2330]/80 opacity-80'}`}
          aria-label="Call UNO"
          onClick={() => act({ type: 'callUno' })}
        >
          UNO!
        </button>
        <div className="pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <Hand
            hand={g.hand}
            playable={playable}
            active={myTurn || g.playable.length > 0}
            onPlay={onPlay}
          />
          <p className="-mt-1 text-center text-xs text-white/55">
            {handCount} card{handCount === 1 ? '' : 's'} in your hand
          </p>
        </div>
      </div>

      {/* Pending choices */}
      {myTurn && g.phase === 'chooseColor' && (
        <ColorPicker wild4={false} onPick={(color: Color) => act({ type: 'chooseColor', color })} />
      )}
      {myTurn && g.phase === 'chooseSwap' && (
        <SwapPicker
          players={g.players}
          members={members}
          me={g.you}
          onPick={(target) => act({ type: 'chooseSwap', target })}
        />
      )}

      {g.phase === 'over' && (
        <GameOver
          view={view}
          onLeave={() => (mode === 'local' ? api.leave() : setConfirmLeave(true))}
        />
      )}

      {feed && (
        <Modal title="Activity" onClose={() => setFeed(false)}>
          <ol className="max-h-[55dvh] space-y-1 overflow-y-auto text-sm">
            {[...view.log].reverse().map((l) => (
              <li key={l.n} className="rounded-lg bg-white/5 px-3 py-1.5">
                {l.text}
              </li>
            ))}
          </ol>
          <button className="btn mt-3 w-full" onClick={() => setFeed(false)}>
            Close
          </button>
        </Modal>
      )}

      {menu && (
        <Modal
          title={mode === 'local' ? 'Game menu' : `Room ${view.code}`}
          onClose={() => setMenu(false)}
          wide
        >
          <div className="space-y-4">
            <ActiveRulesSummary rules={g.rules} />
            {g.decks > 1 && (
              <p className="text-xs text-white/50">
                Extended capacity: {g.decks} decks are in play for {g.players.length} players.
              </p>
            )}
            <ul className="grid gap-2 sm:grid-cols-2">
              {view.members.map((m) => {
                const p = g.players.find((x) => x.id === m.id);
                return (
                  <li key={m.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-2">
                    <Avatar index={m.avatar} size={36} ring={m.connected ? '#2fa866' : '#888'} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">
                        {m.name}
                        {m.isHost && mode === 'online' ? ' 👑' : ''}
                        {m.id === g.you ? ' (you)' : ''}
                      </div>
                      <div className="text-xs text-white/60">
                        {p?.handCount ?? 0} cards · {view.scores[m.id] ?? 0} pts
                        {!m.connected ? ' · disconnected' : ''}
                      </div>
                    </div>
                    {isHost && !m.connected && m.id !== g.you && (
                      <button
                        className="btn btn-danger !min-h-9 !px-3 text-xs"
                        onClick={() => {
                          setMenu(false);
                          setConfirmRemove(m.id);
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {mode === 'online' && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  className="btn btn-ghost flex-1"
                  onClick={() =>
                    navigator.clipboard
                      ?.writeText(inviteUrl(view.code))
                      .then(() => say('Invite link copied!'))
                  }
                >
                  🔗 Copy invite link
                </button>
                <button
                  className="btn btn-ghost flex-1"
                  onClick={() => {
                    setMenu(false);
                    setSecret(true);
                  }}
                >
                  🔑 Recovery code
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={() => setMenu(false)}>
                Resume
              </button>
              <button
                className="btn btn-danger flex-1"
                onClick={() => {
                  setMenu(false);
                  setConfirmLeave(true);
                }}
              >
                {mode === 'local' ? 'Quit game' : 'Leave game'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {secret && (
        <RecoveryModal
          code={view.code}
          token={loadCreds(view.code)?.token ?? ''}
          onClose={() => setSecret(false)}
        />
      )}

      {confirmRemove && (
        <Modal title="Remove player?" onClose={() => setConfirmRemove(null)}>
          <p className="mb-2 text-white/80">
            Remove <b>{members.get(confirmRemove)?.name}</b> from the game?
          </p>
          <p className="mb-4 text-xs text-white/55">
            Their cards go to the bottom of the draw pile, the turn passes to the next player, and
            their old session can no longer reconnect.
          </p>
          <div className="flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={() => setConfirmRemove(null)}>
              Keep waiting
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
        <Modal
          title={mode === 'local' ? 'Quit this game?' : 'Leave this game?'}
          onClose={() => setConfirmLeave(false)}
        >
          <p className="mb-4 text-white/75">
            {mode === 'local'
              ? 'Your progress will be lost.'
              : 'Leaving is permanent: your seat is given up and your cards return to the pile. (Closing the tab or losing connection does NOT do this.)'}
          </p>
          <div className="flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={() => setConfirmLeave(false)}>
              Stay
            </button>
            <button className="btn btn-danger flex-1" onClick={leave}>
              {mode === 'local' ? 'Quit' : 'Leave'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
