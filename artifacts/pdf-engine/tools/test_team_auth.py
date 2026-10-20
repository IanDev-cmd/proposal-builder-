"""Auth gate: PIN login, Bearer sessions, injection/brute-force rejects."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
os.environ["NEXUS_AUTH_TEST"] = "1"
os.environ["NEXUS_TEAM_PASSWORD"] = "945762"
os.environ["NEXUS_AUTH_SECRET"] = "test-signing-secret-please-ignore"
sys.path.insert(0, str(ROOT))

from flask import Flask, request  # noqa: E402

from team_auth import (  # noqa: E402
    AuthConfigError,
    assert_signing_secret,
    handle_login,
    issue_token,
    parse_token,
    require_team_session,
    revoke,
)


def _status(resp) -> int:
    if isinstance(resp, tuple):
        return int(resp[1])
    return int(resp.status_code)


def main() -> None:
    app = Flask(__name__)
    client = app.test_client()

    with app.test_request_context("/auth/login", method="POST", json={"pin": "945762", "extra": "<script>"}):
        injected = handle_login(request)
        assert _status(injected) == 400, _status(injected)

    with app.test_request_context("/auth/login", method="POST", json={"pin": "000000"}):
        wrong = handle_login(request)
        assert _status(wrong) == 401, _status(wrong)

    with app.test_request_context("/auth/login", method="POST", json={"pin": "<script>"}):
        xss = handle_login(request)
        assert _status(xss) == 401, _status(xss)

    with app.test_request_context("/auth/login", method="POST", json={"pin": "945762"}):
        ok = handle_login(request)
        assert _status(ok) == 200, _status(ok)
        token = ok.get_json()["token"]
    assert isinstance(token, str) and token.count(".") == 3
    assert parse_token(token)

    with app.test_request_context("/templates", headers={"Authorization": f"Bearer {token}"}):
        denied, claims = require_team_session(request)
        assert denied is None and claims and claims["jti"]

    with app.test_request_context("/templates", headers={"Authorization": "Bearer a.b.c.d"}):
        denied, claims = require_team_session(request)
        assert denied is not None and claims is None

    with app.test_request_context("/auth/logout", headers={"Authorization": f"Bearer {token}"}):
        denied, claims = require_team_session(request)
        assert claims
        revoke(claims)

    assert parse_token(token) is None

    # Tiny stand-in for the Flask gate so CORS/auth wiring stays honest.
    @app.before_request
    def _gate():
        if request.path == "/auth/login":
            return None
        denied, _claims = require_team_session(request)
        return denied

    @app.post("/auth/login")
    def login():
        return handle_login(request)

    @app.get("/secure")
    def secure():
        return {"ok": True}

    blocked = client.get("/secure")
    assert blocked.status_code == 401, blocked.status_code
    authed = client.get("/secure", headers={"Authorization": f"Bearer {token}"})
    assert authed.status_code == 401, authed.status_code  # revoked

    fresh = client.post("/auth/login", json={"pin": "945762"})
    assert fresh.status_code == 200, fresh.status_code
    opened = client.get("/secure", headers={"Authorization": f"Bearer {fresh.get_json()['token']}"})
    assert opened.status_code == 200, opened.status_code

    import hashlib
    import hmac

    previous_env = os.environ.get("FLASK_ENV")
    previous_secret = os.environ.get("NEXUS_AUTH_SECRET")
    try:
        os.environ["FLASK_ENV"] = "production"
        os.environ["NEXUS_AUTH_SECRET"] = "short"
        try:
            assert_signing_secret()
            raise AssertionError("production accepted a short auth secret")
        except AuthConfigError:
            pass
        shared = "shared-across-gunicorn-workers"
        os.environ["NEXUS_AUTH_SECRET"] = shared
        assert_signing_secret()
        token, _exp = issue_token()
        payload, sig = token.rsplit(".", 1)
        secret = hashlib.sha256(f"nexus-auth|{shared}".encode("utf-8")).digest()
        expected = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
        assert sig == expected
        assert parse_token(token)
    finally:
        if previous_env is None:
            os.environ.pop("FLASK_ENV", None)
        else:
            os.environ["FLASK_ENV"] = previous_env
        if previous_secret is None:
            os.environ.pop("NEXUS_AUTH_SECRET", None)
        else:
            os.environ["NEXUS_AUTH_SECRET"] = previous_secret

    print("team_auth tests passed")


if __name__ == "__main__":
    main()
