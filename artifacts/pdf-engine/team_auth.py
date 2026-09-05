"""Team PIN login, HMAC sessions, and brute-force controls.

The PIN is never sent to the SPA bundle. Clients must POST /auth/login and
then send the signed Bearer token on every other engine route.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import threading
import time
from collections import defaultdict

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


def _signing_secret() -> bytes:
    env = os.environ.get("NEXUS_AUTH_SECRET", "").strip()
    if len(env) >= 16:
        return hashlib.sha256(f"nexus-auth|{env}".encode("utf-8")).digest()
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
