"""Team PIN login, HMAC sessions, and brute-force controls.

The PIN is never sent to the SPA bundle. Clients must POST /auth/login and
then send the signed Bearer token on every other engine route.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
import secrets
import threading
import time
from collections import defaultdict

log = logging.getLogger("nexus.team_auth")

from flask import Request, jsonify

PIN_LENGTH = 6
SESSION_TTL_SEC = 2 * 60 * 60
SESSION_MAX_SEC = 8 * 60 * 60
LOGIN_BODY_MAX = 512
FAIL_WINDOW_SEC = 15 * 60
MAX_FAILS = 5
LOCKOUT_SEC = 15 * 60
HOUR_WINDOW_SEC = 60 * 60
MAX_ATTEMPTS_PER_HOUR = 30
MIN_FAIL_DELAY_SEC = 0.4


def _delay():
    if os.environ.get("NEXUS_AUTH_TEST") == "1":
        return
    time.sleep(MIN_FAIL_DELAY_SEC)

_PIN_RE = re.compile(rf"^\d{{{PIN_LENGTH}}}$")
_JTI_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
_TOKEN_RE = re.compile(r"^[A-Za-z0-9._-]{20,220}$")
_IP_RE = re.compile(r"^[A-Fa-f0-9:.]+$")

_lock = threading.Lock()
_fail_times: dict[str, list[float]] = defaultdict(list)
_lock_until: dict[str, float] = {}
_attempt_times: dict[str, list[float]] = defaultdict(list)
_revoked: dict[str, float] = {}
_BOOT_SECRET = secrets.token_bytes(32)
_PRUNE_INTERVAL_SEC = 60.0


class AuthConfigError(RuntimeError):
    """Production started without a shared HMAC secret."""


def _production() -> bool:
    return os.environ.get("FLASK_ENV", "").strip().lower() == "production"


def assert_signing_secret() -> None:
    """Fail at startup in production so Gunicorn workers cannot each invent a secret."""
    env = os.environ.get("NEXUS_AUTH_SECRET", "").strip()
    if _production() and len(env) < 16:
        raise AuthConfigError(
            "NEXUS_AUTH_SECRET must be set to at least 16 characters when FLASK_ENV=production"
        )


def _signing_secret() -> bytes:
    assert_signing_secret()
    env = os.environ.get("NEXUS_AUTH_SECRET", "").strip()
    if len(env) >= 16:
        return hashlib.sha256(f"nexus-auth|{env}".encode("utf-8")).digest()
    if _production():
        raise AuthConfigError(
            "NEXUS_AUTH_SECRET must be set to at least 16 characters when FLASK_ENV=production"
        )
    log.warning(
        "NEXUS_AUTH_SECRET is missing or shorter than 16 characters; using a process-local secret"
    )
    return _BOOT_SECRET


def expected_pin() -> str | None:
    raw = os.environ.get("NEXUS_TEAM_PASSWORD", "").strip()
    return raw if _PIN_RE.fullmatch(raw) else None


def client_ip(req: Request) -> str:
    addr = (req.remote_addr or "unknown").strip()
    if _IP_RE.fullmatch(addr) and len(addr) <= 64:
        return addr
    return "unknown"


def _prune_times(times: list[float], now: float, window: float) -> list[float]:
    cutoff = now - window
    return [t for t in times if t > cutoff]


def prune_attempt_maps(now: float | None = None) -> None:
    """Drop expired lockout counters so failed logins cannot grow memory without bound."""
    current = time.time() if now is None else now
    stale_fail = [ip for ip, times in _fail_times.items() if not _prune_times(times, current, FAIL_WINDOW_SEC)]
    for ip in stale_fail:
        _fail_times.pop(ip, None)
    for ip, times in list(_fail_times.items()):
        _fail_times[ip] = _prune_times(times, current, FAIL_WINDOW_SEC)
    stale_attempt = [
        ip for ip, times in _attempt_times.items() if not _prune_times(times, current, HOUR_WINDOW_SEC)
    ]
    for ip in stale_attempt:
        _attempt_times.pop(ip, None)
    for ip, times in list(_attempt_times.items()):
        _attempt_times[ip] = _prune_times(times, current, HOUR_WINDOW_SEC)
    for ip, until in list(_lock_until.items()):
        if until <= current:
            _lock_until.pop(ip, None)


def _prune_loop() -> None:
    while True:
        time.sleep(_PRUNE_INTERVAL_SEC)
        with _lock:
            prune_attempt_maps()


def trusted_proxy_hops() -> int:
    """How many ingress proxies may append X-Forwarded-For.

    Render has one proxy. A larger hop count lets a client prepend a fake
    address and bypass the login lockout.
    """
    raw = os.environ.get("NEXUS_PROXY_HOPS", "1").strip()
    try:
        hops = int(raw)
    except ValueError:
        return 1
    if hops < 1:
        return 1
    return hops


def require_bulk_erase(req: Request):
    """Collection DELETE is an admin action, not a normal team-session action."""
    secret = os.environ.get("NEXUS_ADMIN_TOKEN", "").strip()
    if len(secret) < 16:
        body = jsonify(error="Bulk erase is disabled.")
        body.status_code = 403
        return body
    presented = (req.headers.get("X-Nexus-Admin-Token") or "").strip()
    if not presented or not hmac.compare_digest(presented, secret):
        body = jsonify(error="Admin authentication required.")
        body.status_code = 403
        return body
    return None


def _is_locked(ip: str, now: float) -> bool:
    until = _lock_until.get(ip, 0)
    if until <= now:
        if ip in _lock_until:
            _lock_until.pop(ip, None)
        return False
    return True


def _record_fail(ip: str, now: float) -> bool:
    fails = _prune_times(_fail_times[ip], now, FAIL_WINDOW_SEC)
    fails.append(now)
    _fail_times[ip] = fails
    attempts = _prune_times(_attempt_times[ip], now, HOUR_WINDOW_SEC)
    attempts.append(now)
    _attempt_times[ip] = attempts
    if len(fails) >= MAX_FAILS or len(attempts) > MAX_ATTEMPTS_PER_HOUR:
        _lock_until[ip] = now + LOCKOUT_SEC
        return True
    return False


def _clear_fails(ip: str) -> None:
    _fail_times.pop(ip, None)
    _lock_until.pop(ip, None)


def _sign(payload: str) -> str:
    return hmac.new(_signing_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def issue_token(jti: str | None = None, iat: int | None = None, exp: int | None = None) -> tuple[str, int]:
    now = int(time.time())
    jti = jti or secrets.token_urlsafe(18)
    iat = iat or now
    exp = exp or (now + SESSION_TTL_SEC)
    payload = f"{jti}.{iat}.{exp}"
    return f"{payload}.{_sign(payload)}", exp


def parse_token(token: str | None) -> dict | None:
    if not token or not _TOKEN_RE.fullmatch(token) or token.count(".") != 3:
        return None
    jti, iat_s, exp_s, sig = token.split(".", 3)
    if not _JTI_RE.fullmatch(jti):
        return None
    try:
        iat = int(iat_s)
        exp = int(exp_s)
    except ValueError:
        return None
    payload = f"{jti}.{iat}.{exp}"
    if not hmac.compare_digest(_sign(payload), sig):
        return None
    now = int(time.time())
    if now > exp or now < iat - 30:
        return None
    if now - iat > SESSION_MAX_SEC:
        return None
    with _lock:
        revoked_until = _revoked.get(jti)
        if revoked_until and now < revoked_until:
            return None
        stale = [key for key, until in _revoked.items() if until <= now]
        for key in stale:
            _revoked.pop(key, None)
    return {"jti": jti, "iat": iat, "exp": exp}


def refresh_session(claims: dict) -> tuple[str, int] | None:
    now = int(time.time())
    iat = int(claims["iat"])
    if now - iat > SESSION_MAX_SEC:
        return None
    exp = min(now + SESSION_TTL_SEC, iat + SESSION_MAX_SEC)
    if exp <= now:
        return None
    token, _ = issue_token(jti=str(claims["jti"]), iat=iat, exp=exp)
    return token, exp - now


def revoke(claims: dict) -> None:
    jti = str(claims.get("jti") or "")
    exp = int(claims.get("exp") or 0)
    if not jti:
        return
    with _lock:
        _revoked[jti] = max(exp, int(time.time()) + SESSION_TTL_SEC)


def bearer_token(req: Request) -> str | None:
    header = req.headers.get("Authorization") or ""
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not _TOKEN_RE.fullmatch(token):
        return None
    return token


def require_team_session(req: Request):
    claims = parse_token(bearer_token(req))
    if not claims:
        body = jsonify(error="Authentication required.")
        body.status_code = 401
        body.headers["WWW-Authenticate"] = "Bearer"
        return body, claims
    return None, claims


def handle_login(req: Request):
    ip = client_ip(req)
    now = time.time()
    length = req.content_length
    if length is not None and length > LOGIN_BODY_MAX:
        return jsonify(error="Invalid request."), 413
    ctype = (req.mimetype or "").split(";")[0].strip().lower()
    if ctype != "application/json":
        return jsonify(error="Invalid request."), 415

    with _lock:
        locked = _is_locked(ip, now)
    if locked:
        _delay()
        return jsonify(error="Too many attempts. Try again later."), 429

    data = req.get_json(silent=True)
    if not isinstance(data, dict) or set(data.keys()) - {"pin"}:
        _delay()
        with _lock:
            locked = _record_fail(ip, time.time())
        if locked:
            return jsonify(error="Too many attempts. Try again later."), 429
        return jsonify(error="Invalid request."), 400

    pin = str(data.get("pin") or "")
    expected = expected_pin()
    _delay()
    if expected is None or not _PIN_RE.fullmatch(pin) or not hmac.compare_digest(pin, expected):
        with _lock:
            locked = _record_fail(ip, time.time())
        if locked:
            return jsonify(error="Too many attempts. Try again later."), 429
        return jsonify(error="Incorrect PIN."), 401

    with _lock:
        _clear_fails(ip)
    token, _exp = issue_token()
    return jsonify(ok=True, token=token, expiresIn=SESSION_TTL_SEC)


assert_signing_secret()
threading.Thread(target=_prune_loop, name="nexus-auth-prune", daemon=True).start()
