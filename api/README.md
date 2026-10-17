# api: Fo claims backend (FastAPI + SQLite)

    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    .venv/bin/uvicorn app.main:app --port 8000      # http://localhost:8000
    .venv/bin/python -m pytest -q tests

Contract: web/API_CONTRACT.md. Extra: GET /api/health, POST /webhooks/fo (Standard Webhooks signature).
FO_MOCK=1 (default, or whenever WAJO_API_KEY is missing) simulates Fo and marks every simulated event mock=true.
