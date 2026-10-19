// Small shared building blocks. Kept deliberately plain so the strand and the gel chart stand out.

export const pct = (v, digits = 0) => (v == null ? "n/a" : `${(v * 100).toFixed(digits)}%`);
export const num = (v) => (v == null ? "n/a" : Number(v).toLocaleString("en-IN"));
export const inr = (v) =>
  v == null ? "n/a" : Number(v).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function Panel({ title, note, action, children, className = "", tone = "plain" }) {
  const tones = {
    plain: "bg-surface border-line",
    well: "bg-well border-line",
    deep: "bg-helix-deep border-helix-deep text-white",
  };
  return (
    <section className={`rounded-2xl border p-5 sm:p-6 ${tones[tone]} ${className}`}>
      {(title || action) && (
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            {title && <h2 className="text-lg font-bold leading-tight">{title}</h2>}
            {note && <p className={`mt-1 text-sm ${tone === "deep" ? "text-white/70" : "text-muted"}`}>{note}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

const OUTCOME = {
  progressed: { text: "Progressed", cls: "bg-go-soft text-go" },
  stalled: { text: "Stalled", cls: "bg-stall-soft text-stall" },
  open: { text: "Still open", cls: "bg-well text-muted" },
};

export function OutcomeTag({ outcome }) {
  const o = OUTCOME[outcome] || OUTCOME.open;
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${o.cls}`}>{o.text}</span>;
}

export function Swatch({ color, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-ink">
      <i className="h-2 w-2 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-xl border border-stall/30 bg-stall-soft px-4 py-3 text-sm text-stall">
      {children}
    </div>
  );
}

export function Button({ children, variant = "primary", className = "", ...props }) {
  const v = {
    primary: "bg-helix text-white hover:bg-helix-deep",
    dark: "bg-ink text-white hover:bg-helix-deep",
    quiet: "border border-line bg-surface text-ink hover:border-faint",
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${v[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
