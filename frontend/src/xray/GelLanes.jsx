import { STRATEGY_COLORS } from "./DNAStrand";
import { pct } from "./ui";

// "How each reply turned out", drawn like a lab gel.
// One lane per kind of reply. The band sits at the share of calls that moved forward;
// the shaded block behind it is the 95% range, so a short, wide block means "we're fairly sure"
// and a tall, faint one means "too few calls to tell".

const SIGNAL = {
  better_than_rest: { text: "Works better", cls: "text-go" },
  worse_than_rest: { text: "Works worse", cls: "text-stall" },
  no_clear_difference: { text: "No clear difference", cls: "text-muted" },
  too_few_calls: { text: "Too few calls", cls: "text-wait" },
};

export default function GelLanes({ strategies, baseline, height = 220, animate = true }) {
  if (!strategies?.length) return <p className="text-sm text-muted">No replies recorded for this moment yet.</p>;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <figure>
      <div className="flex gap-2">
        {/* y axis */}
        <div className="relative w-9 shrink-0 text-right text-[11px] text-faint tabular" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `calc(${t * 100}% - 0.5em)` }}>
              {Math.round(t * 100)}%
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          {/* gridlines + average line */}
          <div className="pointer-events-none absolute inset-0" style={{ height }}>
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-line/70" style={{ bottom: `${t * 100}%` }} />
            ))}
            {baseline != null && (
              <div className="absolute inset-x-0 z-10 border-t-2 border-dashed border-ink/40" style={{ bottom: `${baseline * 100}%` }}>
                <span className="absolute -top-5 right-0 rounded bg-surface/90 px-1 text-[11px] font-medium text-muted">
                  average {pct(baseline)}
                </span>
              </div>
            )}
          </div>

          {/* lanes */}
          <div className="relative grid gap-2" style={{ gridTemplateColumns: `repeat(${strategies.length}, minmax(0, 1fr))` }}>
            {strategies.map((s, i) => {
              const color = STRATEGY_COLORS[s.strategy] || "#6b7780";
              return (
                <div key={s.strategy} className="relative rounded-md bg-well" style={{ height }}>
                  {s.decided > 0 && (
                    <div className="absolute inset-x-[18%] rounded-sm opacity-25"
                      style={{ bottom: `${s.ci[0] * 100}%`, height: `${(s.ci[1] - s.ci[0]) * 100}%`, background: color }} />
                  )}
                  {s.rate != null && (
                    <div className={`absolute inset-x-[10%] h-[7px] translate-y-1/2 rounded-full ${animate ? "band-drop" : ""}`}
                      style={{ bottom: `${s.rate * 100}%`, background: color, "--i": i, boxShadow: `0 0 0 3px ${color}22` }}>
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-bold tabular" style={{ color }}>
                        {pct(s.rate)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* lane labels */}
          <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${strategies.length}, minmax(0, 1fr))` }}>
            {strategies.map((s) => (
              <div key={s.strategy} className="min-w-0 text-center">
                <p className="text-xs font-semibold leading-tight" style={{ color: STRATEGY_COLORS[s.strategy] }}>{s.label}</p>
                <p className="mt-0.5 text-[11px] text-faint tabular">{s.decided} calls</p>
                <p className={`mt-0.5 text-[11px] font-medium leading-tight ${SIGNAL[s.signal]?.cls}`}>{SIGNAL[s.signal]?.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-xs text-muted">
        Band: share of calls that moved to the next stage. Shaded block: the likely range given how many calls we have.
      </figcaption>
    </figure>
  );
}
