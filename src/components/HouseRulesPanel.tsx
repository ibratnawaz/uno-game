import { RULE_CATALOG } from '../../shared/rules';
import type { HouseRules } from '../../shared/types';
import { Toggle } from './ui';

const GROUPS: { title: string; keys: string[]; hint?: string }[] = [
  {
    title: 'Stacking draw cards',
    keys: ['draw2OnDraw2', 'draw4OnDraw4', 'draw4OnDraw2', 'draw2OnDraw4'],
    hint: 'Off = standard rules: the penalty is taken immediately.',
  },
  { title: 'Hand & turn rules', keys: ['sevenZero', 'jumpIn'] },
  { title: 'Drawing', keys: ['drawUntilPlayable', 'forcePlay'] },
];

/** Editable (or read-only) list of house rules. Standard rules are always shown as baseline. */
export function HouseRulesPanel({
  rules,
  onChange,
  readOnly,
}: {
  rules: HouseRules;
  onChange?: (r: HouseRules) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
        <div className="chip mb-1 bg-[#2fa866]/30 text-[#9ff0c3]">Standard rules · always on</div>
        <p className="text-white/70">
          Match colour, number or symbol · Skip, Reverse, Draw Two, Wild, Wild Draw Four with
          challenge · call UNO at one card.
        </p>
      </div>
      {GROUPS.map((g) => (
        <section key={g.title}>
          <h3 className="mb-1 text-xs font-black tracking-wider text-white/60 uppercase">
            {g.title}
          </h3>
          {g.hint && <p className="mb-2 text-xs text-white/50">{g.hint}</p>}
          <ul className="space-y-2">
            {g.keys.map((k) => {
              const rule = RULE_CATALOG.find((r) => r.key === k)!;
              const on = rule.get(rules);
              return (
                <li
                  key={k}
                  className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${on ? 'border-[#ffd34d]/70 bg-[#ffd34d]/10' : 'border-white/10 bg-white/5'}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-bold">
                      {rule.name}
                      {on && <span className="chip bg-[#ffd34d] text-[#2b1d00]">Active</span>}
                    </div>
                    <p className="text-xs text-white/60">{rule.description}</p>
                  </div>
                  <Toggle
                    on={on}
                    label={rule.name}
                    disabled={readOnly}
                    onChange={(v) => onChange?.(rule.set(rules, v))}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function ActiveRulesSummary({ rules }: { rules: HouseRules }) {
  const active = RULE_CATALOG.filter((r) => r.get(rules));
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="chip bg-[#2fa866]/30 text-[#9ff0c3]">Standard rules</span>
      {active.length === 0 ? (
        <span className="chip">No house rules</span>
      ) : (
        active.map((r) => (
          <span key={r.key} className="chip bg-[#ffd34d] text-[#2b1d00]">
            {r.name}
          </span>
        ))
      )}
    </div>
  );
}
