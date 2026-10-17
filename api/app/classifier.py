"""Model reads, code decides. Claude turns forwarded text into a validated, cited Extraction.
Routing, threshold, amounts, deadlines and recipients are decided in pipeline.py."""
import json
import re
from datetime import date
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from . import config
from .schema import EVIDENCE_FIELDS, Extraction

PROMPT_ID = "classify.v2"  # prompts are versioned files; never edit one in place
PROMPT_DIR = Path(__file__).resolve().parents[1] / "prompts"
MAX_REPAIRS = 1


def number_lines(text: str) -> str:
    return "\n".join(f"L{i}: {line}" for i, line in enumerate(text.splitlines(), 1))


def system_prompt() -> str:
    tpl = (PROMPT_DIR / f"{PROMPT_ID}.md").read_text()
    return (tpl.replace("{today}", date.today().isoformat())
               .replace("{schema}", json.dumps(Extraction.model_json_schema())))


def ground(ex: Extraction, text: str) -> list[str]:
    """Code-side grounding check: a cited line must exist and contain the value."""
    lines = text.splitlines()
    problems = []
    for f in EVIDENCE_FIELDS:
        ev = getattr(ex, f)
        if ev.status.value != "present":
            continue
        m = re.fullmatch(r"L(\d+)", (ev.citation or "").strip())
        if not m or not (1 <= int(m.group(1)) <= len(lines)):
            problems.append(f"{f}: citation {ev.citation!r} is not an input line")
            continue
        line = lines[int(m.group(1)) - 1].lower()
        probe = re.sub(r"[^a-z0-9]", "", (ev.value or "").lower())
        if f not in ("transaction_date", "reason", "counterparty", "currency") and probe and \
                probe not in re.sub(r"[^a-z0-9]", "", line):
            problems.append(f"{f}: value {ev.value!r} not found on {ev.citation}")
    return problems


def _stub(text: str) -> tuple[Extraction, dict[str, Any]]:
    t = text.lower()
    absent = {"status": "absent"}
    kind = ("card_dispute" if any(w in t for w in ["charge", "card", "billed"]) else
            "package_claim" if any(w in t for w in ["package", "tracking", "delivered"]) else "other")
    ex = Extraction.model_validate(dict(
        case_type=kind, confidence=0.75 if kind != "other" else 0.2,
        title=(text.strip().splitlines() or ["Untitled claim"])[0][:60],
        contains_instructions="ignore all previous instructions" in t,
        **{f: absent for f in EVIDENCE_FIELDS}))
    return ex, {"agent": "classifier", "model": "stub", "prompt_id": "stub", "mock": True,
                "tokens": {"input": 0, "output": 0}, "retries": 0, "errors": []}


def classify(text: str) -> tuple[Extraction, dict[str, Any]]:
    """Returns (extraction, trace). Raises ValueError if the model never produces a valid object."""
    if not config.ANTHROPIC_API_KEY:
        return _stub(text)
    import anthropic
    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY, timeout=60, max_retries=2)
    trace: dict[str, Any] = {"agent": "classifier", "model": config.CLAUDE_MODEL, "prompt_id": PROMPT_ID,
                             "tokens": {"input": 0, "output": 0}, "retries": 0, "errors": []}
    messages: list[dict[str, Any]] = [{"role": "user", "content":
                                       f"<untrusted_input>\n{number_lines(text)}\n</untrusted_input>"}]
    for attempt in range(MAX_REPAIRS + 1):
        msg = client.messages.create(model=config.CLAUDE_MODEL, max_tokens=1200,
                                     system=system_prompt(), messages=messages)  # type: ignore[arg-type]
        trace["tokens"]["input"] += msg.usage.input_tokens
        trace["tokens"]["output"] += msg.usage.output_tokens
        raw = "".join(getattr(b, "text", "") for b in msg.content)
        m = re.search(r"\{.*\}", raw, re.S)
        try:
            ex = Extraction.model_validate_json(m.group(0) if m else raw)
            trace["grounding_problems"] = ground(ex, text)
            return ex, trace
        except ValidationError as e:
            err = str(e)[:800]
            trace["errors"].append(err)
            if attempt < MAX_REPAIRS:
                trace["retries"] += 1
                messages += [{"role": "assistant", "content": raw},
                             {"role": "user",
                              "content": f"That failed validation:\n{err}\nReturn corrected JSON only."}]
    raise ValueError("classifier output failed validation after repair: " + trace["errors"][-1][:200])
