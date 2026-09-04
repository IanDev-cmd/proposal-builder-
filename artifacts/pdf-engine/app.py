"""
app.py
------
Web wrapper around engine.build_proposal() for Render.

ENDPOINTS
    GET  /               health (public — Render)
    POST /auth/login     six-digit team PIN → signed session
    GET  /auth/session   Bearer session check
    POST /auth/touch     extend idle session
    POST /auth/logout    revoke session
    GET  /templates      list categories, event types, slots
    GET  /inserts        list optional proposal inserts (vessel/staff)
    POST /generate       JSON payload → PDF binary
                         Prefer payload.template_id for manual selection (MVP).
                         Optional payload.selectedInserts: string[] of insert ids.
"""

import io
import json
import os
import re
from urllib.parse import urlparse

from pathlib import Path

from flask import Flask, g, request, send_file, jsonify
from werkzeug.middleware.proxy_fix import ProxyFix

from engine import build_proposal
from team_auth import handle_login, refresh_session, require_team_session, revoke
from workspace_store import (
    clear_proposals as workspace_clear_proposals,
    clear_quotes as workspace_clear_quotes,
    delete_proposal as workspace_delete_proposal,
    delete_quote as workspace_delete_quote,
    get_proposal as workspace_get_proposal,
    get_quote as workspace_get_quote,
    get_rates_catalog as workspace_get_rates_catalog,
    list_proposals as workspace_list_proposals,
    list_quotes as workspace_list_quotes,
    put_proposal as workspace_put_proposal,
    put_quote as workspace_put_quote,
    put_rates_catalog as workspace_put_rates_catalog,
)
from catalog import get_catalog
from measure import warm_profiles, clear_profile_cache
from inserts import get_insert_manifest, list_inserts
from profile_validation import ProfileValidationError
from payload_schema import GeneratePayload, validation_error_body
from pydantic import ValidationError

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
_BASE = Path(__file__).resolve().parent

_DEFAULT_CORS_ORIGINS = (
    "https://weott-quote-builder.onrender.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
)


def _safe_origin(raw: str) -> str | None:
    origin = raw.strip().rstrip("/")
    if not origin or len(origin) > 180:
        return None
    try:
        parsed = urlparse(origin)
    except Exception:
        return None
    if parsed.path not in ("", "/") or parsed.query or parsed.fragment or parsed.username:
        return None
    host = (parsed.hostname or "").lower()
    if parsed.scheme == "https" and host:
        return f"https://{host}" + (f":{parsed.port}" if parsed.port else "")
    if parsed.scheme == "http" and host in {"localhost", "127.0.0.1"}:
        return f"http://{host}" + (f":{parsed.port}" if parsed.port else "")
    return None


def _cors_origins() -> set[str]:
    origins = set(_DEFAULT_CORS_ORIGINS)
    for item in os.environ.get("NEXUS_CORS_ORIGINS", "").split(","):
        origin = _safe_origin(item)
        if origin:
            origins.add(origin)
    return origins

_WARM = {"ok": False, "error": None, "templates_warmed": 0}


def _warm_profiles() -> None:
    paths = [str(_BASE / t["path"]) for t in get_catalog().templates]
    try:
        clear_profile_cache()
        warm_profiles(paths)
        _WARM["ok"] = True
        _WARM["error"] = None
        _WARM["templates_warmed"] = len(paths)
    except Exception as exc:
        _WARM["ok"] = False
        _WARM["error"] = str(exc)
        _WARM["templates_warmed"] = 0
        app.logger.exception("profile warm-up failed")


_warm_profiles()


@app.before_request
def _gate():
    if request.method == "OPTIONS":
        return ("", 204)
    if request.path == "/" and request.method == "GET":
        return None
    if request.path == "/auth/login" and request.method == "POST":
        return None
    denied, claims = require_team_session(request)
    if denied is not None:
        return denied
    g.team_session = claims
    return None


@app.after_request
def _security_headers(resp):
    origin = _safe_origin(request.headers.get("Origin") or "")
    if origin and origin in _cors_origins():
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Vary"] = "Origin"
    resp.headers["Access-Control-Allow-Methods"] = "GET, PUT, POST, DELETE, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    resp.headers["Access-Control-Expose-Headers"] = (
        "Content-Disposition, Content-Type, X-Warnings, X-Using-Brand-Font, "
        "X-Page-Count, X-Template-Id, X-Template-Matched-By, X-Inserts, X-Proposal-Filename"
    )
    resp.headers["Access-Control-Max-Age"] = "86400"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Cache-Control"] = "no-store"
    resp.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return resp


