"""PONG smoke test: one ask_fo turn that asks Fo to reply PONG and take no action, then poll get_fo_reply."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.fo_client import FoClient  # noqa: E402
from app.masking import mask  # noqa: E402

fo = FoClient()
t0 = time.monotonic()
r = fo.ask("Smoke test. Reply with exactly the word PONG and nothing else. "
           "Do not send any email, call, text or message, and do not take any action.", new=True)
conv = r.get("conversationId")
print("ask_fo ->", r.get("status"), "conversationId:", conv)
polls = 0
while r.get("status") == "working" and time.monotonic() - t0 < 180:
    r = fo.poll(conv, wait=20)
    polls += 1
    print(f"get_fo_reply #{polls} -> {r.get('status')}")
print("final status:", r.get("status"), "| elapsed_s:", round(time.monotonic() - t0, 1))
print("response:", mask(str(r.get("response") or r.get("text")))[:300])
