"""Standard Webhooks verification for Fo deliveries (https://wajo.ai/docs/webhooks.md)."""
import base64, hashlib, hmac, time

TOLERANCE_S = 300


class WebhookRejected(Exception):
    pass


def _key(secret: str) -> bytes:
    # Standard Webhooks secrets are usually "whsec_<base64>"; fall back to raw bytes.
    if secret.startswith("whsec_"):
        return base64.b64decode(secret[len("whsec_"):])
    return secret.encode()


def sign(secret: str, msg_id: str, ts: int, body: bytes) -> str:
    mac = hmac.new(_key(secret), f"{msg_id}.{ts}.".encode() + body, hashlib.sha256).digest()
    return "v1," + base64.b64encode(mac).decode()


def verify(secret: str, headers: dict, body: bytes, now: float | None = None, seen: set | None = None) -> str:
    h = {k.lower(): v for k, v in headers.items()}
    msg_id, ts, sigs = h.get("webhook-id"), h.get("webhook-timestamp"), h.get("webhook-signature")
    if not (msg_id and ts and sigs):
        raise WebhookRejected("missing_headers")
    try:
        ts_i = int(ts)
    except ValueError:
        raise WebhookRejected("bad_timestamp")
    now = time.time() if now is None else now
    if abs(now - ts_i) > TOLERANCE_S:
        raise WebhookRejected("stale_timestamp")
    expected = sign(secret, msg_id, ts_i, body).split(",", 1)[1]
    ok = any(
        part.startswith("v1,") and hmac.compare_digest(part.split(",", 1)[1], expected)
        for part in sigs.split()
    )
    if not ok:
        raise WebhookRejected("bad_signature")
    if seen is not None:
        if msg_id in seen:
            raise WebhookRejected("duplicate")
        seen.add(msg_id)
    return msg_id
