import time
from app.webhook_verify import sign, verify, InvalidSignature
import pytest

S = "whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ="


def h(wid, ts, sig): return {"webhook-id": wid, "webhook-timestamp": ts, "webhook-signature": sig}


def test_valid():
    ts = str(int(time.time()))
    b = b'{"type":"webhook.test"}'
    verify(S, h("msg_1", ts, sign(S, "msg_1", ts, b)), b)


def test_tampered_body():
    ts = str(int(time.time()))
    with pytest.raises(InvalidSignature):
        verify(S, h("msg_1", ts, sign(S, "msg_1", ts, b"a")), b"b")


def test_stale():
    ts = str(int(time.time()) - 600)
    b = b"{}"
    with pytest.raises(InvalidSignature):
        verify(S, h("msg_1", ts, sign(S, "msg_1", ts, b)), b)


def test_no_secret():
    with pytest.raises(InvalidSignature):
        verify("", h("a", "1", "v1,x"), b"")
