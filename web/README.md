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
- **Real backend:** `NEXT_PUBLIC_API_BASE=http://localhost:8000 npm run dev` (needs CORS for `http://localhost:3100`).

Contract: [API_CONTRACT.md](./API_CONTRACT.md). Live updates via SSE (`/api/stream`), falling back to 3s polling.

## Demo script (2 min)

1. Cases list → point at "Waiting on you" + the Chase row (**Needs approval**).
2. Open Chase → **Approve before action** card shows exactly what Fo will do → Approve → events stream in
   (call with transcript → email → reply → follow-up → resolved).
3. New claim → "Try an example" → Create case → watch it get classified and request approval.

## Screenshots

`npm run screenshots` (app must be running; uses `/usr/bin/google-chrome` via playwright-core, override with `CHROME_PATH`).
Note: it creates and approves one extra case in the mock store; restart the dev server for a clean demo.
Output: `screenshots/*.png` at 1280×800.
