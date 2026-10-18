import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.main import _local_only


def req(host="localhost:8020", client="127.0.0.1", **headers):
    hdrs = [(b"host", host.encode())] + [(k.replace("_", "-").lower().encode(), v.encode()) for k, v in headers.items()]
    return Request({"type": "http", "method": "POST", "path": "/", "headers": hdrs, "client": (client, 5000)})


@pytest.mark.parametrize("host", ["localhost:8020", "127.0.0.1:8020", "localhost", "[::1]:8020"])
def test_local_browser_allowed(host):
    _local_only(req(host=host))


@pytest.mark.parametrize("r", [
    req(x_forwarded_for="203.0.113.7"),
    req(forwarded="for=203.0.113.7"),
    req(cf_connecting_ip="203.0.113.7"),
    req(x_forwarded_host="abc.trycloudflare.com"),
    req(x_real_ip="203.0.113.7"),
    req(host="abc.trycloudflare.com"),
    req(host="localhost.evil.com:8020"),
    req(client="203.0.113.7"),
])
def test_tunnel_or_remote_refused(r):
    with pytest.raises(HTTPException) as e:
        _local_only(r)
    assert e.value.status_code == 403


def test_approve_route_refuses_forwarded_request():
    from fastapi.testclient import TestClient

    from app import db
    from app.main import app
    db.init()
    c = TestClient(app, base_url="http://localhost:8020", client=("127.0.0.1", 5000))
    r = c.post("/api/cases/case_x/approvals", json={"event_id": "e", "decision": "approve"},
               headers={"X-Forwarded-For": "203.0.113.7"})
    assert r.status_code == 403
    assert c.get("/oauth/start", headers={"CF-Connecting-IP": "203.0.113.7"}).status_code == 403
    assert c.post("/api/cases/case_x/approvals", json={"event_id": "e", "decision": "approve"}).status_code == 404
