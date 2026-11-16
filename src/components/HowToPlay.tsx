import { RULE_CATALOG } from '../../shared/rules';

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <li className="flex gap-3">
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ffd34d] font-black text-[#2b1d00]">
      {n}
    </span>
    <div>
      <b>{title}</b>
      <p className="text-sm text-white/70">{children}</p>
    </div>
  </li>
);

export function HowToPlay() {
  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="panel p-5">
          <h3 className="font-display mb-3 text-xl font-black">How to play</h3>
          <ol className="space-y-3">
            <Step n={1} title="Be first to empty your hand">
              Everyone starts with 7 cards. Play your last card to win the round and score points
              from the cards left in other hands.
            </Step>
            <Step n={2} title="Match the top card">
              Play a card with the same colour, number or symbol. Wild cards can be played any time
              and let you pick the next colour.
            </Step>
            <Step n={3} title="Can't play? Draw">
              Draw one card. If it can be played you may play it right away, otherwise pass.
            </Step>
            <Step n={4} title="Say UNO!">
              When you are down to one card hit the UNO! button. If someone catches you first, you
              draw 2.
            </Step>
          </ol>
        </div>
        <div className="panel p-5">
          <h3 className="font-display mb-3 text-xl font-black">Action cards</h3>
          <ul className="space-y-2 text-sm text-white/80">
            <li>
              <b>Skip</b> – the next player loses their turn.
            </li>
            <li>
              <b>Reverse</b> – play changes direction (acts as Skip with 2 players).
            </li>
            <li>
              <b>Draw Two</b> – the next player draws 2 and loses their turn.
            </li>
            <li>
              <b>Wild</b> – choose any colour.
            </li>
            <li>
              <b>Wild Draw Four</b> – choose a colour; the next player draws 4 and loses their turn.
              You may only play it legally when you hold <i>no card of the current colour</i>. The
              victim can <b>challenge</b>: if you cheated you draw 4, otherwise they draw 6.
            </li>
          </ul>
          <p className="mt-3 text-xs text-white/50">
            Up to 20 players is an <b>extended multiplayer capacity</b> – the classic game is not
            officially designed for that many. Large tables automatically shuffle two decks
            together; everyone still starts with 7 cards.
          </p>
        </div>
      </div>
      <div className="panel p-5">
        <h3 className="font-display mb-1 text-xl font-black">Optional house rules</h3>
        <p className="mb-3 text-sm text-white/60">
          All of these are off by default and are chosen before the game starts. Bots follow the
          same rules.
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          {RULE_CATALOG.map((r) => (
            <div key={r.key} className="rounded-xl bg-white/5 p-3">
              <b>{r.name}</b>
              <p className="text-sm text-white/65">{r.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
