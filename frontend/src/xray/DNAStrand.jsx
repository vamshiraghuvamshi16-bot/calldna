// The Decision Fingerprint, drawn as a double helix with one rung per sales stage.
//   dark rung      a stage the prospect reached
//   faint rung     a stage never reached
//   thick rung     the turning point: top half = the prospect's concern, bottom half = the caller's reply
//   end cap        the outcome (green progressed, red stalled, grey still open)

export const CONCERN_COLORS = {
  fees: "#e08a1e", placement: "#3d6fd9", parental_approval: "#9b4fd1", timing: "#2398b8",
  course_fit: "#2e9e8f", trust: "#b8960f", competitor: "#d6457e", other: "#8a969c",
};
export const STRATEGY_COLORS = {
  outcomes_first: "#138a63", emi_offer: "#1f8fb3", discount: "#c98a12",
  parent_call: "#7c5bd6", defer: "#d2412f", reassure: "#6b7780",
};
export const OUTCOME_COLORS = { progressed: "#138a63", stalled: "#d2412f", open: "#a3adb2" };
export const CONCERN_LABELS = {
  fees: "Fees", placement: "Placements", parental_approval: "Parents' approval", timing: "Timing",
  course_fit: "Course fit", trust: "Trust", competitor: "Competitors", other: "Other",
};

const SIZES = { sm: [148, 34], md: [260, 60], lg: [440, 104] };

export default function DNAStrand({
  stages = 7, turningSeq, maxSeq, concern, strategy, outcome,
  size = "md", animate = false, showStageNumbers = false, title,
}) {
  const [W, H0] = SIZES[size];
  const labelSpace = showStageNumbers ? 18 : 0;
  const H = H0 + labelSpace;
  const cy = H0 / 2;
  const A = H0 * 0.36;
  const padX = H0 * 0.35;
  const capR = H0 * 0.16;
  const gap = (W - padX - capR * 2 - H0 * 0.3 - padX * 0.4) / (stages - 1);
  const xs = Array.from({ length: stages }, (_, i) => padX + i * gap);
  const endX = W - capR - 2;

  // Rungs sit on the helix peaks, so each rung is full length and the strands cross between them.
  const yTop = (x) => cy - A * Math.cos(((x - padX) / gap) * Math.PI);
  const strand = (sign) => {
    const pts = [];
    for (let x = padX - gap * 0.4; x <= xs[stages - 1] + gap * 0.4; x += 2) {
      const y = sign > 0 ? yTop(x) : 2 * cy - yTop(x);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return `M${pts.join(" L")}`;
  };

  const w = Math.max(1.6, H0 / 24);
  const cColor = CONCERN_COLORS[concern] || CONCERN_COLORS.other;
  const sColor = STRATEGY_COLORS[strategy] || STRATEGY_COLORS.reassure;
  const oColor = OUTCOME_COLORS[outcome] || OUTCOME_COLORS.open;
  const anim = (i) => (animate ? { className: "rung-in", style: { "--i": i } } : {});

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" className="block h-auto max-w-full">
      <title>
        {title || `Turning point at stage ${turningSeq}: ${CONCERN_LABELS[concern] || concern} concern, answered with ${strategy}. Outcome: ${outcome}.`}
      </title>
      <path d={strand(1)} fill="none" stroke="#c9d1cd" strokeWidth={w} strokeLinecap="round" />
      <path d={strand(-1)} fill="none" stroke="#c9d1cd" strokeWidth={w} strokeLinecap="round" />

      {xs.map((x, i) => {
        const seq = i + 1;
        const a = yTop(x), b = 2 * cy - a;
        const top = Math.min(a, b), bottom = Math.max(a, b);
        const reached = seq <= maxSeq;
        return (
          <g key={seq} {...anim(i)}>
            {seq === turningSeq ? (
              <>
                <line x1={x} y1={top} x2={x} y2={cy} stroke={cColor} strokeWidth={w * 2.8} strokeLinecap="round" />
                <line x1={x} y1={cy} x2={x} y2={bottom} stroke={sColor} strokeWidth={w * 2.8} strokeLinecap="round" />
                <circle cx={x} cy={cy} r={w * 1.9} fill="#fff" stroke="#16202a" strokeWidth={w * 0.8} />
              </>
            ) : (
              <line x1={x} y1={top} x2={x} y2={bottom}
                stroke={reached ? "#3b4852" : "#dfe5e2"} strokeWidth={w * 1.25}
                strokeDasharray={reached ? undefined : `${w * 1.4} ${w * 1.4}`} strokeLinecap="round" />
            )}
            {showStageNumbers && (
              <text x={x} y={H - 3} textAnchor="middle" fontSize="11"
                fontWeight={seq === turningSeq ? 700 : 500}
                fill={seq === turningSeq ? "#16202a" : "#8a969c"}
                style={{ fontFamily: "var(--font-sans)" }}>
                {seq}
              </text>
            )}
          </g>
        );
      })}

      <g {...anim(stages)}>
        <circle cx={endX} cy={cy} r={capR} fill={oColor} />
        {outcome === "progressed" && (
          <path d={`M${endX - capR * 0.42},${cy} l${capR * 0.3},${capR * 0.3} l${capR * 0.55},-${capR * 0.6}`}
            fill="none" stroke="#fff" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {outcome === "stalled" && (
          <path d={`M${endX - capR * 0.36},${cy - capR * 0.36} l${capR * 0.72},${capR * 0.72} M${endX + capR * 0.36},${cy - capR * 0.36} l-${capR * 0.72},${capR * 0.72}`}
            stroke="#fff" strokeWidth={w} strokeLinecap="round" />
        )}
      </g>
    </svg>
  );
}

// How to read a strand. Shown once per page, near the first big strand.
export function StrandKey() {
  const item = (swatch, text) => (
    <li className="flex items-center gap-2">
      {swatch}
      <span>{text}</span>
    </li>
  );
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted sm:grid-cols-3">
      {item(<i className="h-3.5 w-1 rounded bg-[#3b4852]" />, "Stage reached")}
      {item(<i className="h-3.5 w-1 rounded bg-[#dfe5e2]" />, "Not reached")}
      {item(<i className="h-3.5 w-1.5 rounded-t" style={{ background: CONCERN_COLORS.fees }} />, "Concern raised")}
      {item(<i className="h-3.5 w-1.5 rounded-b" style={{ background: STRATEGY_COLORS.outcomes_first }} />, "Caller's reply")}
      {item(<i className="h-3 w-3 rounded-full bg-go" />, "Moved forward")}
      {item(<i className="h-3 w-3 rounded-full bg-stall" />, "Stalled")}
    </ul>
  );
}
