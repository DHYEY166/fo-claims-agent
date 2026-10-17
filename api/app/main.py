import asyncio, json, logging, threading
from contextlib import asynccontextmanager
from typing import Literal, Optional
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from . import bus, config, db, pipeline
from .webhook_verify import InvalidSignature, verify

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("api")

@asynccontextmanager
async def lifespan(app):
    db.init(); bus.bind(asyncio.get_running_loop())
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
    if not c: raise HTTPException(404, "case not found")
    return {**c, "events": db.list_events(case_id)}

@app.post("/api/cases", status_code=201)
def create_case(body: CaseIn):
    if not body.text.strip(): raise HTTPException(422, "text is empty")
    return pipeline.intake(body.source, body.text, body.filenames)

@app.post("/api/cases/{case_id}/approvals")
def approve(case_id: str, body: ApprovalIn):
    if not db.get_case(case_id): raise HTTPException(404, "case not found")
    try:
        return pipeline.decide(case_id, body.event_id, body.decision, body.note)
    except ValueError as e:
        raise HTTPException(409, str(e))

@app.get("/api/stream")
async def stream(request: Request):
    q = bus.subscribe()
    async def gen():
        try:
            yield ": connected\n\n"
            while not await request.is_disconnected():
                try: yield await asyncio.wait_for(q.get(), timeout=15)
                except asyncio.TimeoutError: yield ": ping\n\n"
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
