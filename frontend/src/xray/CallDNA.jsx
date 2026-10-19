import { useCallback, useEffect, useState } from "react";
import { xray } from "./api";
import DNAStrand, { CONCERN_COLORS, CONCERN_LABELS, STRATEGY_COLORS, StrandKey } from "./DNAStrand";
import GelLanes from "./GelLanes";
import { Button, ErrorNote, OutcomeTag, Panel, pct, Swatch } from "./ui";

const SUGGESTIONS = [
  { stage: "fees", text: "Sir, the fee is too expensive for me right now." },
  { stage: "fees", text: "Is there any EMI or discount available?" },
  { stage: "placement", text: "Which companies actually hired from your last batch?" },
  { stage: "course_pitch", text: "The syllabus looks too basic for me." },
];

/* ---------- where the call is right now ---------- */

function StageTrack({ stages, value, onChange }) {
  const current = stages.find((s) => s.key === value)?.seq ?? 1;
  return (
    <div role="radiogroup" aria-label="Current stage of the call" className="-mx-1 overflow-x-auto pb-1">
      <ol className="flex min-w-[34rem] items-start px-1">
        {stages.map((s, i) => {
          const active = s.key === value;
          const passed = s.seq < current;
          return (
            <li key={s.key} className={`flex items-start ${i > 0 ? "flex-1" : ""}`}>
              {i > 0 && <span className={`mt-4 h-0.5 min-w-3 flex-1 ${s.seq <= current ? "bg-ink" : "bg-line"}`} />}
              <button
                role="radio"
                aria-checked={active}
                onClick={() => onChange(s.key)}
                className="group flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5 text-center"
              >
                <span className={`grid h-8 w-8 place-items-center rounded-full border-2 text-sm font-bold tabular transition-colors ${
                  active ? "border-helix bg-helix text-white"
                    : passed ? "border-ink bg-ink text-white"
                    : "border-line bg-surface text-faint group-hover:border-faint"
                }`}>
                  {s.seq}
                </span>
                <span className={`text-xs leading-tight ${active ? "font-semibold text-ink" : "text-muted"}`}>{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------- one past call, compact ---------- */

function FingerprintRow({ fp, onOpen, selected, compact = false }) {
  if (compact) {
    return (
      <button onClick={() => onOpen?.(fp.call_id)} aria-pressed={selected}
        className={`flex w-full items-center gap-3 rounded-xl border bg-surface p-2.5 text-left transition-colors ${
          selected ? "border-helix ring-1 ring-helix" : "border-line hover:border-faint"}`}>
        <div className="w-28 shrink-0">
          <DNAStrand size="sm" turningSeq={fp.turning_seq} maxSeq={fp.max_seq}
            concern={fp.concern} strategy={fp.strategy} outcome={fp.outcome} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-ink">{fp.code}</span>
            <OutcomeTag outcome={fp.outcome} />
          </div>
          <p className="mt-1 truncate text-sm text-ink">“{fp.prospect_quote}”</p>
          <p className="truncate text-xs font-semibold" style={{ color: STRATEGY_COLORS[fp.strategy] }}>{fp.strategy_label}</p>
        </div>
      </button>
    );
  }
  return (
    <button
      onClick={() => onOpen?.(fp.call_id)}
      aria-pressed={selected}
      className={`flex w-full flex-col gap-3 rounded-xl border bg-surface p-3 text-left transition-colors sm:flex-row sm:items-center ${
        selected ? "border-helix ring-1 ring-helix" : "border-line hover:border-faint"
      }`}
    >
      <DNAStrand size="sm" turningSeq={fp.turning_seq} maxSeq={fp.max_seq}
        concern={fp.concern} strategy={fp.strategy} outcome={fp.outcome} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold text-ink">{fp.code}</span>
          <OutcomeTag outcome={fp.outcome} />
        </div>
        <p className="mt-1.5 truncate text-sm text-ink">“{fp.prospect_quote}”</p>
        <p className="truncate text-sm text-muted">
          <span className="font-semibold" style={{ color: STRATEGY_COLORS[fp.strategy] }}>{fp.strategy_label}</span>
          {" "}reply: “{fp.caller_response}”
        </p>
        {fp.strategy_n > 0 && (
          <p className="mt-1 text-xs text-faint">
            Replies like this moved forward {pct(fp.strategy_rate)} of the time on {fp.strategy_n} similar calls
          </p>
        )}
      </div>
    </button>
  );
}

/* ---------- "this has happened before" ---------- */

function SeenBefore({ result }) {
  const s = result.suggestion;
  const concern = CONCERN_LABELS[result.concern] || result.concern;
  return (
    <Panel tone="deep" className="settle">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
        <p className="font-display text-6xl font-extrabold leading-none tabular sm:text-7xl">{result.seen_before}</p>
        <p className="max-w-sm pb-1 text-lg leading-snug text-white/85">
          past calls hit a <span className="font-semibold text-white">{concern.toLowerCase()}</span> concern at{" "}
          <span className="font-semibold text-white">{result.stage.label.toLowerCase()}</span>. This has happened before.
        </p>
      </div>

      {s?.use ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white/10 p-4">
            <p className="text-sm text-white/70">Reply that tended to work</p>
            <p className="mt-1 font-display text-2xl font-bold" style={{ color: "#6ee7b7" }}>{s.use.label}</p>
            <p className="mt-1 text-sm text-white/80">{pct(s.use.rate)} moved forward, from {s.use.n} calls</p>
          </div>
          {s.avoid && (
            <div className="rounded-xl bg-white/10 p-4">
              <p className="text-sm text-white/70">Reply that tended to stall</p>
              <p className="mt-1 font-display text-2xl font-bold" style={{ color: "#fca5a5" }}>{s.avoid.label}</p>
              <p className="mt-1 text-sm text-white/80">{pct(s.avoid.rate)} moved forward, from {s.avoid.n} calls</p>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-5 rounded-xl bg-white/10 p-4 text-sm text-white/85">{s?.note}</p>
      )}

      <p className="mt-4 text-xs text-white/60">
        From your own call history. A pattern, not proof: run an experiment on the Insights page to confirm it.
      </p>
    </Panel>
  );
}

/* ---------- live call console ---------- */

function LiveCall({ stages, onOpen, selectedId }) {
  const [stage, setStage] = useState("fees");
  const [text, setText] = useState(SUGGESTIONS[0].text);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (st, t) => {
    if (!t || t.trim().length < 3) {
      setError("Type at least a few words the prospect said.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResult(await xray.dnaMatch(st, t));
    } catch (e) {
      setError(`Couldn't reach the matching service. Check the backend is running. (${e.message})`);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { run("fees", SUGGESTIONS[0].text); }, [run]);

  return (
    <div className="space-y-5">
      <Panel>
        <h2 className="text-lg font-bold">Where is the call now?</h2>
        <div className="mt-4">
          <StageTrack stages={stages.filter((s) => s.key !== "enrolled")} value={stage} onChange={setStage} />
        </div>

        <form className="mt-6" onSubmit={(e) => { e.preventDefault(); run(stage, text); }}>
          <label htmlFor="said" className="text-lg font-bold font-display">What did the prospect just say?</label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <span aria-hidden className="pointer-events-none absolute left-4 top-1 font-display text-5xl leading-none text-helix/30">“</span>
              <input id="said" value={text} onChange={(e) => setText(e.target.value)}
                placeholder="e.g. I need to ask my parents first"
                className="w-full rounded-xl border border-line bg-well py-3.5 pl-11 pr-4 text-base text-ink placeholder:text-faint focus:border-helix focus:bg-surface focus:outline-none" />
            </div>
            <Button type="submit" variant="primary" disabled={busy} className="sm:w-44">
              {busy ? "Searching calls…" : "Find past calls"}
            </Button>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Try:</span>
          {SUGGESTIONS.map((p) => (
            <button key={p.text} onClick={() => { setStage(p.stage); setText(p.text); run(p.stage, p.text); }}
              className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink hover:border-helix hover:text-helix">
              {p.text}
            </button>
          ))}
        </div>
      </Panel>

      <ErrorNote>{error}</ErrorNote>

      {result && (
        <div key={`${result.stage.key}-${result.concern}-${result.seen_before}`} className="space-y-5">
          <SeenBefore result={result} />

          {result.playbook.strategies.length > 0 && (
            <Panel title="How each reply turned out"
              note={`${result.playbook.decided} finished calls with this concern at this stage. The dashed line is the average.`}>
              <GelLanes strategies={result.playbook.strategies} baseline={result.playbook.baseline_rate} />
            </Panel>
          )}

          <Panel title="Past calls like this one" note="The closest match for each kind of reply, best-performing reply first.">
            <div className="space-y-2.5">
              {result.examples.map((fp) => (
                <FingerprintRow key={fp.call_id} fp={fp} onOpen={onOpen} selected={fp.call_id === selectedId} />
              ))}
              {!result.examples.length && (
                <p className="text-sm text-muted">No finished calls match this yet. Matches appear once similar calls have an outcome.</p>
              )}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

/* ---------- end-of-call fingerprint ---------- */

function FingerprintCard({ fp }) {
  if (!fp) return <p className="text-sm text-muted">Pick a call to see its fingerprint.</p>;
  const t = fp.twins;
  const rows = [
    ["Turning point", `Stage ${fp.turning_seq}, ${fp.stage_key.replaceAll("_", " ")}`],
    ["Prospect said", `“${fp.prospect_quote}”`],
    ["Caller replied", `“${fp.caller_response}”`],
    ["Calls with the same fingerprint", t.decided
      ? `${t.progressed} of ${t.decided} moved forward (${pct(t.rate)}, likely range ${pct(t.ci[0])} to ${pct(t.ci[1])})`
      : "None finished yet"],
  ];
  return (
    <div key={fp.call_id}>
      <div className="rounded-xl bg-well px-3 py-5">
        <div className="mx-auto w-fit max-w-full">
          <DNAStrand size="lg" animate showStageNumbers turningSeq={fp.turning_seq} maxSeq={fp.max_seq}
            concern={fp.concern} strategy={fp.strategy} outcome={fp.outcome} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-ink px-2.5 py-1 font-mono text-sm font-bold text-white">{fp.code}</span>
        <OutcomeTag outcome={fp.outcome} />
        <Swatch color={CONCERN_COLORS[fp.concern]}>{CONCERN_LABELS[fp.concern]}</Swatch>
        <Swatch color={STRATEGY_COLORS[fp.strategy]}>{fp.strategy_label}</Swatch>
      </div>
      <dl className="mt-5 space-y-3.5">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-medium text-muted">{k}</dt>
            <dd className="mt-0.5 text-sm text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-faint">Call {fp.call_ref}, handled by {fp.agent_id}</p>
    </div>
  );
}

/* ---------- page ---------- */

export default function CallDNA() {
  const [stages, setStages] = useState([]);
  const [recent, setRecent] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);

  const open = useCallback(async (id) => {
    try { setSelected(await xray.dnaCall(id)); } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [st, rc] = await Promise.all([xray.stages(), xray.dnaRecent(8)]);
        setStages(st);
        setRecent(rc);
        // Open on a finished call, preferring one from the fees stage so it matches the live-call example.
        const first = rc.find((r) => r.concern === "fees" && r.outcome !== "open")
          || rc.find((r) => r.outcome !== "open") || rc[0];
        if (first) open(first.call_id);
      } catch (e) {
        setError(`Couldn't load call data. Start the backend on port 8000, then refresh. (${e.message})`);
      }
    })();
  }, [open]);

  return (
    <div className="space-y-6">
      <header className="max-w-2xl">
        <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl">Call DNA</h1>
        <p className="mt-3 text-base text-muted">
          Every call leaves a fingerprint. When a prospect raises a concern, see how the same moment went on your past calls, and which reply moved them forward.
        </p>
      </header>

      <ErrorNote>{error}</ErrorNote>

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          {stages.length > 0 && <LiveCall stages={stages} onOpen={open} selectedId={selected?.call_id} />}
        </div>
        <aside className="min-w-0 space-y-6 xl:col-span-2">
          <Panel title="Call fingerprint" note="Created automatically when a call ends.">
            <FingerprintCard fp={selected} />
            <div className="mt-5 border-t border-line pt-4"><StrandKey /></div>
          </Panel>
          <Panel title="Recent calls">
            <div className="space-y-2.5">
              {recent.map((fp) => (
                <FingerprintRow key={fp.call_id} fp={fp} onOpen={open} selected={fp.call_id === selected?.call_id} compact />
              ))}
              {!recent.length && !error && <p className="text-sm text-muted">Finished calls will appear here.</p>}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
