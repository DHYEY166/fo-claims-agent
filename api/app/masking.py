"""Keeps the private test-bank address out of storage, logs and API output."""
import logging
import re
from typing import Any, Optional

from . import config

LABEL = "test bank inbox"
_EMAIL = re.compile(r"[^@\s:]+@[^@\s]+\.[A-Za-z]{2,}")


def real_target() -> Optional[str]:
    t = config.FO_TEST_TARGET
    return t if t and _EMAIL.fullmatch(t) else None


def mask(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    from .fo_oauth import secret_values
    for s in secret_values():
        value = value.replace(s, "[REDACTED_TOKEN]")
    real = real_target()
    return re.sub(re.escape(real), LABEL, value, flags=re.I) if real else value


def mask_deep(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: mask_deep(v) for k, v in value.items()}
    if isinstance(value, list):
        return [mask_deep(v) for v in value]
    return mask(value)


class MaskFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = mask(record.getMessage())
        record.args = ()
        return True


def install_log_filter() -> None:
    f = MaskFilter()
    for name in ("", "uvicorn", "uvicorn.error", "uvicorn.access", "pipeline", "httpx"):
        lg = logging.getLogger(name)
        lg.addFilter(f)
        for h in lg.handlers:
            h.addFilter(f)
