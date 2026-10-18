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


_CUR = r"(?:[$\u20ac\u00a3]|\b(?:USD|EUR|GBP|CAD)\b)"
_AMT = r"\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?"
# A money token: a whole number with a currency marker next to it, or one with exactly two decimals.
# Numbers inside IDs ("LMN-4471-22"), dates, ZIPs or tracking numbers never count.
_MONEY = re.compile(rf"(?<![\w.,-])(?:{_CUR}\s?(?P<a>{_AMT})|(?P<b>{_AMT})\s?{_CUR}|(?P<c>\d[\d,]*\.\d{{2}}))"
                    r"(?![\w.,-]*\d)", re.IGNORECASE)
_VALUE = re.compile(rf"\s*{_CUR}?\s?({_AMT})\s*{_CUR}?\s*", re.IGNORECASE)


def _cents(num: str) -> int:
    whole, _, frac = num.replace(",", "").partition(".")
    return int(whole) * 100 + int((frac + "00")[:2])


def _amount_on_line(value: object, line: str) -> bool:
    """The claimed amount must equal a money token on the cited line, to the cent.
    "780.00" is grounded by "$780" and "1200.00" by "$1,200", but not by "order 780" or "LMN-780-22"."""
    m = _VALUE.fullmatch(str(value or ""))
    if not m:
        return False
    want = _cents(m.group(1))
    for t in _MONEY.finditer(line):
        num = t.group("a") or t.group("b") or t.group("c")
        if num and _cents(num) == want:
            return True
    return False


_CITE_PART = re.compile(r"L(\d+)(?:\s*-\s*L(\d+))?")
MAX_CITE_SPAN = 3  # a range wider than this is not a citation, it is "somewhere in the email"


def cited_lines(citation: str | None, n_lines: int) -> list[int] | None:
    """Parse "L3", "L1, L2" or "L1-L2" (parts may be mixed) into 1-based line numbers.
    None if anything is malformed, a range runs backwards, a cited line doesn't exist, or the citation
    covers more than MAX_CITE_SPAN distinct lines in total (counted across every part, so "L1-L2, L5-L7"
    can't get around the cap)."""
    parts = [p.strip() for p in (citation or "").split(",")]
    if not parts or any(not p for p in parts):
        return None
    out: list[int] = []
    for part in parts:
        m = _CITE_PART.fullmatch(part)
        if not m:
            return None
        a = int(m.group(1))
        b = int(m.group(2)) if m.group(2) else a
        if not (1 <= a <= b <= n_lines):
            return None
        out.extend(n for n in range(a, b + 1) if n not in out)
        if len(out) > MAX_CITE_SPAN:
            return None
    return out


def ground(ex: Extraction, text: str) -> list[str]:
    """Code-side grounding check: every cited line must exist, and the value must be on at least one of them."""
    lines = text.splitlines()
    problems = []
    for f in EVIDENCE_FIELDS:
        ev = getattr(ex, f)
        if ev.status.value != "present":
            continue
        nums = cited_lines(ev.citation, len(lines))
        if nums is None:
            problems.append(f"{f}: citation {ev.citation!r} is not an input line")
            continue
        cited = [lines[n - 1].lower() for n in nums]
        if f == "amount":
            if not any(_amount_on_line(ev.value, line) for line in cited):
                problems.append(f"{f}: value {ev.value!r} not found on {ev.citation}")
            continue
        probe = re.sub(r"[^a-z0-9]", "", (ev.value or "").lower())
        if f not in ("transaction_date", "reason", "counterparty", "currency") and probe and \
                not any(probe in re.sub(r"[^a-z0-9]", "", line) for line in cited):
            problems.append(f"{f}: value {ev.value!r} not found on {ev.citation}")
    return problems


def _stub(text: str) -> tuple[Extraction, dict[str, Any]]:
    t = text.lower()
    absent = {"status": "absent"}
    # Package words first (a package claim can mention the card it was paid with), then insurance, then card.
    kind = ("package_claim" if any(w in t for w in ["package", "tracking", "delivered", "parcel", "shipment"]) else
            "insurance_claim" if any(w in t for w in ["insurance", "insurer", "policy", "deductible", "premium",
                                                      "coverage"]) else
            "card_dispute" if any(w in t for w in ["charge", "card", "billed"]) else "other")
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