@app.post("/auth/login")
def auth_login():
    return handle_login(request)


@app.get("/auth/session")
def auth_session():
    claims = getattr(g, "team_session", None) or {}
    return jsonify(ok=True, expiresAt=claims.get("exp"))


@app.post("/auth/touch")
def auth_touch():
    refreshed = refresh_session(getattr(g, "team_session", {}) or {})
    if not refreshed:
        return jsonify(error="Authentication required."), 401
    token, expires_in = refreshed
    return jsonify(ok=True, token=token, expiresIn=expires_in)


@app.post("/auth/logout")
def auth_logout():
    revoke(getattr(g, "team_session", {}) or {})
    return jsonify(ok=True)


@app.get("/")
def health():
    cat = get_catalog()
    inserts = get_insert_manifest().get("inserts", [])
    degraded = not _WARM["ok"]
    return jsonify(
        status="degraded" if degraded else "ok",
        degraded=degraded,
        profile_warmup=_WARM,
        service="weott-proposal-engine",
        templates=len(cat.templates),
        inserts=len(inserts),
        categories=["corporate", "wedding"],
    )


@app.get("/templates")
def templates():
    cat = get_catalog()
    by_category = {"corporate": [], "wedding": []}
    seen = set()
    for t in cat.templates:
        key = (t["category"], t["event_type"])
        if key in seen:
            continue
        seen.add(key)
        by_category.setdefault(t["category"], []).append({
            "event_type": t["event_type"],
            "slots": cat.list_slots(t["event_type"], t["category"]),
            "aliases": t.get("aliases", []),
        })
    return jsonify({
        "templates": cat.templates,
        "by_category": by_category,
    })


@app.get("/inserts")
def inserts_endpoint():
    kind = request.args.get("kind")
    category = request.args.get("category")
    vessel = request.args.get("vessel")
    man = get_insert_manifest()
    return jsonify({
        "inserts": [
            i
            for i in list_inserts(kind=kind, category=category, vessel=vessel)
            if i.get("kind") != "map" and i.get("id") != "2024_weott_proposal_river_map"
        ],
        "placement_rules": man.get("placement_rules", {}),
        "version": man.get("version"),
    })


_PLACEHOLDER_COMPANY = re.compile(r"^(na|n/?a|n\.a\.?|none|nil|null|-|—|–)$", re.I)
_REF_VERSION_TAIL = re.compile(r"\s+V\d+\s*$", re.I)


def _company_for_filename(raw: str) -> str:
    company = re.sub(r"\s+", " ", raw).strip()
    if not company or _PLACEHOLDER_COMPANY.match(company):
        return ""
    return company


def proposal_download_name(payload: dict, report: dict) -> str:
    """Exact house name from the lead: Proposal - Name (Company) - REF.pdf"""
    lead = payload.get("lead") or {}
    nexus = payload.get("nexusLead") or {}
    if not isinstance(lead, dict):
        lead = {}
    if not isinstance(nexus, dict):
        nexus = {}

    def clean(s: str) -> str:
        s = re.sub(r'[<>:"/\\|?*]', "", s)
        return re.sub(r"\s+", " ", s).strip()

    name = clean(
        str(lead.get("client_name") or nexus.get("name") or "").strip()
    ) or "Contact TBC"
    company = _company_for_filename(
        clean(
            str(
                lead.get("organisation")
                or nexus.get("companyName")
                or nexus.get("company")
                or ""
            ).strip()
        )
    )
    ref = clean(
        str(nexus.get("referenceNumber") or lead.get("reference_number") or "").strip()
    )
    if not ref:
        ref = clean(str(lead.get("proposal_ref") or report.get("proposal_ref") or "").strip())
        ref = _REF_VERSION_TAIL.sub("", ref).strip()
    if not ref:
        ref = "REF TBC"
    who = f"{name} ({company})" if company else name
    return f"Proposal - {who} - {ref}.pdf"


