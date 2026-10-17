"""Standard Webhooks verification (https://wajo.ai/docs/webhooks.md)."""
import base64
import hashlib
import hmac
import time

TOLERANCE = 300  # seconds


class InvalidSignature(Exception):
    pass


def _key(secret: str) -> bytes:
    # Standard Webhooks secrets are usually "whsec_<base64>"; fall back to raw bytes otherwise.
    if secret.startswith("whsec_"):
        return base64.b64decode(secret[len("whsec_"):])
    return secret.encode()


def sign(secret: str, wid: str, ts: str, body: bytes) -> str:
    mac = hmac.new(_key(secret), f"{wid}.{ts}.".encode() + body, hashlib.sha256).digest()
    return "v1," + base64.b64encode(mac).decode()


def verify(secret: str, headers: dict, body: bytes, now: float | None = None) -> None:
    if not secret:
        raise InvalidSignature("webhook secret not configured")
    wid, ts, sig = headers.get("webhook-id"), headers.get("webhook-timestamp"), headers.get("webhook-signature")
    if not (wid and ts and sig):
        raise InvalidSignature("missing webhook headers")
    try:
        tsi = int(ts)
    except ValueError:
        raise InvalidSignature("bad timestamp")
    if abs((now or time.time()) - tsi) > TOLERANCE:
        raise InvalidSignature("timestamp outside tolerance")
    expected = sign(secret, wid, ts, body).split(",", 1)[1]
    for part in sig.split():
        v, _, s = part.partition(",")
        if v == "v1" and hmac.compare_digest(s, expected):
            return
    raise InvalidSignature("signature mismatch")
