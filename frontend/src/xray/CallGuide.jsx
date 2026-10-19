import { useCallback, useEffect, useMemo, useState } from "react";
import { callsApi } from "./api";
import { Button, ErrorNote, Panel } from "./ui";

// The caller's live screen. Open beside the phone; it keeps the call on its structure:
// which stage you're in and what it's for, what prospects tend to say, a tap for what
// happened plus the prospect's own words, then the next stage, then the outcome.

const TONE = {
  good: { idle: "border-go/40 hover:bg-go-soft", on: "border-go bg-go text-white", dot: "bg-go" },
  neutral: { idle: "border-wait/40 hover:bg-wait-soft", on: "border-wait bg-wait text-white", dot: "bg-wait" },
  bad: { idle: "border-stall/40 hover:bg-stall-soft", on: "border-stall bg-stall text-white", dot: "bg-stall" },
};

const OUTCOMES = [
  { key: "enrolled", label: "Enrolled", hint: "Paid or booked a seat", tone: "good" },
  { key: "follow_up", label: "Follow-up booked", hint: "Agreed a date to talk again", tone: "neutral" },
  { key: "not_interested", label: "Not interested", hint: "Said no, or not a fit", tone: "bad" },
];

const storage = {
  get(k) { try { return window.localStorage.getItem(k) || ""; } catch { return ""; } },
  set(k, v) { try { window.localStorage.setItem(k, v); } catch { /* private mode */ } },
};

function useClock(since) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  if (!since) return "0:00";
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* ---------- progress along the call ---------- */

function Progress({ stages, done, currentKey, onJump }) {
  return (
    <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${stages.length + 1}, minmax(0, 1fr))` }}>
      {[...stages, { key: "_outcome", label: "Outcome", seq: stages.length + 1 }].map((s) => {
        const result = done[s.key];
        const current = s.key === currentKey;
        const canJump = Boolean(result) && onJump;
        return (
          <li key={s.key} className="min-w-0">
            <button type="button" disabled={!canJump} onClick={() => canJump && onJump(s.key)}
              className={`w-full text-left ${canJump ? "cursor-pointer" : "cursor-default"}`}
              title={canJump ? `Edit ${s.label}` : s.label}>
              <span className={`block h-1.5 rounded-full ${
                current ? "bg-helix" : result ? TONE[result.tone]?.dot || "bg-ink" : "bg-line"}`} />
              <span className={`mt-1.5 hidden truncate text-xs sm:block ${current ? "font-semibold text-ink" : "text-muted"}`}>
                <span className="tabular">{s.seq}.</span> {s.label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- before the call ---------- */

function StartCall({ onStarted, busy, setBusy, setError }) {
  const [caller, setCaller] = useState(storage.get("callGuide.caller"));
  const [prospect, setProspect] = useState("");

  const start = async (e) => {
    e.preventDefault();
    if (!caller.trim()) return setError("Add your name so the call is saved under you.");
    setBusy(true);
    setError(null);
    try {
      storage.set("callGuide.caller", caller.trim());
      onStarted(await callsApi.start(caller.trim(), prospect.trim()));
    } catch (err) {
      setError(`Couldn't start the call. ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="mx-auto max-w-xl">
      <h2 className="text-2xl font-bold">Start a call</h2>
      <p className="mt-1 text-sm text-muted">Open this beside the phone. It walks you through each stage and saves the call as you go.</p>
      <form onSubmit={start} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold">Your name</span>
          <input value={caller} onChange={(e) => setCaller(e.target.value)} placeholder="e.g. Ananya" autoComplete="name"
            className="mt-1.5 w-full rounded-xl border border-line bg-well px-4 py-3 text-base focus:border-helix focus:bg-surface focus:outline-none" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Prospect <span className="font-normal text-muted">(name or lead ID, optional)</span></span>
          <input value={prospect} onChange={(e) => setProspect(e.target.value)} placeholder="e.g. Lead #2050"
            className="mt-1.5 w-full rounded-xl border border-line bg-well px-4 py-3 text-base focus:border-helix focus:bg-surface focus:outline-none" />
        </label>
        <Button type="submit" disabled={busy} className="w-full py-3 text-base">
          {busy ? "Starting… (the server may take a minute to wake up)" : "Start call"}
        </Button>
      </form>
    </Panel>
  );
}

/* ---------- one stage ---------- */

