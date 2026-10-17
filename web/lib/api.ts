import type { Case, CaseEvent, CaseWithEvents, CreateCaseBody, ApprovalBody } from "./types";

/** Empty => use the built-in mock route handlers (same origin). Set NEXT_PUBLIC_API_BASE=http://localhost:8000 for the real backend. */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");
export const IS_MOCK = API_BASE === "";

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => "")}`);
  return r.json() as Promise<T>;
}

export const api = {
  listCases: () => j<Case[]>("/api/cases"),
  getCase: (id: string) => j<CaseWithEvents>(`/api/cases/${encodeURIComponent(id)}`),
  createCase: (b: CreateCaseBody) => j<Case>("/api/cases", { method: "POST", body: JSON.stringify(b) }),
  decide: (id: string, b: ApprovalBody) => j<CaseEvent>(`/api/cases/${encodeURIComponent(id)}/approvals`, { method: "POST", body: JSON.stringify(b) }),
  streamUrl: () => `${API_BASE}/api/stream`,
};
