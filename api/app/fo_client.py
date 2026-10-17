"""Minimal MCP Streamable-HTTP client for the Fo profile (https://mcp.api.wajo.ai/fo).
Tool names/params verified against the live tools/list: ask_fo(message, conversationId?, newConversation?),
get_fo_reply(conversationId?, waitSeconds 0..40), get_fo_conversation(conversationId), list_fo_conversations()."""
import json
import time
import logging
import httpx
from . import config

log = logging.getLogger("fo")


class FoError(Exception):
    pass


class FoClient:
    def __init__(self, url=None, api_key=None, timeout=60.0):
        self.url = url or config.FO_MCP_URL
        self.api_key = api_key or config.WAJO_API_KEY
        self.http = httpx.Client(timeout=timeout)
        self.session_id = None
        self._id = 0

    def _headers(self):
        h = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
        if self.api_key:
            h["X-API-Key"] = self.api_key
        if self.session_id:
            h["Mcp-Session-Id"] = self.session_id
        return h

    def _rpc(self, method, params=None, notify=False):
        body = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            body["params"] = params
        if not notify:
            self._id += 1
            body["id"] = self._id
        r = self.http.post(self.url, headers=self._headers(), json=body)
        if r.headers.get("mcp-session-id"):
            self.session_id = r.headers["mcp-session-id"]
        if notify:
            return None
        if r.status_code >= 400:
            raise FoError(f"{method} HTTP {r.status_code}: {r.text[:300]}")
        msg = None
        if "text/event-stream" in r.headers.get("content-type", ""):
            for line in r.text.splitlines():
                if line.startswith("data:"):
                    cand = json.loads(line[5:].strip())
                    if cand.get("id") == body.get("id"):
                        msg = cand
        else:
            msg = r.json()
        if not msg:
            raise FoError(f"{method}: empty response")
        if "error" in msg:
            raise FoError(f"{method}: {msg['error']}")
        return msg["result"]

    def connect(self):
        if self.session_id is None:
            self._rpc("initialize", {"protocolVersion": "2025-03-26", "capabilities": {},
                                     "clientInfo": {"name": "fo-claims", "version": "0.1"}})
            self._rpc("notifications/initialized", notify=True)

    BLOCKED_TOOLS = {"start_fo_call"}  # email-only demo: no phone calls from this service

    def call(self, tool, args):
        if tool in self.BLOCKED_TOOLS:
            raise FoError(f"{tool} is disabled (email-only demo)")
        self.connect()
        res = self._rpc("tools/call", {"name": tool, "arguments": args})
        return parse_tool_result(res)

    def ask(self, message, conversation_id=None, new=False):
        args = {"message": message}
        if conversation_id:
            args["conversationId"] = conversation_id
        elif new:
            args["newConversation"] = True
        return self.call("ask_fo", args)

    def poll(self, conversation_id, wait=40):
        return self.call("get_fo_reply", {"conversationId": conversation_id, "waitSeconds": wait})

    def poll_with_retry(self, conversation_id, errors, attempts=3):
        """One get_fo_reply with capped backoff on transport errors. Errors are recorded for the trace."""
        for i in range(attempts):
            try:
                return self.poll(conversation_id)
            except (FoError, httpx.HTTPError) as e:
                errors.append(str(e)[:200])
                if i == attempts - 1:
                    return {"status": "failed", "response": f"get_fo_reply failed {attempts}x: {e}"}
                time.sleep(2 ** i * 2)
        return {"status": "failed"}

    def ask_and_wait(self, message, new=True, max_seconds=600, on_progress=None):
        reply = self.ask(message, new=new)
        conv = reply.get("conversationId")
        start = time.time()
        while reply.get("status") == "working":
            if on_progress and reply.get("progress"):
                on_progress(reply["progress"], conv)
            if time.time() - start > max_seconds:
                reply["status"] = "timeout"
                break
            reply = self.poll(conv)
            conv = reply.get("conversationId") or conv
        reply["conversationId"] = conv
        return reply


def parse_tool_result(res: dict) -> dict:
    """Normalize a tools/call result into a dict with at least status/text/conversationId when present."""
    if res.get("structuredContent"):
        out = dict(res["structuredContent"])
    else:
        texts = [c.get("text", "") for c in res.get("content", []) if c.get("type") == "text"]
        joined = "\n".join(texts)
        try:
            out = json.loads(joined)
            if not isinstance(out, dict):
                out = {"text": joined}
        except Exception:
            out = {"text": joined}
    if res.get("isError"):
        out.setdefault("status", "failed")
    out["_raw"] = res
    return out
