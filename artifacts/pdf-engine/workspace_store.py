"""Shared workspace: Saved Quotes and Generated Proposals in Render Postgres.

Cost Mother catalog stays on disk (rebuilt from Apps Script). Quotes and
proposal PDFs use DATABASE_URL. Tests may set WORKSPACE_STORE=memory.
"""

from __future__ import annotations

import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import workspace_pg as pg

_BASE = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("WORKSPACE_DATA_DIR", str(_BASE / "data" / "workspace")))

REVIEW_STATUSES = {"pending", "approved", "disapproved"}

_MEMORY_QUOTES: dict[str, dict] = {}
_MEMORY_PROPOSALS: dict[str, dict] = {}


def _use_memory() -> bool:
    return (os.environ.get("WORKSPACE_STORE") or "").strip().lower() == "memory"


def _use_postgres() -> bool:
    return bool(pg.database_url()) and not _use_memory()


def reset_memory() -> None:
    _MEMORY_QUOTES.clear()
    _MEMORY_PROPOSALS.clear()


def init_workspace() -> None:
    """Create quote/proposal tables when DATABASE_URL is set."""
    if _use_postgres():
        pg.migrate()


def _ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _write_json(path: Path, payload: dict) -> None:
    _ensure_dirs()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name, dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            import json

            json.dump(payload, handle, ensure_ascii=False)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _read_json(path: Path) -> dict | None:
    import json

    try:
        with path.open(encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else None
    except OSError:
        return None
    except json.JSONDecodeError:
        return None


def _decode_pdf(data_url: str) -> bytes | None:
    if not isinstance(data_url, str) or "base64," not in data_url:
        return None
    try:
        import base64

        b64 = data_url.split("base64,", 1)[1]
        return base64.b64decode(b64)
    except Exception:
        return None


def _encode_pdf(raw: bytes) -> str:
    import base64

    return "data:application/pdf;base64," + base64.b64encode(raw).decode("ascii")


def _normalize_review(payload: dict, existing: dict | None = None) -> dict:
    quote_id = str(payload.get("id") or "").strip()
    if existing is None and quote_id:
        existing = get_quote(quote_id)
    raw = payload.get("reviewStatus")
    if raw is None and existing:
        raw = existing.get("reviewStatus")
    status = str(raw or "pending").strip().lower()
    if status not in REVIEW_STATUSES:
        status = "pending"
    payload["reviewStatus"] = status
    reviewed_at = payload.get("reviewedAt")
    if reviewed_at in (None, "") and existing:
        reviewed_at = existing.get("reviewedAt")
    if reviewed_at:
        payload["reviewedAt"] = reviewed_at
    elif "reviewedAt" in payload and not payload.get("reviewedAt"):
        payload.pop("reviewedAt", None)
    if existing:
        prev_data = existing.get("data")
        next_data = payload.get("data")
        if (not isinstance(next_data, dict) or not next_data) and isinstance(prev_data, dict) and prev_data:
            payload["data"] = prev_data
        if payload.get("savedAt") in (None, "") and existing.get("savedAt"):
            payload["savedAt"] = existing["savedAt"]
        prev_review = existing.get("reviewedAt") or ""
        next_review = payload.get("reviewedAt") or ""
        if prev_review > next_review:
            payload["reviewStatus"] = existing.get("reviewStatus") or payload["reviewStatus"]
            payload["reviewedAt"] = existing.get("reviewedAt")
    return payload


def _require_store() -> None:
    if _use_memory() or _use_postgres():
        return
    raise RuntimeError("DATABASE_URL is required for quotes and proposals")


def list_quotes() -> list[dict]:
    _require_store()
    if _use_memory():
        rows = [dict(r) for r in _MEMORY_QUOTES.values() if not r.get("_deleted")]
        out = [_normalize_review(row, existing=row) for row in rows]
        out.sort(key=lambda r: str(r.get("savedAt") or ""), reverse=True)
        return out
    with pg.connection() as conn:
        rows = pg.fetch_all(
            conn,
            """
            SELECT id, saved_at, reviewed_at, lead_key, lead_name, reference_number, title,
                   vessel_type, event_type, guest_count, event_date, grand_total, step,
                   review_status, proposal_id, lead_json, data_json, extra_json
            FROM quotes
            WHERE deleted_at IS NULL
            ORDER BY saved_at DESC
            """,
        )
    return [pg.quote_payload_from_row(row) for row in rows]


def get_quote(quote_id: str) -> dict | None:
    _require_store()
    qid = str(quote_id or "").strip()
    if not qid:
        return None
    if _use_memory():
        row = _MEMORY_QUOTES.get(qid)
        if not row or row.get("_deleted"):
            return None
        return _normalize_review(dict(row), existing=row)
    with pg.connection() as conn:
        row = pg.fetch_one(
            conn,
            """
            SELECT id, saved_at, reviewed_at, lead_key, lead_name, reference_number, title,
                   vessel_type, event_type, guest_count, event_date, grand_total, step,
                   review_status, proposal_id, lead_json, data_json, extra_json
            FROM quotes
            WHERE id = %s AND deleted_at IS NULL
            """,
            (qid,),
        )
    if not row:
        return None
    return pg.quote_payload_from_row(row)


def put_quote(payload: dict) -> dict:
    quote_id = str(payload.get("id") or "").strip()
    if not quote_id:
        raise ValueError("quote id is required")
    try:
        payload["grandTotal"] = float(payload.get("grandTotal") or 0)
    except (TypeError, ValueError):
        payload["grandTotal"] = 0.0
    payload["id"] = quote_id
    payload = _normalize_review(payload)
    _require_store()
    if _use_memory():
        payload.pop("_deleted", None)
        _MEMORY_QUOTES[quote_id] = dict(payload)
        return dict(payload)
    row = pg.quote_row_from_payload(payload)
    with pg.connection() as conn:
        conn.execute(
            """
            INSERT INTO quotes (
              id, saved_at, reviewed_at, lead_key, lead_name, reference_number, title,
              vessel_type, event_type, guest_count, event_date, grand_total, step,
              review_status, proposal_id, lead_json, data_json, extra_json, updated_at, deleted_at
            ) VALUES (
              %s, %s, %s, %s, %s, %s, %s,
              %s, %s, %s, %s, %s, %s,
              %s, %s, %s, %s, %s, %s, NULL
            )
            ON CONFLICT (id) DO UPDATE SET
              saved_at = EXCLUDED.saved_at,
              reviewed_at = EXCLUDED.reviewed_at,
              lead_key = EXCLUDED.lead_key,
              lead_name = EXCLUDED.lead_name,
              reference_number = EXCLUDED.reference_number,
              title = EXCLUDED.title,
              vessel_type = EXCLUDED.vessel_type,
              event_type = EXCLUDED.event_type,
              guest_count = EXCLUDED.guest_count,
              event_date = EXCLUDED.event_date,
              grand_total = EXCLUDED.grand_total,
              step = EXCLUDED.step,
              review_status = EXCLUDED.review_status,
              proposal_id = EXCLUDED.proposal_id,
              lead_json = EXCLUDED.lead_json,
              data_json = EXCLUDED.data_json,
              extra_json = EXCLUDED.extra_json,
              updated_at = EXCLUDED.updated_at,
              deleted_at = NULL
            """,
            (
                row["id"],
                row["saved_at"],
                row["reviewed_at"],
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
                pg._jsonb(row["lead_json"]),
                pg._jsonb(row["data_json"]),
                pg._jsonb(row["extra_json"]),
                row["updated_at"],
            ),
        )
    saved = get_quote(quote_id)
    return saved or payload


def delete_quote(quote_id: str) -> bool:
    _require_store()
    qid = str(quote_id or "").strip()
    if not qid:
        return False
    if _use_memory():
        row = _MEMORY_QUOTES.get(qid)
        if not row or row.get("_deleted"):
            return False
        row["_deleted"] = True
        return True
    with pg.connection() as conn:
        cur = conn.execute(
            """
            UPDATE quotes SET deleted_at = %s, updated_at = %s
            WHERE id = %s AND deleted_at IS NULL
            """,
            (pg._now(), pg._now(), qid),
        )
        return cur.rowcount > 0


def clear_quotes() -> int:
    _require_store()
    if _use_memory():
        count = sum(1 for row in _MEMORY_QUOTES.values() if not row.get("_deleted"))
        _MEMORY_QUOTES.clear()
        return count
    with pg.connection() as conn:
        cur = conn.execute("DELETE FROM quotes")
        return cur.rowcount or 0


def list_proposals(include_pdf: bool = False) -> list[dict]:
    _require_store()
    if _use_memory():
        rows = []
        for row in _MEMORY_PROPOSALS.values():
            if row.get("_deleted"):
                continue
            item = {k: v for k, v in row.items() if k not in {"_deleted", "_pdf"}}
            pdf = row.get("_pdf")
            item["hasPdf"] = bool(pdf or item.get("pdfDataUrl"))
            if include_pdf and pdf and not item.get("pdfDataUrl"):
                item["pdfDataUrl"] = _encode_pdf(pdf)
            elif not include_pdf:
                item.pop("pdfDataUrl", None)
            rows.append(item)
        rows.sort(key=lambda r: str(r.get("createdAt") or ""), reverse=True)
        return rows
    with pg.connection() as conn:
        rows = pg.fetch_all(
            conn,
            """
            SELECT id, created_at, event_date, title, filename, vessel_type, event_type,
                   guest_count, grand_total, lead_name, lead_email, lead_company,
                   reference_number, extra_json, (pdf IS NOT NULL) AS has_pdf
            FROM proposals
            WHERE deleted_at IS NULL
            ORDER BY created_at DESC
            """,
        )
    out = []
    for row in rows:
        payload = pg.proposal_payload_from_row(
            {**row, "pdf": None},
            include_pdf=False,
            encode_pdf=_encode_pdf,
        )
        payload["hasPdf"] = bool(row.get("has_pdf"))
        payload.pop("pdfDataUrl", None)
        out.append(payload)
    return out


def get_proposal(proposal_id: str) -> dict | None:
    _require_store()
    pid = str(proposal_id or "").strip()
    if not pid:
        return None
    if _use_memory():
        row = _MEMORY_PROPOSALS.get(pid)
        if not row or row.get("_deleted"):
            return None
        item = {k: v for k, v in row.items() if k not in {"_deleted", "_pdf"}}
        pdf = row.get("_pdf")
        item["hasPdf"] = bool(pdf or item.get("pdfDataUrl"))
        if pdf and not item.get("pdfDataUrl"):
            item["pdfDataUrl"] = _encode_pdf(pdf)
        return item
    with pg.connection() as conn:
        row = pg.fetch_one(
            conn,
            """
            SELECT id, created_at, event_date, title, filename, vessel_type, event_type,
                   guest_count, grand_total, lead_name, lead_email, lead_company,
                   reference_number, extra_json, pdf
            FROM proposals
            WHERE id = %s AND deleted_at IS NULL
            """,
            (pid,),
        )
    if not row:
        return None
    return pg.proposal_payload_from_row(row, include_pdf=True, encode_pdf=_encode_pdf)


def put_proposal(payload: dict) -> dict:
    proposal_id = str(payload.get("id") or "").strip()
    if not proposal_id:
        raise ValueError("proposal id is required")
    payload = dict(payload)
    payload["id"] = proposal_id
    pdf_url = payload.get("pdfDataUrl")
    raw = _decode_pdf(pdf_url) if isinstance(pdf_url, str) and pdf_url else None
    _require_store()
    existing = get_proposal(proposal_id)
    if not raw and existing and existing.get("pdfDataUrl"):
        raw = _decode_pdf(str(existing["pdfDataUrl"]))
        payload["pdfDataUrl"] = existing["pdfDataUrl"]
    if _use_memory():
        meta = {k: v for k, v in payload.items() if k != "pdfDataUrl"}
        prev = _MEMORY_PROPOSALS.get(proposal_id) or {}
        pdf = raw or prev.get("_pdf")
        if isinstance(pdf_url, str) and pdf_url.startswith("data:application/pdf") and not raw:
            meta["pdfDataUrl"] = pdf_url
        meta["hasPdf"] = bool(pdf or meta.get("pdfDataUrl"))
        if not meta.get("createdAt"):
            meta["createdAt"] = prev.get("createdAt") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        _MEMORY_PROPOSALS[proposal_id] = {**meta, "_pdf": pdf, "_deleted": False}
        return {**meta, "hasPdf": bool(pdf or meta.get("pdfDataUrl"))}
    row = pg.proposal_row_from_payload(payload, raw)
    if not raw:
        with pg.connection() as conn:
            prev = pg.fetch_one(conn, "SELECT pdf FROM proposals WHERE id = %s", (proposal_id,))
            if prev and prev.get("pdf"):
                row["pdf"] = prev["pdf"]
    with pg.connection() as conn:
        conn.execute(
            """
            INSERT INTO proposals (
              id, created_at, event_date, title, filename, vessel_type, event_type,
              guest_count, grand_total, lead_name, lead_email, lead_company,
              reference_number, pdf, extra_json, updated_at, deleted_at
            ) VALUES (
              %s, %s, %s, %s, %s, %s, %s,
              %s, %s, %s, %s, %s,
              %s, %s, %s, %s, NULL
            )
            ON CONFLICT (id) DO UPDATE SET
              created_at = EXCLUDED.created_at,
              event_date = EXCLUDED.event_date,
              title = EXCLUDED.title,
              filename = EXCLUDED.filename,
              vessel_type = EXCLUDED.vessel_type,
              event_type = EXCLUDED.event_type,
              guest_count = EXCLUDED.guest_count,
              grand_total = EXCLUDED.grand_total,
              lead_name = EXCLUDED.lead_name,
              lead_email = EXCLUDED.lead_email,
              lead_company = EXCLUDED.lead_company,
              reference_number = EXCLUDED.reference_number,
              pdf = COALESCE(EXCLUDED.pdf, proposals.pdf),
              extra_json = EXCLUDED.extra_json,
              updated_at = EXCLUDED.updated_at,
              deleted_at = NULL
            """,
            (
                row["id"],
                row["created_at"],
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
                pg._jsonb(row["extra_json"]),
                row["updated_at"],
            ),
        )
    saved = get_proposal(proposal_id)
    if saved:
        saved.pop("pdfDataUrl", None)
        return saved
    return {**payload, "hasPdf": bool(raw)}


def delete_proposal(proposal_id: str) -> bool:
    _require_store()
    pid = str(proposal_id or "").strip()
    if not pid:
        return False
    if _use_memory():
        row = _MEMORY_PROPOSALS.get(pid)
        if not row or row.get("_deleted"):
            return False
        row["_deleted"] = True
        return True
    with pg.connection() as conn:
        cur = conn.execute(
            """
            UPDATE proposals SET deleted_at = %s, updated_at = %s
            WHERE id = %s AND deleted_at IS NULL
            """,
            (pg._now(), pg._now(), pid),
        )
        return cur.rowcount > 0


def clear_proposals() -> int:
    _require_store()
    if _use_memory():
        count = sum(1 for row in _MEMORY_PROPOSALS.values() if not row.get("_deleted"))
        _MEMORY_PROPOSALS.clear()
        return count
    with pg.connection() as conn:
        cur = conn.execute("DELETE FROM proposals")
        return cur.rowcount or 0


def _rates_catalog_path() -> Path:
    _ensure_dirs()
    return DATA_DIR / "cost_rates_catalog.json"


def get_rates_catalog() -> dict | None:
    return _read_json(_rates_catalog_path())


def put_rates_catalog(payload: dict) -> dict:
    row = dict(payload or {})
    row["id"] = "cost-rates"
    row["savedAt"] = row.get("savedAt") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    _write_json(_rates_catalog_path(), row)
    return row
