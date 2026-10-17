import time


def poll_fo_reply(get_reply, timeout_s=600, clock=time.monotonic):
    """Call get_reply() (one get_fo_reply call, which itself waits up to 40 s) until the turn
    leaves 'working'. Returns (case_state, last_result). Never reports success on timeout."""
    start = clock()
    last = None
    while clock() - start < timeout_s:
        last = get_reply()
        status = last.get("status")
        if status == "working":
            continue
        # /fo get_fo_reply returns "complete"; webhook conversation.reply uses "completed".
        if status in ("complete", "completed"):
            return ("needs_user_input" if last.get("awaitingUser") else "waiting_on_reply", last)
        return ("fo_failed", last)
    return ("fo_stalled", last)