function StageStep({ stage, index, total, saved, nextLabel, onSave, onEndEarly, busy }) {
  const [result, setResult] = useState(saved?.result || null);
  const [words, setWords] = useState(saved?.prospect_words || "");
  useEffect(() => { setResult(saved?.result || null); setWords(saved?.prospect_words || ""); }, [stage.key, saved]);

  const picked = stage.result_options.find((o) => o.key === result);
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Panel className="lg:col-span-3">
        <p className="text-sm font-semibold text-helix">Stage {index + 1} of {total}</p>
        <h2 className="mt-1 text-4xl font-extrabold leading-tight">{stage.label}</h2>
        <p className="mt-3 text-lg leading-snug text-ink">{stage.purpose}</p>

        <fieldset className="mt-7">
          <legend className="text-base font-bold">What happened?</legend>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            {stage.result_options.map((o) => {
              const on = o.key === result;
              const t = TONE[o.tone] || TONE.neutral;
              return (
                <button key={o.key} type="button" onClick={() => setResult(o.key)} aria-pressed={on}
                  className={`min-h-[64px] rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold transition-colors ${on ? t.on : `bg-surface text-ink ${t.idle}`}`}>
                  {o.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="mt-6 block">
          <span className="text-base font-bold">What the prospect said</span>
          <span className="ml-2 text-sm text-muted">their own words, optional</span>
          <textarea value={words} onChange={(e) => setWords(e.target.value)} rows={3}
            placeholder="e.g. I need to ask my parents before I decide."
            className="mt-2 w-full resize-y rounded-xl border border-line bg-well px-4 py-3 text-base focus:border-helix focus:bg-surface focus:outline-none" />
        </label>

        {picked?.tone === "bad" && (
          <p className="mt-4 rounded-xl bg-stall-soft px-4 py-3 text-sm text-stall">
            Calls often end here. You can go straight to the outcome, or carry on to the next stage.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button onClick={() => onSave(result, words)} disabled={!result || busy} className="px-5 py-3 text-base">
            {busy ? "Saving…" : `Save and go to ${nextLabel}`}
          </Button>
          {picked?.tone === "bad" && (
            <Button variant="quiet" disabled={busy} onClick={() => onSave(result, words, true)}>
              Save and record outcome
            </Button>
          )}
          {!result && <span className="text-sm text-muted">Tap what happened to continue.</span>}
          <button type="button" onClick={onEndEarly} className="ml-auto text-sm font-semibold text-muted underline underline-offset-2 hover:text-ink">
            End call now
          </button>
        </div>
      </Panel>

      <aside className="space-y-6 lg:col-span-2">
        <Panel title="Prospects often say" note="So nothing catches you off guard at this stage.">
          <ul className="space-y-2.5">
            {stage.prospect_lines.map((l) => (
              <li key={l} className="rounded-xl border-l-[3px] border-helix bg-helix-soft/60 px-4 py-2.5 text-[15px] leading-snug text-ink">“{l}”</li>
            ))}
          </ul>
          {stage.heard_on_past_calls.length > 0 && (
            <>
              <p className="mt-5 text-sm font-semibold text-ink">Heard most on your past calls</p>
              <ul className="mt-2 space-y-2">
                {stage.heard_on_past_calls.map((h) => (
                  <li key={h.text} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-ink">“{h.text}”</span>
                    <span className="shrink-0 tabular text-xs text-faint">{h.times}×</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </aside>
    </div>
  );
}

/* ---------- outcome ---------- */

function OutcomeStep({ onClose, busy, reachedLabel }) {
  const [outcome, setOutcome] = useState(null);
  const [notes, setNotes] = useState("");
  return (
    <Panel className="mx-auto max-w-2xl">
      <p className="text-sm font-semibold text-helix">Last step</p>
      <h2 className="mt-1 text-4xl font-extrabold">How did the call end?</h2>
      {reachedLabel && <p className="mt-2 text-base text-muted">The call reached {reachedLabel.toLowerCase()}.</p>}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {OUTCOMES.map((o) => {
          const on = o.key === outcome;
          const t = TONE[o.tone];
          return (
            <button key={o.key} type="button" onClick={() => setOutcome(o.key)} aria-pressed={on}
              className={`rounded-xl border-2 px-4 py-4 text-left transition-colors ${on ? t.on : `bg-surface ${t.idle}`}`}>
              <span className="block text-base font-bold">{o.label}</span>
              <span className={`mt-0.5 block text-xs ${on ? "text-white/85" : "text-muted"}`}>{o.hint}</span>
            </button>
          );
        })}
      </div>
      <label className="mt-6 block">
        <span className="text-base font-bold">Notes</span>
        <span className="ml-2 text-sm text-muted">optional, e.g. follow-up date</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          className="mt-2 w-full rounded-xl border border-line bg-well px-4 py-3 text-base focus:border-helix focus:bg-surface focus:outline-none" />
      </label>
      <Button onClick={() => onClose(outcome, notes)} disabled={!outcome || busy} className="mt-6 w-full py-3 text-base">
        {busy ? "Saving…" : "Save call"}
      </Button>
    </Panel>
  );
}

function Saved({ call, onNew, onPast }) {
  return (
    <Panel className="settle mx-auto max-w-xl text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-go text-white">
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <h2 className="mt-4 text-3xl font-extrabold">Call saved</h2>
      <p className="mt-2 text-base text-muted">
        {call.prospect_name || "Prospect"}: reached {call.reached_label?.toLowerCase() || "no stage"}, {call.outcome_label?.toLowerCase()}.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={onNew}>Start next call</Button>
        <Button variant="quiet" onClick={onPast}>See past calls</Button>
      </div>
    </Panel>
  );
}

/* ---------- page ---------- */

export default function CallGuide({ onShowPast }) {
  const [stages, setStages] = useState([]);
  const [call, setCall] = useState(null);
  const [stepKey, setStepKey] = useState(null); // a stage key, "_outcome" or "_saved"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const clock = useClock(call && stepKey !== "_saved" ? call.started_at : null);

  useEffect(() => {
    (async () => {
      try { setStages(await callsApi.guide()); }
      catch (e) { setError(`Couldn't load the call guide. Check the backend is running, then refresh. (${e.message})`); }
      finally { setLoading(false); }
    })();
  }, []);

  const done = useMemo(() => {
    const map = {};
    (call?.stages || []).forEach((s) => { map[s.stage_key] = s; });
    if (call?.outcome) map._outcome = { tone: OUTCOMES.find((o) => o.key === call.outcome)?.tone };
    return map;
  }, [call]);

  const index = stages.findIndex((s) => s.key === stepKey);
  const stage = stages[index];

  const save = useCallback(async (result, words, jumpToOutcome = false) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await callsApi.saveStage(call.id, stage.key, result, words);
      setCall(updated);
      const next = stages[index + 1];
      setStepKey(jumpToOutcome || !next ? "_outcome" : next.key);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(`Couldn't save this stage. Nothing was lost: try again. (${e.message})`);
    } finally {
      setBusy(false);
    }
  }, [call, stage, stages, index]);

  const close = async (outcome, notes) => {
    setBusy(true);
    setError(null);
    try {
      setCall(await callsApi.close(call.id, outcome, notes));
      setStepKey("_saved");
    } catch (e) {
      setError(`Couldn't save the call. Try again. (${e.message})`);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setCall(null); setStepKey(null); setError(null); };

  return (
    <div className="space-y-6">
      {call && stepKey !== "_saved" ? (
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink px-5 py-3.5 text-white">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-go opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-go" />
            </span>
            <span className="font-semibold">On call{call.prospect_name ? ` with ${call.prospect_name}` : ""}</span>
            <span className="tabular text-white/70">{clock}</span>
          </div>
          <span className="text-sm text-white/70">Saved as you go, by {call.caller_name}</span>
        </header>
      ) : (
        <header className="max-w-2xl">
          <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl">Call guide</h1>
          <p className="mt-3 text-base text-muted">Stay on the structure of the call: each stage, what it's for, what prospects tend to say, and what happened.</p>
        </header>
      )}

      <ErrorNote>{error}</ErrorNote>
      {loading && <p className="text-sm text-muted">Loading the call guide… if the server was asleep this can take up to a minute.</p>}

      {!loading && stages.length > 0 && (
        <>
          {call && stepKey !== "_saved" && (
            <Progress stages={stages} done={done} currentKey={stepKey}
              onJump={(k) => k !== "_outcome" && setStepKey(k)} />
          )}

          {!call && <StartCall busy={busy} setBusy={setBusy} setError={setError}
            onStarted={(c) => { setCall(c); setStepKey(stages[0].key); }} />}

          {call && stage && (
            <StageStep key={stage.key} stage={stage} index={index} total={stages.length}
              saved={done[stage.key]} busy={busy}
              nextLabel={stages[index + 1]?.label.toLowerCase() || "the outcome"}
              onSave={save} onEndEarly={() => setStepKey("_outcome")} />
          )}

          {call && stepKey === "_outcome" && <OutcomeStep busy={busy} onClose={close} reachedLabel={call.reached_label} />}

          {call && stepKey === "_saved" && <Saved call={call} onNew={reset} onPast={onShowPast} />}
        </>
      )}
    </div>
  );
}
