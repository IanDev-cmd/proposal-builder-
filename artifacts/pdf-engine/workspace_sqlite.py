"""Local SQLite store for Saved Quotes and Generated Proposals.

Selected when DATABASE_URL is unset and WORKSPACE_STORE=sqlite.
The file defaults to %LOCALAPPDATA%\\WEOTT\\Nexus\\workspace.sqlite.
WORKSPACE_DATA_DIR overrides the directory that contains workspace.sqlite.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

import workspace_pg as pg

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None

_SCHEMA = """
CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    saved_at TEXT NOT NULL,
    reviewed_at TEXT,
    lead_key TEXT,
    lead_name TEXT,
    reference_number TEXT,
    title TEXT,
    vessel_type TEXT,
    event_type TEXT,
    guest_count TEXT,
    event_date TEXT,
    grand_total REAL,
    step INTEGER,
    review_status TEXT NOT NULL CHECK (review_status IN ('pending','approved','disapproved')),
    proposal_id TEXT,
    lead_json TEXT,
    data_json TEXT NOT NULL DEFAULT '{}',
    extra_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    event_date TEXT,
    title TEXT,
    filename TEXT,
    vessel_type TEXT,
    event_type TEXT,
    guest_count TEXT,
    grand_total REAL,
    lead_name TEXT,
    lead_email TEXT,
    lead_company TEXT,
    reference_number TEXT,
    pdf BLOB,
    extra_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS quotes_saved_at_idx ON quotes (saved_at DESC);