@app.post("/generate")
def generate():
    payload = request.get_json(force=True, silent=True)
    if payload is None:
        return jsonify(error="Request body must be valid JSON"), 400
    try:
        payload = GeneratePayload.model_validate(payload).model_dump(exclude_none=True)
    except ValidationError as exc:
        return jsonify(validation_error_body(exc)), 422

    try:
        # AUTO still resolves when template_id is absent; with template_id
        # catalog.resolve prefers that id (manual MVP selection).
        report = build_proposal(payload, "AUTO", None)
        pdf_bytes = report.pop("pdf_bytes")
    except ProfileValidationError as exc:
        return jsonify(
            error="PDF layout validation failed — cover/contact measurements out of spec",
            validation_errors=exc.errors,
        ), 422
    except Exception as exc:
        return jsonify(error=f"Proposal generation failed: {exc}"), 500

    filename = proposal_download_name(payload, report)
    response = send_file(
        io.BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )
    response.headers["X-Proposal-Filename"] = filename
    response.headers["X-Warnings"] = json.dumps(report["warnings"])
    response.headers["X-Using-Brand-Font"] = str(report["using_brand_font"])
    response.headers["X-Page-Count"] = str(report["page_count_final"])
    response.headers["X-Template-Id"] = str(report.get("template_id") or "")
    response.headers["X-Template-Matched-By"] = str(report.get("template_matched_by") or "")
    response.headers["X-Inserts"] = json.dumps(report.get("inserts") or {})
    return response


@app.get("/workspace/quotes")
def workspace_quotes_list():
    return jsonify(quotes=workspace_list_quotes())


@app.get("/workspace/quotes/<quote_id>")
def workspace_quotes_get(quote_id):
    row = workspace_get_quote(quote_id)
    if not row:
        return jsonify(error="Not found"), 404
    return jsonify(row)


@app.put("/workspace/quotes/<quote_id>")
def workspace_quotes_put(quote_id):
    payload = request.get_json(force=True, silent=True)
    if not isinstance(payload, dict):
        return jsonify(error="Request body must be valid JSON"), 400
    payload["id"] = str(payload.get("id") or quote_id)
    try:
        saved = workspace_put_quote(payload)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    return jsonify(ok=True, quote=saved)


@app.delete("/workspace/quotes")
def workspace_quotes_clear():
    return jsonify(ok=True, deleted=workspace_clear_quotes())


@app.delete("/workspace/quotes/<quote_id>")
def workspace_quotes_delete(quote_id):
    return jsonify(ok=workspace_delete_quote(quote_id))


@app.get("/workspace/proposals")
def workspace_proposals_list():
    return jsonify(proposals=workspace_list_proposals(include_pdf=False))


@app.get("/workspace/proposals/<proposal_id>")
def workspace_proposals_get(proposal_id):
    row = workspace_get_proposal(proposal_id)
    if not row:
        return jsonify(error="Not found"), 404
    return jsonify(row)


@app.put("/workspace/proposals/<proposal_id>")
def workspace_proposals_put(proposal_id):
    payload = request.get_json(force=True, silent=True)
    if not isinstance(payload, dict):
        return jsonify(error="Request body must be valid JSON"), 400
    payload["id"] = str(payload.get("id") or proposal_id)
    try:
        saved = workspace_put_proposal(payload)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    return jsonify(ok=True, proposal={k: v for k, v in saved.items() if k != "pdfDataUrl"})


@app.delete("/workspace/proposals")
def workspace_proposals_clear():
    return jsonify(ok=True, deleted=workspace_clear_proposals())


@app.delete("/workspace/proposals/<proposal_id>")
def workspace_proposals_delete(proposal_id):
    return jsonify(ok=workspace_delete_proposal(proposal_id))


@app.get("/workspace/catalog")
def workspace_catalog_get():
    row = workspace_get_rates_catalog()
    if not row:
        return jsonify(error="Not found"), 404
    return jsonify(row)


@app.put("/workspace/catalog")
def workspace_catalog_put():
    payload = request.get_json(force=True, silent=True)
    if not isinstance(payload, dict):
        return jsonify(error="Request body must be valid JSON"), 400
    saved = workspace_put_rates_catalog(payload)
    return jsonify(ok=True, catalog=saved)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port)
