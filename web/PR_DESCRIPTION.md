# feature/web-dashboard → main: GSD Claims Agent web dashboard

## What
A Next.js 15 (App Router, TypeScript, Tailwind) dashboard in `web/` for the claims agent built on Fo:
- **Submit a claim** (Paste / Upload filenames / Forward), **case list** with live status, **case timeline**
  with an **Approve before action** card, and a hash-chained **Audit log** page.
- **Live updates** over SSE (`/api/stream`), falling back to 3 s polling.
- **Two modes behind one switch:** with `NEXT_PUBLIC_API_BASE` unset, an in-memory mock API + simulator
  (header badge **MOCK DATA**). With `NEXT_PUBLIC_API_BASE=http://localhost:8000`, it talks to `feature/api` (header badge `API localhost:8000`).
- **Demo-safety display rules:** email only (`NEXT_PUBLIC_DEMO_HIDE_CALLS`, on by default, hides call steps).
  Every outbound recipient shows as "test bank inbox". Simulated steps (`mock: true` or a `[MOCK]` title) get an amber **MOCK** badge.
- **Observability:** a collapsed per-step **trace** row (agent · duration · tokens · model · prompt id), red on errors and amber on grounding problems.
  Evidence fields show present/absent/ambiguous dots, and you can click to see the citation.
- Contract: `web/API_CONTRACT.md`. Run/config/limits: `web/README.md`.

## Why
The 2-minute judged demo needs to show (1) live progress, (2) "trust by design": nothing is sent until a human approves exactly what Fo will do,
and every step is auditable, and (3) honesty about what is simulated. Team decisions folded in: email-only contacts, test stand-in recipients only,
and the trace record per event (FDE — Observability and tracing — trace record per step).

## Look hardest at
1. `web/lib/demo.ts`: recipient masking is **display-only and pattern-based** (any non-sender address → "test bank inbox").
   If the backend ever sends an address in a field we don't pass through `maskEmails`/`maskAddress`, it would show. Fields covered: approval
   To/message/headline/detail, email From/To/Cc/Subject/Body, event title/detail, transcripts, evidence values/citations, trace JSON, audit details, case title/counterparty.
2. `web/app/cases/[id]/page.tsx` `ApprovalCard`: buttons disable on first click, and a 409 shows "Already decided" and refetches. Is that the right UX for double-approve?
3. `DEMO_HIDE_CALLS` hides call events from the **timeline only**. The audit log still shows every row the backend records (by design, so the audit is never filtered).
4. `web/lib/mockStore.ts` is demo-only state kept in a process global (`globalThis.__gsdStore`). It resets on restart, which is fine for a demo but not durable.

## How tested (verified by me)
- `npm run check` → `eslint .` 0 problems; `tsc --noEmit` 0 errors.
- Headless Chrome (Playwright) at 1280×800, **mock mode**: `node scripts/screenshots.mjs`. Seeded cases render; submit → classified → evidence →
  approval card; approve → email → reply → follow-up → resolved; prompt-injection text escalates with nothing sent.
- **Live mode** against `feature/api` 76039ad on :8000: `node scripts/live-check.mjs`. Paste a card dispute → approval card (email, To "test bank inbox",
  $0.00 spend) → Approve → events stream over SSE (`200 /api/stream`). Timeline was `note > classified > evidence_gathered > approval_requested > approved >
  email_sent > follow_up_scheduled > reply_received > resolved`. The script asserted 0 call steps, 0 raw addresses in page text, and 0 titles still prefixed "[MOCK]".
  Injection and out-of-scope (`type: other`) cases escalate. The audit page shows "Hash chain verified".
- 409 on a second approve confirmed with curl against the backend.
- Searched `web/` source, `.next/` build output and `screenshots/` for the two forbidden real-inbox identifiers (per team note): 0 matches each. Every screenshot was also reviewed by eye.

## Pre-deployment gate
(Template from Master.md, Module 12, filled in honestly for this branch.)
- Automated checks: **lint (`eslint`) and typecheck (`tsc --noEmit`) are green locally**. pytest/flake8/mypy don't apply to this TypeScript app.
  **There is no CI pipeline in this repo yet**, so nothing is green "in the pipeline". No unit tests yet; the Playwright scripts are the behavioral check.
- Docker image: **not built** for `web/`. Data persistence: **N/A**. The web app holds no durable data; the mock store is in memory by design.
- Self-review: done (diff read in full; no debug leftovers, no secrets, `.env*` ignored).
- Code review: **<pending: name / date>**.
- README answers the five questions (what, how to run, how to check, configuration, known limitations): `web/README.md`.

## How I ran it
```bash
cd web && npm install
./scripts/restart.sh                          # mock mode on http://localhost:3100
node scripts/screenshots.mjs                  # mock-mode screenshots
./scripts/restart.sh http://localhost:8000    # live mode (backend must allow CORS from :3100)
node scripts/live-check.mjs                   # live end-to-end check + screenshots
npm run check                                 # eslint + tsc
```

## Cloud / limits
- Local dev server only (`next dev` on :3100), started in the background. No production build or deploy.
- `NEXT_PUBLIC_*` values are baked in at start, so switching modes needs a restart.
- Mock data resets on restart, and the screenshot scripts add cases to whichever store they hit.
- Backend observations (not fixed here): the live approval message once carried date `2024-10-09` while evidence said `2026-10-09`.
  Errors use `{detail}`, not the contract's `{error}`. The UI reads both.
