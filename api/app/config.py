import os
from pathlib import Path

try:
    from dotenv import load_dotenv  # optional
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except Exception:
    pass

def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)

DB_PATH = env("DB_PATH", str(Path(__file__).resolve().parents[1] / "cases.db"))
ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY")
CLAUDE_MODEL = env("CLAUDE_MODEL", "claude-sonnet-4-5")
WAJO_API_KEY = env("WAJO_API_KEY")
FO_MCP_URL = env("FO_MCP_URL", "https://mcp.api.wajo.ai/fo")
FO_MOCK = env("FO_MOCK", "1") == "1" or not WAJO_API_KEY
FO_WEBHOOK_SECRET = env("FO_WEBHOOK_SECRET")
# Trust: every outbound Fo action is pinned to this test target. Never a real business.
FO_TEST_TARGET = env("FO_TEST_TARGET")
CORS_ORIGINS = env("CORS_ORIGINS", "http://localhost:3100").split(",")
CONFIDENCE_THRESHOLD = float(env("CONFIDENCE_THRESHOLD", "0.6"))
FOLLOW_UP_SECONDS = int(env("FOLLOW_UP_SECONDS", "20"))
MOCK_STEP_SECONDS = float(env("MOCK_STEP_SECONDS", "2"))
