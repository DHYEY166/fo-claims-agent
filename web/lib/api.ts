import type { Case, CaseEvent, CaseWithEvents, CreateCaseBody, ApprovalBody, AuditResponse } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Empty => use the built-in mock route handlers (same origin). Set NEXT_PUBLIC_API_BASE=http://localhost:8000 for the real backend. */
/** Public demo build (Vercel). Forces the built-in mock layer so no request can reach a real agent. */
export const DEMO_DEPLOY = ["1", "true", "on"].includes((process.env.NEXT_PUBLIC_DEMO_DEPLOY ?? "").toLowerCase());
export const API_BASE = DEMO_DEPLOY ? "" : (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");
export const IS_MOCK = API_BASE === "";

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!r.ok) {
    const raw = await r.text().catch(() => "");
    let msg = raw;
    try { const b = JSON.parse(raw); msg = b.error ?? b.detail ?? raw; if (typeof msg !== "string") msg = JSON.stringify(msg); } catch { /* not JSON */ }
    throw new ApiError(r.status, msg || r.statusText);
  }
  return r.json() as Promise<T>;
}

export const api = {
  listCases: () => j<Case[]>("/api/cases"),
  getCase: (id: string) => j<CaseWithEvents>(`/api/cases/${encodeURIComponent(id)}`),
  createCase: (b: CreateCaseBody) => j<Case>("/api/cases", { method: "POST", body: JSON.stringify(b) }),
  decide: (id: string, b: ApprovalBody) => j<CaseEvent>(`/api/cases/${encodeURIComponent(id)}/approvals`, { method: "POST", body: JSON.stringify(b) }),
  audit: () => j<AuditResponse>("/api/audit"),
  streamUrl: () => `${API_BASE}/api/stream`,
};
