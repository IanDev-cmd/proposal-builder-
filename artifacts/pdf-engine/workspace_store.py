"""Shared Leads-adjacent workspace: Saved Quotes and Generated Proposals.

Stored on the proposal engine so every browser session can load the same lists.
PDFs are kept as binary files; quote form snapshots as JSON.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path

_BASE = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("WORKSPACE_DATA_DIR", str(_BASE / "data" / "workspace")))
QUOTES_DIR = DATA_DIR / "quotes"
PROPOSALS_DIR = DATA_DIR / "proposals"

_SAFE_ID = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_id(raw: str) -> str:
    cleaned = _SAFE_ID.sub("_", str(raw or "").strip())[:180]
    return cleaned or "unknown"


def _ensure_dirs() -> None:
    QUOTES_DIR.mkdir(parents=True, exist_ok=True)
    PROPOSALS_DIR.mkdir(parents=True, exist_ok=True)


def _write_bytes(path: Path, raw: bytes) -> None:
    _ensure_dirs()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name, dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(raw)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _write_json(path: Path, payload: dict) -> None:
    _ensure_dirs()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name, dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _read_json(path: Path) -> dict | None:
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


def list_quotes() -> list[dict]:
    _ensure_dirs()
    rows: list[dict] = []
    for path in QUOTES_DIR.glob("*.json"):
        row = _read_json(path)
        if row and row.get("id"):
            rows.append(row)
    rows.sort(key=lambda r: str(r.get("savedAt") or ""), reverse=True)
    return rows


def put_quote(payload: dict) -> dict:
    quote_id = str(payload.get("id") or "").strip()
    if not quote_id:
        raise ValueError("quote id is required")
    try:
        payload["grandTotal"] = float(payload.get("grandTotal") or 0)
    except (TypeError, ValueError):
        payload["grandTotal"] = 0.0
    _write_json(QUOTES_DIR / f"{_safe_id(quote_id)}.json", payload)
    return payload


def get_quote(quote_id: str) -> dict | None:
    return _read_json(QUOTES_DIR / f"{_safe_id(quote_id)}.json")


def delete_quote(quote_id: str) -> bool:
    path = QUOTES_DIR / f"{_safe_id(quote_id)}.json"
    if not path.exists():
        return False
    path.unlink()
    return True


def _proposal_meta_path(proposal_id: str) -> Path:
    return PROPOSALS_DIR / f"{_safe_id(proposal_id)}.json"


def _proposal_pdf_path(proposal_id: str) -> Path:
    return PROPOSALS_DIR / f"{_safe_id(proposal_id)}.pdf"


def list_proposals(include_pdf: bool = False) -> list[dict]:
    _ensure_dirs()
    rows: list[dict] = []
    for path in PROPOSALS_DIR.glob("*.json"):
        row = _read_json(path)
        if not row or not row.get("id"):
            continue
        pdf_path = _proposal_pdf_path(str(row["id"]))
        row = {**row, "hasPdf": pdf_path.exists()}
        if include_pdf and pdf_path.exists() and not row.get("pdfDataUrl"):
            try:
                row["pdfDataUrl"] = _encode_pdf(pdf_path.read_bytes())
            except OSError:
                pass
        elif not include_pdf:
            row.pop("pdfDataUrl", None)
        rows.append(row)
    rows.sort(key=lambda r: str(r.get("createdAt") or ""), reverse=True)
    return rows


def get_proposal(proposal_id: str) -> dict | None:
    row = _read_json(_proposal_meta_path(proposal_id))
    if not row:
        return None
    pdf_path = _proposal_pdf_path(proposal_id)
    if pdf_path.exists():
        try:
            row["pdfDataUrl"] = _encode_pdf(pdf_path.read_bytes())
            row["hasPdf"] = True
        except OSError:
            row["hasPdf"] = False
    else:
        row["hasPdf"] = bool(row.get("pdfDataUrl"))
    return row


def put_proposal(payload: dict) -> dict:
    proposal_id = str(payload.get("id") or "").strip()
    if not proposal_id:
        raise ValueError("proposal id is required")
    pdf_url = payload.get("pdfDataUrl")
    meta = {k: v for k, v in payload.items() if k != "pdfDataUrl"}
    if isinstance(pdf_url, str) and pdf_url:
        raw = _decode_pdf(pdf_url)
        if raw:
            _ensure_dirs()
            _write_bytes(_proposal_pdf_path(proposal_id), raw)
            meta["hasPdf"] = True
        elif pdf_url.startswith("data:application/pdf"):
            meta["pdfDataUrl"] = pdf_url
            meta["hasPdf"] = True
    _write_json(_proposal_meta_path(proposal_id), meta)
    return {**meta, "hasPdf": _proposal_pdf_path(proposal_id).exists() or bool(meta.get("pdfDataUrl"))}


def delete_proposal(proposal_id: str) -> bool:
    meta = _proposal_meta_path(proposal_id)
    pdf = _proposal_pdf_path(proposal_id)
    found = False
    if meta.exists():
        meta.unlink()
        found = True
    if pdf.exists():
        pdf.unlink()
        found = True
    return found
