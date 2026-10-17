import json, sqlite3, threading, uuid
from datetime import datetime, timezone
from . import config

_lock = threading.Lock()

def now() -> str:
    return datetime.now(timezone.utc).isoformat()

def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"

def conn() -> sqlite3.Connection:
    c = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c

def init():
    with _lock, conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS cases (
          id TEXT PRIMARY KEY, type TEXT, title TEXT, counterparty TEXT,
          amount_cents INTEGER, currency TEXT, status TEXT, confidence REAL,
          mock INTEGER DEFAULT 0, source TEXT, raw_text TEXT, evidence TEXT,
          fo_conversation_id TEXT, follow_up_at TEXT,
          created_at TEXT, updated_at TEXT);
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY, case_id TEXT, ts TEXT, kind TEXT, title TEXT,
          detail TEXT, actor TEXT, payload TEXT);
        CREATE TABLE IF NOT EXISTS webhook_seen (id TEXT PRIMARY KEY, ts TEXT);
        """)

CASE_FIELDS = ["id","type","title","counterparty","amount_cents","currency","status",
               "confidence","mock","created_at","updated_at","fo_conversation_id","follow_up_at"]

def case_out(r) -> dict:
    d = {k: r[k] for k in CASE_FIELDS}
    d["mock"] = bool(d["mock"])
    return d

def event_out(r) -> dict:
    d = {k: r[k] for k in ["id","case_id","ts","kind","title","detail","actor"]}
    d.update(json.loads(r["payload"] or "{}"))
    return d

def insert_case(**f) -> dict:
    f.setdefault("id", new_id("case")); t = now()
    f.setdefault("created_at", t); f.setdefault("updated_at", t)
    cols = ",".join(f); qs = ",".join("?" * len(f))
    with _lock, conn() as c:
        c.execute(f"INSERT INTO cases ({cols}) VALUES ({qs})", list(f.values()))
    return get_case(f["id"])

def update_case(case_id: str, **f) -> dict:
    f["updated_at"] = now()
    sets = ",".join(f"{k}=?" for k in f)
    with _lock, conn() as c:
        c.execute(f"UPDATE cases SET {sets} WHERE id=?", [*f.values(), case_id])
    return get_case(case_id)

def get_case_row(case_id: str):
    with conn() as c:
        return c.execute("SELECT * FROM cases WHERE id=?", (case_id,)).fetchone()

def get_case(case_id: str):
    r = get_case_row(case_id)
    return case_out(r) if r else None

def list_cases() -> list:
    with conn() as c:
        return [case_out(r) for r in c.execute("SELECT * FROM cases ORDER BY created_at DESC")]

def find_case_by_conversation(conv_id: str):
    with conn() as c:
        r = c.execute("SELECT * FROM cases WHERE fo_conversation_id=?", (conv_id,)).fetchone()
    return case_out(r) if r else None

def insert_event(case_id, kind, title, actor, detail=None, **payload) -> dict:
    eid = new_id("evt")
    with _lock, conn() as c:
        c.execute("INSERT INTO events VALUES (?,?,?,?,?,?,?,?)",
                  (eid, case_id, now(), kind, title, detail, actor, json.dumps(payload)))
    return get_event(eid)

def update_event_payload(event_id, **payload) -> dict:
    ev = get_event(event_id)
    with conn() as c:
        cur = json.loads(c.execute("SELECT payload FROM events WHERE id=?", (event_id,)).fetchone()[0] or "{}")
    cur.update(payload)
    with _lock, conn() as c:
        c.execute("UPDATE events SET payload=? WHERE id=?", (json.dumps(cur), event_id))
    return get_event(event_id)

def claim_pending(event_id) -> bool:
    """Atomically flip an approval from pending to decided. True only for the single winning caller."""
    with _lock, conn() as c:
        cur = c.execute("UPDATE events SET payload=json_set(payload,'$.pending',json('false')) "
                        "WHERE id=? AND json_extract(payload,'$.pending')=1", (event_id,))
        return cur.rowcount == 1

def get_event(event_id):
    with conn() as c:
        r = c.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()
    return event_out(r) if r else None

def list_events(case_id) -> list:
    with conn() as c:
        return [event_out(r) for r in c.execute("SELECT * FROM events WHERE case_id=? ORDER BY ts", (case_id,))]

def due_follow_ups(ts: str) -> list:
    with conn() as c:
        return [case_out(r) for r in c.execute(
            "SELECT * FROM cases WHERE status='follow_up_scheduled' AND follow_up_at<=?", (ts,))]

def mark_webhook_seen(wid: str) -> bool:
    """Returns False if this delivery id was already processed."""
    try:
        with _lock, conn() as c:
            c.execute("INSERT INTO webhook_seen VALUES (?,?)", (wid, now()))
        return True
    except sqlite3.IntegrityError:
        return False