CREATE INDEX IF NOT EXISTS quotes_review_status_idx ON quotes (review_status);
CREATE INDEX IF NOT EXISTS quotes_id_updated_status_idx ON quotes (id, updated_at, review_status);
CREATE INDEX IF NOT EXISTS quotes_active_saved_idx ON quotes (deleted_at, saved_at);
CREATE INDEX IF NOT EXISTS proposals_created_at_idx ON proposals (created_at DESC);
CREATE INDEX IF NOT EXISTS proposals_id_created_idx ON proposals (id, created_at);
CREATE INDEX IF NOT EXISTS proposals_active_created_idx ON proposals (deleted_at, created_at);
"""


def database_path() -> Path:
    override = (os.environ.get("WORKSPACE_DATA_DIR") or "").strip()
    if override:
        base = Path(override)
    else:
        local = (os.environ.get("LOCALAPPDATA") or "").strip()
        base = Path(local) / "WEOTT" / "Nexus" if local else Path.home() / "AppData" / "Local" / "WEOTT" / "Nexus"
    return base / "workspace.sqlite"


def _bind(value: Any) -> Any:
    if isinstance(value, datetime):
        return pg._iso(value)
    if isinstance(value, (dict, list)):
        return json.dumps(pg._json_safe(value), ensure_ascii=False)
    return value


def _load_json(value: Any) -> Any:
    if value is None or value == "":
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    return value


def _migrate(conn: sqlite3.Connection) -> None:
    conn.executescript(_SCHEMA)


def connection() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            path = database_path()
            path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(str(path), check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("PRAGMA busy_timeout=2000")
            conn.execute("PRAGMA temp_store=MEMORY")
            _migrate(conn)
            conn.commit()
            _conn = conn
        return _conn


def migrate() -> None:
    connection()


def _quote_row_dict(row: sqlite3.Row) -> dict:
    data = dict(row)
    data["lead_json"] = _load_json(data.get("lead_json"))
    data["data_json"] = _load_json(data.get("data_json")) or {}
    data["extra_json"] = _load_json(data.get("extra_json")) or {}
    return data


def _proposal_row_dict(row: sqlite3.Row) -> dict:
    data = dict(row)
    data["extra_json"] = _load_json(data.get("extra_json")) or {}
    pdf = data.get("pdf")
    if isinstance(pdf, str):
        data["pdf"] = pdf.encode("utf-8")
    return data


def quote_is_deleted(quote_id: str) -> bool:
    qid = str(quote_id or "").strip()
    if not qid:
        return False
    conn = connection()
    with _lock:
        row = conn.execute("SELECT deleted_at FROM quotes WHERE id = ?", (qid,)).fetchone()
    return bool(row and row["deleted_at"])


def list_quotes() -> list[dict]:
    conn = connection()
    with _lock:
        rows = conn.execute(
            """
            SELECT id, saved_at, reviewed_at, lead_key, lead_name, reference_number, title,
                   vessel_type, event_type, guest_count, event_date, grand_total, step,
                   review_status, proposal_id, lead_json, data_json, extra_json, updated_at
            FROM quotes
            WHERE deleted_at IS NULL
            ORDER BY saved_at DESC
            """
        ).fetchall()
    return [pg.quote_payload_from_row(_quote_row_dict(row)) for row in rows]


def get_quote(quote_id: str) -> dict | None:
    qid = str(quote_id or "").strip()
    if not qid:
        return None
    conn = connection()
    with _lock:
        row = conn.execute(
            """
            SELECT id, saved_at, reviewed_at, lead_key, lead_name, reference_number, title,
                   vessel_type, event_type, guest_count, event_date, grand_total, step,
                   review_status, proposal_id, lead_json, data_json, extra_json, updated_at
            FROM quotes
            WHERE id = ? AND deleted_at IS NULL
            """,
            (qid,),
        ).fetchone()
    if not row:
        return None
    return pg.quote_payload_from_row(_quote_row_dict(row))


def put_quote(payload: dict) -> dict:
    row = pg.quote_row_from_payload(payload)
    qid = row["id"]
    conn = connection()
    with _lock:
        existing = conn.execute("SELECT deleted_at FROM quotes WHERE id = ?", (qid,)).fetchone()
        if existing and existing["deleted_at"]:
            raise ValueError("quote was deleted")
        conn.execute(
            """
            INSERT INTO quotes (
              id, saved_at, reviewed_at, lead_key, lead_name, reference_number, title,
              vessel_type, event_type, guest_count, event_date, grand_total, step,
              review_status, proposal_id, lead_json, data_json, extra_json, updated_at, deleted_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, NULL
            )
            ON CONFLICT (id) DO UPDATE SET
              saved_at = excluded.saved_at,
              reviewed_at = excluded.reviewed_at,
              lead_key = excluded.lead_key,
              lead_name = excluded.lead_name,
              reference_number = excluded.reference_number,
              title = excluded.title,
              vessel_type = excluded.vessel_type,
              event_type = excluded.event_type,
              guest_count = excluded.guest_count,
              event_date = excluded.event_date,
              grand_total = excluded.grand_total,
              step = excluded.step,
              review_status = excluded.review_status,
              proposal_id = excluded.proposal_id,
              lead_json = excluded.lead_json,
              data_json = excluded.data_json,
              extra_json = excluded.extra_json,
              updated_at = excluded.updated_at
            WHERE quotes.deleted_at IS NULL
            """,
            (
                row["id"],
                _bind(row["saved_at"]),
                _bind(row["reviewed_at"]),
                row["lead_key"],
                row["lead_name"],
                row["reference_number"],
                row["title"],
                row["vessel_type"],
                row["event_type"],
                row["guest_count"],
                row["event_date"],
                row["grand_total"],
                row["step"],
                row["review_status"],
                row["proposal_id"],
                _bind(row["lead_json"]),
                _bind(row["data_json"] if row["data_json"] is not None else {}),
                _bind(row["extra_json"] if row["extra_json"] is not None else {}),
                _bind(row["updated_at"]),
            ),
        )
        conn.commit()
    saved = get_quote(qid)
    return saved or payload


def delete_quote(quote_id: str) -> bool:
    qid = str(quote_id or "").strip()
    if not qid:
        return False
    now = _bind(pg._now())
    conn = connection()
    with _lock:
        cur = conn.execute(
            """
            UPDATE quotes SET deleted_at = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL
            """,
            (now, now, qid),
        )
        conn.commit()
        return cur.rowcount > 0


def clear_quotes() -> int:
    conn = connection()
    with _lock:
        cur = conn.execute("DELETE FROM quotes")
        conn.commit()
        return cur.rowcount or 0


def list_proposals(include_pdf: bool = False) -> list[dict]:
    conn = connection()
    with _lock:
        if include_pdf:
            rows = conn.execute(
                """
                SELECT id, created_at, event_date, title, filename, vessel_type, event_type,
                       guest_count, grand_total, lead_name, lead_email, lead_company,
                       reference_number, extra_json, updated_at, pdf
                FROM proposals
                WHERE deleted_at IS NULL
                ORDER BY created_at DESC
                """
            ).fetchall()
        else:
            # Do not select the PDF blob. A list of 60+ proposals was reading every file
            # before the page could draw a single row.
            rows = conn.execute(
                """
                SELECT id, created_at, event_date, title, filename, vessel_type, event_type,
                       guest_count, grand_total, lead_name, lead_email, lead_company,
                       reference_number, extra_json, updated_at,
                       CASE WHEN pdf IS NULL THEN 0 ELSE 1 END AS has_pdf
                FROM proposals
                WHERE deleted_at IS NULL
                ORDER BY created_at DESC
                """
            ).fetchall()
    out = []
    for raw in rows:
        item = _proposal_row_dict(raw)
        has_pdf = bool(item.get("has_pdf") if "has_pdf" in item else item.get("pdf"))
        if not include_pdf:
            item["pdf"] = None
        payload = pg.proposal_payload_from_row(item, include_pdf=include_pdf, encode_pdf=_encode_pdf)
        payload["hasPdf"] = has_pdf
        if not include_pdf:
            payload.pop("pdfDataUrl", None)
        out.append(payload)
    return out


def get_proposal(proposal_id: str) -> dict | None:
    pid = str(proposal_id or "").strip()
    if not pid:
        return None
    conn = connection()
    with _lock:
        row = conn.execute(
            """
            SELECT id, created_at, event_date, title, filename, vessel_type, event_type,
                   guest_count, grand_total, lead_name, lead_email, lead_company,
                   reference_number, extra_json, pdf, updated_at
            FROM proposals
            WHERE id = ? AND deleted_at IS NULL
            """,
            (pid,),
        ).fetchone()
    if not row:
        return None
    return pg.proposal_payload_from_row(_proposal_row_dict(row), include_pdf=True, encode_pdf=_encode_pdf)


def put_proposal(payload: dict, raw: bytes | None) -> dict:
    proposal_id = str(payload.get("id") or "").strip()
    row = pg.proposal_row_from_payload(payload, raw)
    conn = connection()
    with _lock:
        if not raw:
            prev = conn.execute("SELECT pdf FROM proposals WHERE id = ?", (proposal_id,)).fetchone()
            if prev and prev["pdf"]:
                row["pdf"] = prev["pdf"]
        conn.execute(
            """
            INSERT INTO proposals (
              id, created_at, event_date, title, filename, vessel_type, event_type,
              guest_count, grand_total, lead_name, lead_email, lead_company,
              reference_number, pdf, extra_json, updated_at, deleted_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, NULL
            )
            ON CONFLICT (id) DO UPDATE SET
              created_at = excluded.created_at,
              event_date = excluded.event_date,
              title = excluded.title,
              filename = excluded.filename,
              vessel_type = excluded.vessel_type,
              event_type = excluded.event_type,
              guest_count = excluded.guest_count,
              grand_total = excluded.grand_total,
              lead_name = excluded.lead_name,
              lead_email = excluded.lead_email,
              lead_company = excluded.lead_company,
              reference_number = excluded.reference_number,
              pdf = COALESCE(excluded.pdf, proposals.pdf),
              extra_json = excluded.extra_json,
              updated_at = excluded.updated_at,
              deleted_at = NULL
            """,
            (
                row["id"],
                _bind(row["created_at"]),
                row["event_date"],
                row["title"],
                row["filename"],
                row["vessel_type"],
                row["event_type"],
                row["guest_count"],
                row["grand_total"],
                row["lead_name"],
                row["lead_email"],
                row["lead_company"],
                row["reference_number"],
                row["pdf"],
                _bind(row["extra_json"] if row["extra_json"] is not None else {}),
                _bind(row["updated_at"]),
            ),
        )
        conn.commit()
    saved = get_proposal(proposal_id)
    if saved:
        saved.pop("pdfDataUrl", None)
        return saved
    return {**payload, "hasPdf": bool(raw or row.get("pdf"))}


def delete_proposal(proposal_id: str) -> bool:
    pid = str(proposal_id or "").strip()
    if not pid:
        return False
    now = _bind(pg._now())
    conn = connection()
    with _lock:
        cur = conn.execute(
            """
            UPDATE proposals SET deleted_at = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL
            """,
            (now, now, pid),
        )
        conn.commit()
        return cur.rowcount > 0


def clear_proposals() -> int:
    conn = connection()
    with _lock:
        cur = conn.execute("DELETE FROM proposals")
        conn.commit()
        return cur.rowcount or 0


def _encode_pdf(raw: bytes) -> str:
    import base64

    return "data:application/pdf;base64," + base64.b64encode(raw).decode("ascii")
