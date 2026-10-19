// Revenue X-Ray API client. Set VITE_XRAY_API_URL on Vercel to your Render backend URL.
const BASE = import.meta.env.VITE_XRAY_API_URL || "http://localhost:8000";
const KEY = import.meta.env.VITE_XRAY_API_KEY; // optional; matches XRAY_API_KEY on the backend

async function request(path, options = {}, prefix = "/xray") {
  const res = await fetch(`${BASE}${prefix}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(KEY ? { "X-API-Key": KEY } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    let detail = await res.text();
    try { detail = JSON.parse(detail).detail ?? detail; } catch { /* plain text */ }
    throw new Error(typeof detail === "string" ? detail : `Request failed (${res.status})`);
  }
  return res.json();
}

const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) }, "");

// Call guide: the caller's live screen
export const callsApi = {
  health: () => request("/health", {}, ""),
  guide: () => request("/calls/guide", {}, ""),
  start: (callerName, prospectName) => post("/calls", { caller_name: callerName, prospect_name: prospectName || null }),
  saveStage: (callId, stageKey, result, prospectWords) =>
    post(`/calls/${callId}/stages`, { stage_key: stageKey, result, prospect_words: prospectWords || null }),
  close: (callId, outcome, notes) => post(`/calls/${callId}/close`, { outcome, notes: notes || null }),
  list: (outcome) => request(`/calls${outcome ? `?outcome=${outcome}` : ""}`, {}, ""),
  get: (callId) => request(`/calls/${callId}`, {}, ""),
};

const qs = (params) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  return q.toString() ? `?${q}` : "";
};

export const xray = {
  overview: (dateFrom, dateTo) => request(`/overview${qs({ date_from: dateFrom, date_to: dateTo })}`),
  evidence: (stage, category) => request(`/stages/${stage}/evidence${qs({ category })}`),
  experiments: () => request("/experiments"),
  createExperiment: (body) => request("/experiments", { method: "POST", body: JSON.stringify(body) }),
  setExperimentStatus: (id, status) =>
    request(`/experiments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),

  // CALL DNA
  stages: () => request("/stages"),
  dnaMatch: (stageKey, utterance, k = 5) =>
    request("/dna/match", { method: "POST", body: JSON.stringify({ stage_key: stageKey, utterance, k }) }),
  dnaCall: (callId) => request(`/dna/calls/${callId}`),
  dnaRecent: (limit = 12) => request(`/dna/recent?limit=${limit}`),
};
