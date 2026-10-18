"""OAuth for the Fo MCP server, as a public client (no secret), following the metadata Wajo publishes:
  GET  https://mcp.api.wajo.ai/.well-known/oauth-protected-resource/fo  -> authorization server
  GET  <as>/.well-known/oauth-authorization-server -> authorize/token/register endpoints, S256 PKCE,
       grant types authorization_code + refresh_token, token_endpoint_auth_methods ["none"], scope "mcp".
Endpoints are discovered at runtime, never hard-coded. Tokens are written only to the gitignored .env
(mode 600) and are never printed, logged, or returned by any route."""
import base64
import hashlib
import os
import secrets
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlencode, urlsplit

import httpx

from . import config

KEYS = ("FO_OAUTH_CLIENT_ID", "FO_OAUTH_ACCESS_TOKEN", "FO_OAUTH_REFRESH_TOKEN", "FO_OAUTH_EXPIRES_AT")
_lock = threading.RLock()
_pending: dict[str, dict[str, Any]] = {}  # state -> {verifier, redirect_uri, created}
_meta: dict[str, Any] = {}


class OAuthError(Exception):
    pass


def env_path() -> Path:
    return Path(os.environ.get("ENV_FILE") or Path(__file__).resolve().parents[2] / ".env")


def _read_env() -> dict[str, str]:
    p = env_path()
    out: dict[str, str] = {}
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip()
    return out


def _write_env(updates: dict[str, Optional[str]]) -> None:
    """Atomic rewrite of .env with mode 600. Also updates os.environ so the running process sees it."""
    p = env_path()
    lines = p.read_text().splitlines() if p.exists() else []
    seen = set()
    new = []
    for line in lines:
        k = line.split("=", 1)[0].strip() if "=" in line else None
        if k in updates:
            seen.add(k)
            if updates[k] is not None:
                new.append(f"{k}={updates[k]}")
        else:
            new.append(line)
    new += [f"{k}={v}" for k, v in updates.items() if k not in seen and v is not None]
    fd, tmp = tempfile.mkstemp(dir=str(p.parent), prefix=".env.")
    with os.fdopen(fd, "w") as f:
        f.write("\n".join(new) + "\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, p)
    for k, v in updates.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


def _get(k: str) -> Optional[str]:
    return os.environ.get(k) or _read_env().get(k) or None


def secret_values() -> list[str]:
    return [v for v in (_get("FO_OAUTH_ACCESS_TOKEN"), _get("FO_OAUTH_REFRESH_TOKEN")) if v]


def discover() -> dict[str, Any]:
    with _lock:
        if _meta:
            return _meta
        u = urlsplit(config.FO_MCP_URL)
        prm = httpx.get(f"{u.scheme}://{u.netloc}/.well-known/oauth-protected-resource{u.path}", timeout=15)
        prm.raise_for_status()
        resource = prm.json()
        issuer = resource["authorization_servers"][0].rstrip("/")
        asm = httpx.get(f"{issuer}/.well-known/oauth-authorization-server", timeout=15)
        asm.raise_for_status()
        m = asm.json()
        if "S256" not in m.get("code_challenge_methods_supported", []):
            raise OAuthError("authorization server does not support S256 PKCE")
        _meta.update(m, resource=resource["resource"])
        return _meta


def _client_id(redirect_uri: str) -> str:
    cid = _get("FO_OAUTH_CLIENT_ID")
    if cid and _get("FO_OAUTH_REDIRECT_URI") == redirect_uri:
        return cid
    m = discover()
    r = httpx.post(m["registration_endpoint"], timeout=15, json={
        "client_name": "fo-claims-agent (local)", "redirect_uris": [redirect_uri],
        "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
        "token_endpoint_auth_method": "none", "scope": "mcp"})
    if r.status_code >= 400:
        raise OAuthError(f"client registration failed: HTTP {r.status_code}")
    cid = r.json()["client_id"]
    _write_env({"FO_OAUTH_CLIENT_ID": cid, "FO_OAUTH_REDIRECT_URI": redirect_uri})
    return cid


def start(redirect_uri: str) -> str:
    """Returns the authorize URL for the user to open and approve themselves."""
    m = discover()
    cid = _client_id(redirect_uri)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(24)
    with _lock:
        now = time.time()
        for s in [s for s, v in _pending.items() if now - v["created"] > 600]:
            _pending.pop(s, None)
        _pending[state] = {"verifier": verifier, "redirect_uri": redirect_uri, "created": now}
    q = {"response_type": "code", "client_id": cid, "redirect_uri": redirect_uri, "scope": "mcp",
         "state": state, "code_challenge": challenge, "code_challenge_method": "S256", "resource": m["resource"]}
    return m["authorization_endpoint"] + "?" + urlencode(q)


def _save_tokens(tok: dict[str, Any]) -> None:
    if not tok.get("access_token"):
        raise OAuthError("token response had no access_token")
    exp = int(time.time()) + int(tok.get("expires_in") or 3600)
    _write_env({"FO_OAUTH_ACCESS_TOKEN": tok["access_token"],
                "FO_OAUTH_REFRESH_TOKEN": tok.get("refresh_token") or _get("FO_OAUTH_REFRESH_TOKEN"),
                "FO_OAUTH_EXPIRES_AT": str(exp)})


def callback(code: str, state: str) -> None:
    with _lock:
        p = _pending.pop(state, None)
    if not p or time.time() - p["created"] > 600:
        raise OAuthError("unknown or expired sign-in attempt; start again")
    m = discover()
    r = httpx.post(m["token_endpoint"], timeout=20, data={
        "grant_type": "authorization_code", "code": code, "redirect_uri": p["redirect_uri"],
        "client_id": _get("FO_OAUTH_CLIENT_ID"), "code_verifier": p["verifier"], "resource": m["resource"]})
    if r.status_code >= 400:
        raise OAuthError(f"token exchange failed: HTTP {r.status_code}")
    _save_tokens(r.json())


def refresh() -> bool:
    with _lock:
        rt = _get("FO_OAUTH_REFRESH_TOKEN")
        if not rt:
            return False
        m = discover()
        r = httpx.post(m["token_endpoint"], timeout=20, data={
            "grant_type": "refresh_token", "refresh_token": rt,
            "client_id": _get("FO_OAUTH_CLIENT_ID"), "resource": m["resource"]})
        if r.status_code >= 400:
            return False
        _save_tokens(r.json())
        return True


def access_token(force_refresh: bool = False) -> Optional[str]:
    """A valid access token, refreshed when within 60s of expiry (or when forced after a 401)."""
    with _lock:
        tok = _get("FO_OAUTH_ACCESS_TOKEN")
        exp = int(_get("FO_OAUTH_EXPIRES_AT") or 0)
        if tok and not force_refresh and time.time() < exp - 60:
            return tok
        if refresh():
            return _get("FO_OAUTH_ACCESS_TOKEN")
        return None if force_refresh else tok


def status() -> dict[str, Any]:
    exp = int(_get("FO_OAUTH_EXPIRES_AT") or 0)
    return {"connected": bool(_get("FO_OAUTH_ACCESS_TOKEN")), "has_refresh": bool(_get("FO_OAUTH_REFRESH_TOKEN")),
            "expires_in_s": max(exp - int(time.time()), 0) if exp else None}
