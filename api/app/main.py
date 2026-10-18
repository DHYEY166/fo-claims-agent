import asyncio
import html
import json
import logging
import threading
from contextlib import asynccontextmanager
from typing import Literal, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel
from . import bus, config, db, fo_oauth, masking, pipeline
from .webhook_verify import InvalidSignature, verify

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("api")
masking.install_log_filter()


@asynccontextmanager
async def lifespan(app):
    db.init()
    bus.bind(asyncio.get_running_loop())
    stop = threading.Event()
    threading.Thread(target=pipeline.scheduler_loop, args=(stop,), daemon=True).start()
    log.info("started fo_mock=%s claude=%s test_target=%s", config.FO_MOCK,
             bool(config.ANTHROPIC_API_KEY), bool(config.FO_TEST_TARGET))
    yield
    stop.set()

app = FastAPI(title="Fo Claims API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


class CaseIn(BaseModel):
    source: Literal["paste", "upload", "forward"] = "paste"
    text: str
    filenames: Optional[list[str]] = None


class ApprovalIn(BaseModel):
    event_id: str
    decision: Literal["approve", "reject"]
    note: Optional[str] = None


_LOCAL_HOSTS = ("127.0.0.1", "::1", "localhost")
_PROXY_HEADERS = ("x-forwarded-for", "x-forwarded-host", "x-real-ip", "forwarded", "cf-connecting-ip")


def _host_name(host: str) -> str:
    """Host header without its port: 'localhost:8020' -> 'localhost', '[::1]:8020' -> '::1'."""
    host = host.strip().lower()
    if host.startswith("["):
        return host[1:host.find("]")] if "]" in host else host
    return host.rsplit(":", 1)[0] if host.count(":") == 1 else host


def _local_only(request: Request) -> None:
    """Sign-in and approval routes answer only a browser on this computer. A tunnel or proxy makes every
    request look like it came from 127.0.0.1, so a forwarded header or a non-local Host is refused too."""
    if not request.client or request.client.host not in _LOCAL_HOSTS:
        raise HTTPException(403, "only reachable from this computer")
    if any(h in request.headers for h in _PROXY_HEADERS):
        raise HTTPException(403, "only reachable from this computer, not through a proxy or tunnel")
    if _host_name(request.headers.get("host", "")) not in _LOCAL_HOSTS:
        raise HTTPException(403, "only reachable at localhost")


@app.get("/oauth/start")
def oauth_start(request: Request):
    """Dhyey opens this and approves Fo access himself on Wajo's own sign-in page."""
    _local_only(request)
    redirect_uri = str(request.url_for("oauth_callback"))
    try:
        return RedirectResponse(fo_oauth.start(redirect_uri), status_code=302)
    except (fo_oauth.OAuthError, Exception) as e:
        raise HTTPException(502, f"could not start Fo sign-in: {type(e).__name__}")


@app.get("/oauth/callback", name="oauth_callback")
def oauth_callback(request: Request, code: Optional[str] = None, state: Optional[str] = None,
                   error: Optional[str] = None):
    _local_only(request)
    if error or not code or not state:
        msg = html.escape(masking.mask(error or "missing code"))
        return HTMLResponse(f"<h3>Fo sign-in did not complete</h3><p>{msg}</p>",
                            status_code=400)
    try:
        fo_oauth.callback(code, state)
    except fo_oauth.OAuthError as e:
        return HTMLResponse(f"<h3>Fo sign-in failed</h3><p>{html.escape(str(e))}</p>", status_code=400)
    log.info("fo oauth connected")
    return HTMLResponse("<h3>Fo is connected.</h3><p>You can close this tab.</p>")


@app.get("/oauth/status")
def oauth_status():
    return fo_oauth.status()


@app.get("/api/health")
def health():
    return {"ok": True, "fo_mock": config.FO_MOCK, "claude": bool(config.ANTHROPIC_API_KEY),
            "webhook_secret": bool(config.FO_WEBHOOK_SECRET), "test_target": bool(config.FO_TEST_TARGET)}


@app.get("/api/cases")
def list_cases():
    return db.list_cases()


@app.get("/api/cases/{case_id}")
def get_case(case_id: str):
    c = db.get_case(case_id)
    if not c:
        raise HTTPException(404, "case not found")
    return {**c, "events": db.list_events(case_id)}


@app.post("/api/cases", status_code=201)
def create_case(body: CaseIn):
    if not body.text.strip():
        raise HTTPException(422, "text is empty")
    return pipeline.intake(body.source, body.text, body.filenames)


@app.post("/api/cases/{case_id}/approvals")
def approve(case_id: str, body: ApprovalIn, request: Request):
    _local_only(request)
    if not db.get_case(case_id):
        raise HTTPException(404, "case not found")
    try:
        return pipeline.decide(case_id, body.event_id, body.decision, body.note)
    except ValueError as e:
        raise HTTPException(409, str(e))


@app.get("/api/audit")
def audit(case_id: Optional[str] = None):
    from . import trust_bridge
    return trust_bridge.audit_rows(case_id)


@app.get("/api/stream")
async def stream(request: Request):
    q = bus.subscribe()

    async def gen():
        try:
            yield ": connected\n\n"
            while not await request.is_disconnected():
                try:
                    yield await asyncio.wait_for(q.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            bus.unsubscribe(q)
    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/webhooks/fo")
async def fo_webhook(request: Request):
    body = await request.body()
    headers = {k.lower(): v for k, v in request.headers.items()}
    try:
        verify(config.FO_WEBHOOK_SECRET, headers, body)
    except InvalidSignature as e:
        log.warning("webhook rejected: %s", e)
        raise HTTPException(401, f"invalid signature: {e}")
    if not db.mark_webhook_seen(headers["webhook-id"]):
        return {"ok": True, "duplicate": True}
    evt = json.loads(body)
    typ = evt.get("type")
    data = evt.get("reply") or evt.get("message") or {}
    conv = data.get("conversationId")
    case = db.find_case_by_conversation(conv) if conv else None
    log.info("webhook %s type=%s conv=%s case=%s", headers["webhook-id"], typ, conv, case and case["id"])
    if case and typ in ("conversation.reply", "schedule.fired", "message.proactive"):
        pipeline.emit(case["id"], "note", f"Fo webhook: {typ}", "fo",
                      detail=data.get("text"), fo_conversation_id=conv, channel=data.get("channel"),
                      trigger=data.get("trigger"), status=data.get("status"))
        if data.get("trigger") in ("inbound_email", "inbound_text", "voice_postcall"):
            pipeline.on_counterparty_reply(case["id"], data.get("text") or "", conv=conv)
    return {"ok": True, "matched_case": case["id"] if case else None}
