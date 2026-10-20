"""Render Postgres persistence for Saved Quotes and Generated Proposals."""

from __future__ import annotations

import os
import re
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  saved_at TIMESTAMPTZ NOT NULL,
  reviewed_at TIMESTAMPTZ,
  lead_key TEXT,
  lead_name TEXT,
  reference_number TEXT,
  title TEXT,
  vessel_type TEXT,
  event_type TEXT,
  guest_count TEXT,
  event_date TEXT,
  grand_total DOUBLE PRECISION,
  step INTEGER,
  review_status TEXT NOT NULL CHECK (review_status IN ('pending','approved','disapproved')),
  proposal_id TEXT,
  lead_json JSONB,
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  extra_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  event_date TEXT,
  title TEXT,
  filename TEXT,
  vessel_type TEXT,
  event_type TEXT,
  guest_count TEXT,
  grand_total DOUBLE PRECISION,
  lead_name TEXT,
  lead_email TEXT,
  lead_company TEXT,
  reference_number TEXT,
  pdf BYTEA,
  extra_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS quotes_saved_at_idx ON quotes (saved_at DESC);
CREATE INDEX IF NOT EXISTS quotes_review_status_idx ON quotes (review_status);
CREATE INDEX IF NOT EXISTS proposals_created_at_idx ON proposals (created_at DESC);

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS proposal_id TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS lead_json JSONB;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS data_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS extra_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS pdf BYTEA;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS extra_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
"""

QUOTE_COLUMNS = {
    "id",
    "savedAt",
    "reviewedAt",
    "updatedAt",
    "leadKey",
    "leadName",
    "referenceNumber",
    "title",
    "vesselType",
    "eventType",
    "guestCount",
    "eventDate",
    "grandTotal",
    "step",
    "reviewStatus",
    "proposalId",
    "lead",
    "data",
}

PROPOSAL_COLUMNS = {
    "id",
    "createdAt",
    "eventDate",
    "title",
    "filename",
    "vesselType",
    "eventType",
    "guestCount",
    "grandTotal",
    "leadName",
    "leadEmail",
    "leadCompany",
    "referenceNumber",
    "pdfDataUrl",
    "hasPdf",
    "updatedAt",
}


def database_url() -> str:
    raw = (os.environ.get("DATABASE_URL") or "").strip()
    if raw.startswith("postgres://"):
        return "postgresql://" + raw[len("postgres://") :]
    return raw


_pool: Any = None
_pool_lock = threading.Lock()
POOL_MIN_SIZE = 2
POOL_MAX_SIZE = 10
_DOLLAR_RE = re.compile(r"\$[A-Za-z0-9_]*\$")


def split_sql_script(sql: str) -> list[str]:
    """Split a SQL script on statement boundaries.

    Semicolons inside quotes, comments, and dollar-quoted blocks stay in the
    statement. A raw ``str.split(';')`` would break those blocks.
    """
    statements: list[str] = []
    buf: list[str] = []
    i = 0
    length = len(sql)
    in_single = False
    in_double = False
    in_line = False
    in_block = False
    dollar: str | None = None
    while i < length:
        ch = sql[i]
        nxt = sql[i + 1] if i + 1 < length else ""
        if in_line:
            buf.append(ch)
            if ch == "\n":
                in_line = False
            i += 1
            continue
        if in_block:
            buf.append(ch)
            if ch == "*" and nxt == "/":
                buf.append(nxt)
                i += 2
                in_block = False
                continue
            i += 1
            continue
        if dollar is not None:
            if sql.startswith(dollar, i):
                buf.append(dollar)
                i += len(dollar)
                dollar = None
                continue
            buf.append(ch)
            i += 1
            continue
        if in_single:
            buf.append(ch)
            if ch == "'" and nxt == "'":
                buf.append(nxt)
                i += 2
                continue
            if ch == "'":
                in_single = False
            i += 1
            continue
        if in_double:
            buf.append(ch)
            if ch == '"':
                in_double = False
            i += 1
            continue
        if ch == "-" and nxt == "-":
            buf.append("--")
            i += 2
            in_line = True
            continue
        if ch == "/" and nxt == "*":
            buf.append("/*")
            i += 2
            in_block = True
            continue
        if ch == "'":
            in_single = True
            buf.append(ch)
            i += 1
            continue
        if ch == '"':
            in_double = True
            buf.append(ch)
            i += 1
            continue
        if ch == "$":
            match = _DOLLAR_RE.match(sql, i)
            if match:
                dollar = match.group(0)
                buf.append(dollar)
                i += len(dollar)
                continue
        if ch == ";":
            stmt = "".join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements


_pool_pid: int | None = None
_schema_pid: int | None = None
_schema_lock = threading.Lock()


def _get_pool() -> Any:
    """Open the pool in the current process.

    gunicorn --preload imports the app in the master, then forks the worker.
    A psycopg pool is not fork-safe: the child's copy has no maintenance
    threads, so every checkout waits until timeout and the request becomes a
    500. Drop an inherited pool without closing it (those sockets still belong
    to the parent) and open a new one after the fork.
    """
    global _pool, _pool_pid
    url = database_url()
    if not url:
        raise RuntimeError("DATABASE_URL is required for quotes and proposals")
    pid = os.getpid()
    with _pool_lock:
        if _pool is not None and _pool_pid != pid:
            _pool = None
        if _pool is None:
            from psycopg_pool import ConnectionPool

            _pool = ConnectionPool(
                conninfo=url,
                min_size=POOL_MIN_SIZE,
                max_size=POOL_MAX_SIZE,
                kwargs={"autocommit": False},
                open=True,
                name="nexus-workspace",
            )
            _pool_pid = pid
        return _pool


def migrate() -> None:
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.transaction():
            for stmt in split_sql_script(SCHEMA_SQL):
                conn.execute(stmt)


def _ensure_schema() -> None:
    """Create tables on first use inside this process, not at import."""
    global _schema_pid
    pid = os.getpid()
    if _schema_pid == pid:
        return
    with _schema_lock:
        if _schema_pid == pid:
            return
        migrate()
        _schema_pid = pid


@contextmanager
def connection() -> Iterator[Any]:
    _ensure_schema()
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.transaction():
            yield conn


def _as_dt(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _iso(value: Any) -> str | None:
    dt = _as_dt(value)
    if not dt:
        return None
    utc = dt.astimezone(timezone.utc)
    return utc.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _json_safe(value: Any) -> Any:
    """Values Postgres will accept in text and jsonb.

    Sheet notes can contain NUL bytes and lone surrogates. jsonb rejects both,
    and that exception becomes a blank HTTP 500 on quote save.
    """
    if isinstance(value, str):
        return value.replace("\x00", "").encode("utf-8", "replace").decode("utf-8")
    if isinstance(value, dict):
        return {_json_safe(str(key)): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, float) and (value != value or value in (float("inf"), float("-inf"))):
        return None
    return value


def _text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    return str(_json_safe(value))


def _step(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _jsonb(value: Any) -> Any:
    from psycopg.types.json import Jsonb

    if value is None:
        return None
    return Jsonb(_json_safe(value))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def quote_row_from_payload(payload: dict) -> dict[str, Any]:
    extra = {k: v for k, v in payload.items() if k not in QUOTE_COLUMNS}
    saved = _as_dt(payload.get("savedAt")) or _now()
    return {
        "id": _text(payload.get("id")).strip(),
        "saved_at": saved,
        "reviewed_at": _as_dt(payload.get("reviewedAt")),
        "lead_key": _text(payload.get("leadKey")),
        "lead_name": None if payload.get("leadName") is None else _text(payload.get("leadName")),
        "reference_number": None if payload.get("referenceNumber") is None else _text(payload.get("referenceNumber")),
        "title": _text(payload.get("title")),
        "vessel_type": _text(payload.get("vesselType")),
        "event_type": _text(payload.get("eventType")),
        "guest_count": "" if payload.get("guestCount") is None else _text(payload.get("guestCount")),
        "event_date": _text(payload.get("eventDate")),
        "grand_total": payload.get("grandTotal") or 0,
        "step": _step(payload.get("step")),
        "review_status": _text(payload.get("reviewStatus"), "pending") or "pending",
        "proposal_id": None if not payload.get("proposalId") else _text(payload.get("proposalId")),
        "lead_json": _json_safe(payload.get("lead")),
        "data_json": _json_safe(payload.get("data")) if isinstance(payload.get("data"), dict) else {},
        "extra_json": _json_safe(extra),
        "updated_at": _now(),
        "deleted_at": None,
    }


def quote_payload_from_row(row: dict) -> dict:
    extra = row.get("extra_json") if isinstance(row.get("extra_json"), dict) else {}
    payload = {
        **extra,
        "id": row["id"],
        "savedAt": _iso(row.get("saved_at")) or "",
        "leadKey": row.get("lead_key") or "",
        "leadName": row.get("lead_name") or "",
        "referenceNumber": row.get("reference_number") or "",
        "title": row.get("title") or "",
        "vesselType": row.get("vessel_type") or "",
        "eventType": row.get("event_type") or "",
        "guestCount": row.get("guest_count") or "",
        "eventDate": row.get("event_date") or "",
        "grandTotal": float(row.get("grand_total") or 0),
        "step": int(row.get("step") or 0),
        "data": row.get("data_json") if isinstance(row.get("data_json"), dict) else {},
        "lead": row.get("lead_json"),
        "reviewStatus": row.get("review_status") or "pending",
    }
    if row.get("proposal_id"):
        payload["proposalId"] = row["proposal_id"]
    reviewed = _iso(row.get("reviewed_at"))
    if reviewed:
        payload["reviewedAt"] = reviewed
    updated = _iso(row.get("updated_at"))
    if updated:
        payload["updatedAt"] = updated
    return payload


def proposal_row_from_payload(payload: dict, pdf: bytes | None) -> dict[str, Any]:
    extra = {k: v for k, v in payload.items() if k not in PROPOSAL_COLUMNS}
    created = _as_dt(payload.get("createdAt")) or _now()
    return {
        "id": _text(payload.get("id")).strip(),
        "created_at": created,
        "event_date": _text(payload.get("eventDate")),
        "title": _text(payload.get("title")),
        "filename": None if payload.get("filename") is None else _text(payload.get("filename")),
        "vessel_type": _text(payload.get("vesselType")),
        "event_type": _text(payload.get("eventType")),
        "guest_count": "" if payload.get("guestCount") is None else _text(payload.get("guestCount")),
        "grand_total": payload.get("grandTotal") or 0,
        "lead_name": None if payload.get("leadName") is None else _text(payload.get("leadName")),
        "lead_email": None if payload.get("leadEmail") is None else _text(payload.get("leadEmail")),
        "lead_company": None if payload.get("leadCompany") is None else _text(payload.get("leadCompany")),
        "reference_number": None if payload.get("referenceNumber") is None else _text(payload.get("referenceNumber")),
        "pdf": pdf,
        "extra_json": _json_safe(extra),
        "updated_at": _now(),
        "deleted_at": None,
    }


def proposal_payload_from_row(row: dict, include_pdf: bool, encode_pdf) -> dict:
    extra = row.get("extra_json") if isinstance(row.get("extra_json"), dict) else {}
    pdf = row.get("pdf")
    has_pdf = bool(pdf)
    payload = {
        **extra,
        "id": row["id"],
        "createdAt": _iso(row.get("created_at")) or "",
        "eventDate": row.get("event_date") or "",
        "title": row.get("title") or "",
        "filename": row.get("filename") or "",
        "vesselType": row.get("vessel_type") or "",
        "eventType": row.get("event_type") or "",
        "guestCount": row.get("guest_count") or "",
        "grandTotal": float(row.get("grand_total") or 0),
        "leadName": row.get("lead_name") or "",
        "leadEmail": row.get("lead_email") or "",
        "leadCompany": row.get("lead_company") or "",
        "referenceNumber": row.get("reference_number") or "",
        "hasPdf": has_pdf,
    }
    updated = _iso(row.get("updated_at"))
    if updated:
        payload["updatedAt"] = updated
    if include_pdf and pdf:
        payload["pdfDataUrl"] = encode_pdf(bytes(pdf))
    return payload


def fetch_all(conn, sql: str, params: tuple = ()) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        cols = [d.name for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def fetch_one(conn, sql: str, params: tuple = ()) -> dict | None:
    rows = fetch_all(conn, sql, params)
    return rows[0] if rows else None
