"""Render Postgres persistence for Saved Quotes and Generated Proposals."""

from __future__ import annotations

import os
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


def _connect():
    import psycopg

    url = database_url()
    if not url:
        raise RuntimeError("DATABASE_URL is required for quotes and proposals")
    return psycopg.connect(url, autocommit=True)


@contextmanager
def connection() -> Iterator[Any]:
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()


def migrate() -> None:
    with connection() as conn:
        for stmt in SCHEMA_SQL.split(";"):
            stmt = stmt.strip()
            if stmt:
                conn.execute(stmt)


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


def _jsonb(value: Any) -> Any:
    from psycopg.types.json import Jsonb

    if value is None:
        return None
    return Jsonb(value)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def quote_row_from_payload(payload: dict) -> dict[str, Any]:
    extra = {k: v for k, v in payload.items() if k not in QUOTE_COLUMNS}
    saved = _as_dt(payload.get("savedAt")) or _now()
    return {
        "id": str(payload.get("id") or "").strip(),
        "saved_at": saved,
        "reviewed_at": _as_dt(payload.get("reviewedAt")),
        "lead_key": payload.get("leadKey") or "",
        "lead_name": payload.get("leadName"),
        "reference_number": payload.get("referenceNumber"),
        "title": payload.get("title") or "",
        "vessel_type": payload.get("vesselType") or "",
        "event_type": payload.get("eventType") or "",
        "guest_count": "" if payload.get("guestCount") is None else str(payload.get("guestCount")),
        "event_date": payload.get("eventDate") or "",
        "grand_total": payload.get("grandTotal") or 0,
        "step": int(payload.get("step") or 0),
        "review_status": payload.get("reviewStatus") or "pending",
        "proposal_id": payload.get("proposalId") or None,
        "lead_json": payload.get("lead"),
        "data_json": payload.get("data") if isinstance(payload.get("data"), dict) else {},
        "extra_json": extra,
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
        "id": str(payload.get("id") or "").strip(),
        "created_at": created,
        "event_date": payload.get("eventDate") or "",
        "title": payload.get("title") or "",
        "filename": payload.get("filename"),
        "vessel_type": payload.get("vesselType") or "",
        "event_type": payload.get("eventType") or "",
        "guest_count": "" if payload.get("guestCount") is None else str(payload.get("guestCount")),
        "grand_total": payload.get("grandTotal") or 0,
        "lead_name": payload.get("leadName"),
        "lead_email": payload.get("leadEmail"),
        "lead_company": payload.get("leadCompany"),
        "reference_number": payload.get("referenceNumber"),
        "pdf": pdf,
        "extra_json": extra,
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
