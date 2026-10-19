import { useCallback, useEffect, useState } from "react";
import { xray } from "./api";
import { Button, ErrorNote, inr, num, Panel, pct } from "./ui";

const VERDICTS = {
  collecting_data: { text: "Still collecting data", cls: "bg-wait-soft text-wait" },
  treatment_better: { text: "New script works better", cls: "bg-go-soft text-go" },
  treatment_worse: { text: "New script works worse", cls: "bg-stall-soft text-stall" },
  no_clear_difference: { text: "No clear difference", cls: "bg-well text-muted" },
};
const STRENGTH = {
  strong: "Strong evidence",
  moderate: "Moderate evidence",
  weak: "Weak evidence",
};

/* ---------- headline numbers ---------- */

function Summary({ s }) {
  const items = [
    ["Enquiries", num(s.enquiries), `${num(s.open)} still open`],
    ["Enrolments", num(s.enrolments), inr(s.revenue)],
    ["Conversion", pct(s.conversion_rate, 1), `of ${num(s.decided)} decided prospects`],
  ];
  return (
    <div className="grid grid-cols-1 divide-y divide-line rounded-2xl border border-line bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {items.map(([label, value, hint]) => (
        <div key={label} className="px-6 py-5">
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-1 font-display text-4xl font-bold tabular">{value}</p>
          <p className="mt-1 text-xs text-faint">{hint}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------- funnel ---------- */

function Funnel({ stages, bottleneckKey, minSample }) {
  const top = stages[0]?.reached || 1;
  return (
    <ol className="space-y-1">
      {stages.map((s) => {
        const flagged = s.key === bottleneckKey;
        return (
          <li key={s.key}
            className={`grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-x-3 rounded-xl px-2 py-2 ${flagged ? "bg-stall-soft" : ""}`}>
            <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold tabular ${
              flagged ? "bg-stall text-white" : "bg-well text-muted"}`}>{s.seq}</span>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className={`truncate text-sm font-semibold ${flagged ? "text-stall" : "text-ink"}`}>{s.label}</span>
                <span className="text-sm tabular text-muted">{num(s.reached)}</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-well">
                <div className={`h-2 rounded-full ${flagged ? "bg-stall" : "bg-ink"}`} style={{ width: `${(s.reached / top) * 100}%` }} />
              </div>
              {!s.is_final && (
                <p className={`mt-1 text-xs ${flagged ? "font-medium text-stall" : "text-faint"}`}>
                  {pct(s.progression_rate)} moved to the next stage
                  {s.decided < minSample ? ", too few prospects to judge" : ""}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- concerns: stalled vs moved past ---------- */

function Concerns({ concerns, active, onSelect }) {
  if (!concerns.length) return <p className="text-sm text-muted">No concerns tagged at this stage yet.</p>;
  return (
    <div>
      <div className="mb-3 flex gap-5 text-xs text-muted">
        <span className="flex items-center gap-1.5"><i className="h-2 w-4 rounded-full bg-stall" />Stalled here</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-4 rounded-full bg-faint/50" />Moved past</span>
      </div>
      <div className="space-y-1">
        {concerns.map((c) => {
          const ratio = c.over_representation;
          const isActive = active === c.category;
          return (
            <button key={c.category} onClick={() => onSelect(c.category)} aria-pressed={isActive}
              className={`block w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
                isActive ? "bg-helix-soft ring-1 ring-helix" : "hover:bg-well"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-semibold text-ink">{c.label}</span>
                <span className="text-xs text-muted">
                  {ratio != null && ratio >= 1.2 ? `${ratio}× more common among stalled` : "similar in both groups"}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="h-2 rounded-full bg-well"><div className="h-2 rounded-full bg-stall" style={{ width: pct(c.stalled_share) }} /></div>
                <div className="h-2 rounded-full bg-well"><div className="h-2 rounded-full bg-faint/50" style={{ width: pct(c.progressed_share) }} /></div>
              </div>
              <p className="mt-1.5 text-xs tabular text-faint">
                {pct(c.stalled_share)} of stalled ({c.stalled_with}/{c.stalled_total}), {pct(c.progressed_share)} of those who moved past ({c.progressed_with}/{c.progressed_total})
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Quotes({ items }) {
  if (!items.length) return <p className="text-sm text-muted">No quotes for this concern yet.</p>;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((e) => (
        <li key={e.id} className="rounded-xl border-l-[3px] border-stall bg-well px-4 py-3">
          <p className="font-display text-lg leading-snug text-ink">“{e.excerpt}”</p>
          <p className="mt-2 text-xs text-faint">
            Call {e.call_ref}, {e.agent_id || "unassigned"}, {new Date(e.started_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </p>
        </li>
      ))}
    </ul>
  );
}

/* ---------- experiments ---------- */

function Experiment({ r, onStop }) {
  const v = VERDICTS[r.verdict];
  const collected = Math.min(r.treatment.n, r.control.n);
  const progress = Math.min(1, collected / r.needed_per_arm);
  const arms = [["New script", r.treatment, "text-helix"], ["Current script", r.control, "text-ink"]];
  return (
    <article className="rounded-xl border border-line p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-snug">{r.experiment.name.replace("[demo] ", "")}</h3>
          <p className="mt-0.5 text-xs text-muted">At {r.experiment.target_label?.toLowerCase()}, measuring how many move to the next stage</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${v.cls}`}>{v.text}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {arms.map(([label, a, cls]) => (
          <div key={label} className="rounded-xl bg-well p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className={`mt-1 font-display text-3xl font-bold tabular ${cls}`}>{pct(a.rate, 1)}</p>
            <p className="text-xs text-faint tabular">{a.successes} of {a.n} prospects</p>
          </div>
        ))}
      </div>

      {r.test.lift_pts != null && (
        <p className="mt-3 text-sm text-ink">
          Difference: <b className="tabular">{r.test.lift_pts > 0 ? "+" : ""}{r.test.lift_pts} points</b>
          <span className="text-muted"> (likely between {r.test.ci_low_pts} and {r.test.ci_high_pts})</span>
        </p>
      )}

      <div className="mt-4">
        <div className="flex justify-between gap-3 text-xs text-muted">
          <span>Prospects collected per group</span>
          <span className="tabular">{collected} of {r.needed_per_arm} needed</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-well">
          <div className="h-1.5 rounded-full bg-helix" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {r.experiment.status === "running" && (
        <button onClick={() => onStop(r.experiment.id)} className="mt-4 text-xs font-semibold text-muted underline underline-offset-2 hover:text-ink">
          Stop experiment
        </button>
      )}
    </article>
  );
}

/* ---------- page ---------- */

export default function RevenueXRay({ demo = true }) {
  const [range, setRange] = useState({ from: "", to: "" });
  const [data, setData] = useState(null);
  const [experiments, setExperiments] = useState([]);
  const [category, setCategory] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, ex] = await Promise.all([xray.overview(range.from, range.to), xray.experiments()]);
      setData(o);
      setExperiments(ex);
      setCategory(o.concerns[0]?.category ?? null);
      setQuotes(o.evidence);
    } catch (e) {
      setError(`Couldn't load insights. Start the backend on port 8000, then refresh. (${e.message})`);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const selectConcern = async (cat) => {
    setCategory(cat);
    try { setQuotes(await xray.evidence(data.bottleneck.stage_key, cat)); } catch (e) { setError(e.message); }
  };

  const startExperiment = async () => {
    const rec = data.recommendation;
    setStarting(true);
    try {
      await xray.createExperiment({
        name: rec.suggested_name, hypothesis: rec.hypothesis, change_description: rec.action,
        target_stage: rec.target_stage, primary_metric: "progression",
      });
      setExperiments(await xray.experiments());
      setStarted(true);
    } catch (e) {
      setError(`Couldn't start the experiment. (${e.message})`);
    } finally {
      setStarting(false);
    }
  };

  const stopExperiment = async (id) => {
    try {
      await xray.setExperimentStatus(id, "stopped");
      setExperiments(await xray.experiments());
    } catch (e) { setError(e.message); }
  };

  const s = data?.summary;
  const b = data?.bottleneck;
  const rec = data?.recommendation;
  const dateInput = "mt-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-helix focus:outline-none";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl">Insights</h1>
          <p className="mt-3 text-base text-muted">Where prospects stop, what they said, and whether your fixes are working.</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col text-xs text-muted">From
            <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className={dateInput} />
          </label>
          <label className="flex flex-col text-xs text-muted">To
            <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className={dateInput} />
          </label>
        </div>
      </header>

      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <p className="text-sm text-muted">Loading insights…</p>}

      {data && (
        <>
          <Summary s={s} />

          {b && (
            <div className="grid gap-6 lg:grid-cols-5">
              <Panel className="lg:col-span-3">
                <p className="text-sm font-semibold text-stall">Biggest drop-off</p>
                <h2 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">
                  Only {pct(b.progression_rate)} get past the {b.stage_label.toLowerCase()}.
                </h2>
                <p className="mt-3 max-w-xl text-base text-muted">
                  At every other stage, {pct(b.typical_progression_rate)} move on. {num(b.stalled)} prospects stopped here,
                  out of {num(b.decided)} who reached it (likely range {pct(b.progression_ci[0])} to {pct(b.progression_ci[1])}).
                </p>
              </Panel>
              {rec && (
                <Panel tone="deep" className="lg:col-span-2">
                  <p className="text-sm font-semibold text-white/70">What to test next</p>
                  <p className="mt-2 font-display text-xl font-bold leading-snug">{rec.action}</p>
                  <p className="mt-3 text-sm text-white/75">Why: {rec.hypothesis}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Button onClick={startExperiment} disabled={starting || started} variant="quiet">
                      {started ? "Experiment started" : starting ? "Starting…" : "Start this experiment"}
                    </Button>
                    <span className="text-xs text-white/70">{STRENGTH[rec.evidence_strength]}</span>
                  </div>
                </Panel>
              )}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-5">
            <Panel title="Funnel" note="How many prospects reached each stage." className="lg:col-span-2">
              <Funnel stages={data.funnel} bottleneckKey={b?.stage_key} minSample={data.min_sample} />
            </Panel>
            <Panel className="lg:col-span-3"
              title={b ? `Why they stop at the ${b.stage_label.toLowerCase()}` : "Concerns"}
              note="A concern that's much more common among stalled prospects is worth testing. Pick one to read the quotes.">
              <Concerns concerns={data.concerns} active={category} onSelect={selectConcern} />
            </Panel>
          </div>

          {b && (
            <Panel title="What prospects said" note="From calls that stalled at this stage. Phone numbers and emails are removed.">
              <Quotes items={quotes} />
            </Panel>
          )}

          <Panel title="Experiments" note="Prospects are split into two groups automatically, so the comparison is fair.">
            {experiments.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {experiments.map((r) => <Experiment key={r.experiment.id} r={r} onStop={stopExperiment} />)}
              </div>
            ) : (
              <p className="text-sm text-muted">No experiments yet. Start the one suggested above.</p>
            )}
          </Panel>

          <p className="text-center text-xs text-faint">
            {demo
              ? "All figures are fictional demo data, not real company results."
              : "These are patterns to test, not proof of cause."}
          </p>
        </>
      )}
    </div>
  );
}
