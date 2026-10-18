import os
import stat
import time

from app import fo_oauth, masking


def test_env_written_mode_600_and_tokens_redacted(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("FO_TEST_TARGET=x@example.com\n")
    monkeypatch.setenv("ENV_FILE", str(env))
    for k in fo_oauth.KEYS:
        monkeypatch.delenv(k, raising=False)
    fo_oauth._save_tokens({"access_token": "acc-123-secret", "refresh_token": "ref-456-secret", "expires_in": 3600})
    assert stat.S_IMODE(os.stat(env).st_mode) == 0o600
    text = env.read_text()
    assert "FO_TEST_TARGET=x@example.com" in text and "FO_OAUTH_ACCESS_TOKEN=acc-123-secret" in text
    assert masking.mask("Bearer acc-123-secret / ref-456-secret") == "Bearer [REDACTED_TOKEN] / [REDACTED_TOKEN]"
    assert fo_oauth.status()["connected"] is True
    assert "acc-123" not in str(fo_oauth.status())


def test_expired_token_triggers_refresh(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    monkeypatch.setenv("ENV_FILE", str(env))
    monkeypatch.setenv("FO_OAUTH_ACCESS_TOKEN", "old")
    monkeypatch.setenv("FO_OAUTH_EXPIRES_AT", str(int(time.time()) - 5))
    called = []
    monkeypatch.setattr(fo_oauth, "refresh", lambda: called.append(
        1) or (os.environ.update(FO_OAUTH_ACCESS_TOKEN="new") or True))
    assert fo_oauth.access_token() == "new" and called


def test_callback_rejects_unknown_state():
    try:
        fo_oauth.callback("code", "not-a-real-state")
        assert False
    except fo_oauth.OAuthError:
        pass
