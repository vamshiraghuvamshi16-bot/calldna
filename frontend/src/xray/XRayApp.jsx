import { useState } from "react";
import CallDNA from "./CallDNA";
import CallGuide from "./CallGuide";
import PastCalls from "./PastCalls";
import RevenueXRay from "./RevenueXRay";

// App shell: a slim sidebar on desktop, a top bar on phones.
// Already have a router? Mount <CallDNA /> and <RevenueXRay /> on their own routes instead.

function Mark({ className = "" }) {
  // A tiny three-rung helix: the product's mark.
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M6 4 C 26 12, 6 20, 26 28" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M26 4 C 6 12, 26 20, 6 28" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" opacity=".45" />
      <line x1="9" y1="9.5" x2="23" y2="9.5" stroke="#e08a1e" strokeWidth="2.6" strokeLinecap="round" />
      <line x1="11" y1="16" x2="21" y2="16" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <line x1="9" y1="22.5" x2="23" y2="22.5" stroke="#138a63" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

// The first two pages are the call tool itself; the last two learn from the saved calls.
const PAGES = [
  { key: "call", label: "Call guide", short: "Call", hint: "Use during a call" },
  { key: "past", label: "Past calls", short: "Past", hint: "Saved calls and stage reached" },
  { key: "dna", label: "Call DNA", short: "DNA", hint: "What happened before" },
  { key: "xray", label: "Insights", short: "Insights", hint: "Revenue X-Ray" },
];

export default function XRayApp({ demo = true }) {
  const [page, setPage] = useState("call");

  const nav = (layout) =>
    PAGES.map((p) => {
      const active = page === p.key;
      return (
        <button key={p.key} onClick={() => setPage(p.key)} aria-current={active ? "page" : undefined}
          className={layout === "side"
            ? `flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition-colors ${active ? "bg-surface shadow-[0_1px_0_#d5dcd8]" : "hover:bg-surface/60"}`
            : `rounded-lg px-3 py-1.5 text-sm font-semibold ${active ? "bg-ink text-white" : "text-muted"}`}>
          {layout === "side" ? (
            <>
              <span className={`text-sm font-semibold ${active ? "text-ink" : "text-muted"}`}>{p.label}</span>
              <span className="text-xs text-faint">{p.hint}</span>
            </>
          ) : p.short}
        </button>
      );
    });

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line px-4 py-6 lg:flex">
        <div className="flex items-center gap-2.5 px-2 text-helix">
          <Mark className="h-8 w-8" />
          <span className="font-display text-xl font-extrabold tracking-tight text-ink">Call DNA</span>
        </div>
        <nav className="mt-8 space-y-1" aria-label="Pages">
          {nav("side").slice(0, 2)}
          <p className="px-3 pb-1 pt-5 text-xs font-medium text-faint">Learning from calls</p>
          {nav("side").slice(2)}
        </nav>
        {demo && (
          <p className="mt-auto rounded-xl border border-dashed border-line px-3 py-2.5 text-xs leading-relaxed text-muted">
            Call DNA and Insights show demo data: 1,000 fictional prospects from an education company.
          </p>
        )}
      </aside>

      {/* phone / tablet top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2 text-helix">
          <Mark className="h-7 w-7" />
          <span className="hidden font-display text-lg font-extrabold text-ink sm:inline">Call DNA</span>
        </div>
        <nav className="-mr-2 flex gap-1 overflow-x-auto pr-2" aria-label="Pages">{nav("top")}</nav>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 lg:py-10">
        {page === "call" && <CallGuide onShowPast={() => setPage("past")} />}
        {page === "past" && <PastCalls onNewCall={() => setPage("call")} />}
        {page === "dna" && <CallDNA />}
        {page === "xray" && <RevenueXRay demo={demo} />}
      </main>
    </div>
  );
}
