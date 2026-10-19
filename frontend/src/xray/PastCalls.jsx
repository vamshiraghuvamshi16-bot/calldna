import { useCallback, useEffect, useState } from "react";
import { callsApi } from "./api";
import { Button, ErrorNote, Panel } from "./ui";

// Every call saved from the Call guide, with the stage each one reached.

const FILTERS = [
  { key: "", label: "All calls" },
  { key: "enrolled", label: "Enrolled" },
  { key: "follow_up", label: "Follow-up booked" },
  { key: "not_interested", label: "Not interested" },
];
const OUTCOME_TAG = {
  enrolled: "bg-go-soft text-go",
  follow_up: "bg-wait-soft text-wait",
  not_interested: "bg-stall-soft text-stall",
};
const TONE_DOT = { good: "bg-go", neutral: "bg-wait", bad: "bg-stall" };
const TOTAL_STAGES = 6;

const when = (iso) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const mins = (sec) => (sec == null ? "" : sec < 60 ? `${sec}s` : `${Math.round(sec / 60)} min`);

function StageReached({ reached, outcome }) {
  const color = outcome === "enrolled" ? "bg-go" : outcome === "not_interested" ? "bg-stall" : "bg-ink";
  return (
    <div className="flex gap-1" aria-hidden>
      {Array.from({ length: TOTAL_STAGES }, (_, i) => (
        <span key={i} className={`h-2 w-5 rounded-full ${i < (reached || 0) ? color : "bg-line"}`} />
      ))}
    </div>
  );
}

function CallDetail({ id }) {
  const [call, setCall] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    callsApi.get(id).then(setCall).catch((e) => setError(e.message));
  }, [id]);
  if (error) return <p className="px-5 pb-5 text-sm text-stall">Couldn't load this call. ({error})</p>;
  if (!call) return <p className="px-5 pb-5 text-sm text-muted">Loading…</p>;
  return (
    <div className="border-t border-line bg-well px-5 py-4">
      <ol className="space-y-3">
        {call.stages.map((s) => (
          <li key={s.stage_key} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3">
            <span className={`mt-1 grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold text-white ${TONE_DOT[s.tone] || "bg-ink"}`}>{s.seq}</span>
            <div className="min-w-0">
              <p className="text-sm"><span className="font-semibold">{s.label}</span><span className="text-muted">: {s.result_label}</span></p>
              {s.prospect_words && <p className="mt-0.5 text-sm text-ink">“{s.prospect_words}”</p>}
            </div>
          </li>
        ))}
        {!call.stages.length && <li className="text-sm text-muted">No stages were recorded on this call.</li>}
      </ol>
      {call.notes && <p className="mt-4 text-sm"><span className="font-semibold">Notes:</span> {call.notes}</p>}
    </div>
  );
}

export default function PastCalls({ onNewCall }) {
  const [filter, setFilter] = useState("");
  const [calls, setCalls] = useState([]);
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setCalls(await callsApi.list(filter)); }
    catch (e) { setError(`Couldn't load past calls. Check the backend is running, then refresh. (${e.message})`); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl">Past calls</h1>
          <p className="mt-3 text-base text-muted">Every call saved from the call guide, and how far each one got.</p>
        </div>
        <Button onClick={onNewCall}>Start a call</Button>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by outcome">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => { setFilter(f.key); setOpen(null); }}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              filter === f.key ? "bg-ink text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}>
            {f.label}
          </button>
        ))}
      </div>

      <ErrorNote>{error}</ErrorNote>

      <Panel className="!p-0 overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-4 border-b border-line px-5 py-3 text-xs font-semibold text-muted md:grid">
          <span>Prospect</span><span>Caller</span><span>Stage reached</span><span className="w-32 text-right">Outcome</span>
        </div>
        {loading && <p className="px-5 py-6 text-sm text-muted">Loading calls… if the server was asleep this can take up to a minute.</p>}
        {!loading && !calls.length && !error && (
          <div className="px-5 py-10 text-center">
            <p className="text-base font-semibold">No calls here yet.</p>
            <p className="mt-1 text-sm text-muted">Calls appear here as soon as you save one from the call guide.</p>
          </div>
        )}
        <ul>
          {calls.map((c) => {
            const isOpen = open === c.id;
            return (
              <li key={c.id} className="border-b border-line last:border-0">
                <button onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen}
                  className="grid w-full grid-cols-1 gap-2 px-5 py-4 text-left transition-colors hover:bg-well md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto] md:items-center md:gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.prospect_name || "Unnamed prospect"}</p>
                    <p className="text-xs text-faint">{when(c.started_at)}{c.duration_sec != null ? `, ${mins(c.duration_sec)}` : ""}</p>
                  </div>
                  <p className="truncate text-sm text-muted"><span className="md:hidden">Caller: </span>{c.caller_name || "Unknown"}</p>
                  <div className="min-w-0">
                    <StageReached reached={c.reached_seq} outcome={c.outcome} />
                    <p className="mt-1 truncate text-xs text-muted">
                      {c.reached_label ? `${c.reached_seq}. ${c.reached_label}` : "No stage recorded"}
                    </p>
                  </div>
                  <div className="md:w-32 md:text-right">
                    {c.status === "in_progress"
                      ? <span className="rounded-full bg-helix-soft px-2.5 py-1 text-xs font-semibold text-helix">In progress</span>
                      : <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${OUTCOME_TAG[c.outcome] || "bg-well text-muted"}`}>{c.outcome_label || "No outcome"}</span>}
                  </div>
                </button>
                {isOpen && <CallDetail id={c.id} />}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
