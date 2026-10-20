"""Security and session tests. Does not touch PDF geometry."""

from __future__ import annotations

import hashlib
import hmac
import os
import subprocess
import sys
from pathlib import Path

import pytest
from flask import Flask, request

import team_auth
from team_auth import (
    AuthConfigError,
    FAIL_WINDOW_SEC,
    HOUR_WINDOW_SEC,
    _attempt_times,
    _fail_times,
    _lock_until,
    _revoked,
    _signing_secret,
    assert_signing_secret,
    handle_login,
    parse_token,
    prune_attempt_maps,
    require_team_session,
    revoke,
)

ROOT = Path(__file__).resolve().parents[1]
IP = "203.0.113.44"


def _reset_maps() -> None:
    _fail_times.clear()
    _attempt_times.clear()
    _lock_until.clear()
    _revoked.clear()


def _login(app: Flask, pin: str, ip: str = IP):
    with app.test_request_context(
        "/auth/login",
        method="POST",
        json={"pin": pin},
        environ_base={"REMOTE_ADDR": ip},
    ):
        return handle_login(request)


def _status(resp) -> int:
    if isinstance(resp, tuple):
        return int(resp[1])
    return int(resp.status_code)


@pytest.fixture(autouse=True)
def _clean_auth(monkeypatch: pytest.MonkeyPatch):
    _reset_maps()
    monkeypatch.setenv("NEXUS_AUTH_TEST", "1")
    monkeypatch.setenv("NEXUS_AUTH_SECRET", "test-signing-secret-please-ignore")
    monkeypatch.setenv("NEXUS_TEAM_PASSWORD", "945762")
    monkeypatch.setenv("FLASK_ENV", "development")
    yield
    _reset_maps()


def test_production_rejects_missing_or_short_secret(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("NEXUS_AUTH_SECRET", "")
    with pytest.raises(AuthConfigError):
        assert_signing_secret()
    with pytest.raises(RuntimeError):
        _signing_secret()
    monkeypatch.setenv("NEXUS_AUTH_SECRET", "too-short")
    with pytest.raises(AuthConfigError):
        _signing_secret()


def test_non_production_missing_secret_warns_and_boots(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture):
    monkeypatch.setenv("FLASK_ENV", "development")
    monkeypatch.delenv("NEXUS_AUTH_SECRET", raising=False)
    with caplog.at_level("WARNING", logger="nexus.team_auth"):
        secret = _signing_secret()
    assert isinstance(secret, bytes) and len(secret) == 32
    assert "process-local secret" in caplog.text


def test_two_workers_share_hmac_secret():
    env = os.environ.copy()
    env["FLASK_ENV"] = "production"
    env["NEXUS_AUTH_SECRET"] = "shared-across-gunicorn-workers"
    env["NEXUS_AUTH_TEST"] = "1"
    env["PYTHONPATH"] = str(ROOT)
    issue = subprocess.run(
        [sys.executable, "-c", "from team_auth import issue_token; print(issue_token()[0], end='')"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert issue.returncode == 0, issue.stderr
    token = issue.stdout.strip()
    check = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys; from team_auth import parse_token; raise SystemExit(0 if parse_token(sys.argv[1]) else 2)",
            token,
        ],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert check.returncode == 0, check.stderr
    payload, sig = token.rsplit(".", 1)
    secret = hashlib.sha256(b"nexus-auth|shared-across-gunicorn-workers").digest()
    assert sig == hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()


def test_five_failed_pins_lock_the_ip():
    app = Flask(__name__)
    codes = [_status(_login(app, "000000")) for _ in range(5)]
    assert codes[:4] == [401, 401, 401, 401]
    assert codes[4] == 429
    assert _status(_login(app, "945762")) == 429


def test_prune_drops_expired_attempt_maps():
    _fail_times[IP].append(10.0)
    _attempt_times[IP].append(10.0)
    prune_attempt_maps(now=10.0 + FAIL_WINDOW_SEC + HOUR_WINDOW_SEC + 5)
    assert IP not in _fail_times
    assert IP not in _attempt_times


def test_revoke_rejects_the_bearer_token():
    app = Flask(__name__)
    ok = _login(app, "945762", ip="203.0.113.45")
    assert _status(ok) == 200
    token = ok.get_json()["token"]
    claims = parse_token(token)
    assert claims
    revoke(claims)
    with app.test_request_context("/generate", headers={"Authorization": f"Bearer {token}"}):
        denied, parsed = require_team_session(request)
    assert parsed is None
    assert denied is not None and denied.status_code == 401
