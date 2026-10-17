# GSD Claims Agent — web dashboard

Next.js 15 (App Router, TypeScript) + Tailwind dashboard for the claims agent built on **Fo**: submit a claim,
watch the agent classify → gather evidence → **ask for approval** → call/email → follow up → resolve, live.

## Run

```bash
cd web
npm install
npm run dev            # http://localhost:3100
```

Background (as used for the demo): `nohup npm run dev > /tmp/gsd-web-dev.log 2>&1 &`

### Mock vs real backend

- **Default (no env):** in-memory mock layer (`lib/mockStore.ts` + `app/api/*` route handlers). Header shows a **MOCK DATA** badge.
  3 seeded cases (Chase double charge awaiting approval, UPS lost package awaiting reply, Lemonade stolen bike resolved).
  A simulator emits events every ~3s after you submit a claim or approve. It never places real calls, emails or payments.
  State resets when the server restarts.
- **Real backend:** `NEXT_PUBLIC_API_BASE=http://localhost:8000 npm run dev` (backend must allow CORS from `http://localhost:3100`).
  Header shows `API localhost:8000` instead of the MOCK DATA badge.

Helper: `scripts/restart.sh` (mock) or `scripts/restart.sh http://localhost:8000` (live) restarts the background dev server on :3100
(log: `/tmp/gsd-web-dev.log`). `NEXT_PUBLIC_*` is baked in at start, so switching modes needs a restart.

Contract: [API_CONTRACT.md](./API_CONTRACT.md). Live updates via SSE (`/api/stream`), falling back to 3s polling.

## Pages

- `/` case list (live) · `/new` submit claim (Paste / Upload / Forward) · `/cases/:id` timeline + **Approve before action** card
- `/audit` hash-chained audit log with a **Hash chain verified** badge (`chain_ok`)
- Escalations (`status: escalated`, e.g. possible prompt injection) show an amber banner; in mock mode, paste text containing
  "ignore previous instructions" to trigger one.

## Demo script (2 min)

1. Cases list → point at "Waiting on you" + the Chase row (**Needs approval**).
2. Open Chase → **Approve before action** card shows exactly what Fo will do → Approve → events stream in
   (call with transcript → email → reply → follow-up → resolved).
3. New claim → "Try an example" → Create case → watch it get classified and request approval.

## Screenshots

`npm run screenshots` (app must be running; uses `/usr/bin/google-chrome` via playwright-core, override with `CHROME_PATH`).
Note: it creates and approves one extra case in the mock store; restart the dev server for a clean demo.
Output: `screenshots/*.png` at 1280×800. `node scripts/live-check.mjs` runs the same flow against a live backend
(app must be started with `NEXT_PUBLIC_API_BASE`) and saves `i-`/`j-`/`k-`/`l-` screenshots.
