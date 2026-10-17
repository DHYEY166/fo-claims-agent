import os
from pathlib import Path

try:
    from dotenv import load_dotenv  # optional
    # Repo-root .env (relative to this file). ENV_FILE overrides for local setups.
    load_dotenv(os.environ.get("ENV_FILE") or Path(__file__).resolve().parents[2] / ".env")
except Exception:
    pass


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


DB_PATH = env("DB_PATH", str(Path(__file__).resolve().parents[1] / "cases.db"))
ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY")
CLAUDE_MODEL = "claude-sonnet-4-5-20250929"  # pinned; change only with a new prompt version + eval
WAJO_API_KEY = env("WAJO_API_KEY")
FO_MCP_URL = env("FO_MCP_URL", "https://mcp.api.wajo.ai/fo")
FO_MOCK = env("FO_MOCK", "1") == "1" or not WAJO_API_KEY
FO_WEBHOOK_SECRET = env("FO_WEBHOOK_SECRET")
# Trust: every outbound Fo action is pinned to this test target. Never a real business.
FO_TEST_TARGET = env("FO_TEST_TARGET")
CORS_ORIGINS = env("CORS_ORIGINS", "http://localhost:3100").split(",")
CONFIDENCE_THRESHOLD = float(env("CONFIDENCE_THRESHOLD", "0.7"))
FOLLOW_UP_SECONDS = int(env("FOLLOW_UP_SECONDS", "20"))
MOCK_STEP_SECONDS = float(env("MOCK_STEP_SECONDS", "2"))

# Per-case model spend ceiling (input+output tokens, repairs included). Over it, the case escalates.
MAX_CASE_TOKENS = int(env("MAX_CASE_TOKENS", "30000"))
# Code-owned deadlines: days from transaction date to file. Configurable defaults, not legal advice.
FILING_WINDOW_DAYS = {"card_dispute": 60, "package_claim": 60, "insurance_claim": 30}
# Reconciliation: a case stuck in contacting longer than this with no Fo result escalates.
CONTACT_STALE_SECONDS = int(env("CONTACT_STALE_SECONDS", "900"))
# Hard cap on real emails to the private test-bank inbox per UTC day. One send per approved case, no retries.
MAX_TEST_SENDS_PER_DAY = 3
