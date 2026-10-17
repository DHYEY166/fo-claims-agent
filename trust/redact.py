import re

_PAN = re.compile(r"\b\d(?:[ -]?\d){12,18}\b")
_SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
_KEYS = re.compile(r"\b(wak_[A-Za-z0-9_\-]{6,}|sk-ant-[A-Za-z0-9_\-]{6,}|whsec_[A-Za-z0-9+/=]{6,})")


def _luhn(digits: str) -> bool:
    total, alt = 0, False
    for d in reversed(digits):
        n = int(d)
        if alt:
            n = n * 2 - 9 if n > 4 else n * 2
        total += n
        alt = not alt
    return total % 10 == 0


def redact(text: str) -> str:
    text = _KEYS.sub("[REDACTED_KEY]", text)
    text = _SSN.sub("[REDACTED_SSN]", text)

    def pan(m):
        d = re.sub(r"\D", "", m.group(0))
        return f"[CARD ****{d[-4:]}]" if 13 <= len(d) <= 19 and _luhn(d) else m.group(0)

    return _PAN.sub(pan, text)
