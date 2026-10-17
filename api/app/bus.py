"""In-process pub/sub feeding the SSE stream. Safe to publish from worker threads."""
import asyncio
import json

_subs: set[asyncio.Queue] = set()
_loop: asyncio.AbstractEventLoop | None = None


def bind(loop):
    global _loop
    _loop = loop


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=500)
    _subs.add(q)
    return q


def unsubscribe(q):
    _subs.discard(q)


def publish(event: str, data: dict):
    if not _loop:
        return
    msg = f"event: {event}\ndata: {json.dumps(data)}\n\n"

    def _put():
        for q in list(_subs):
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                pass
    _loop.call_soon_threadsafe(_put)
