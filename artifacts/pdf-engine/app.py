"""
app.py
------
Web wrapper around engine.build_proposal() for Render / n8n.

ENDPOINTS
    GET  /               health
    GET  /templates      list categories, event types, slots
    GET  /inserts        list optional proposal inserts (vessel/staff/map)
    POST /generate       JSON payload → PDF binary
                         Prefer payload.template_id for manual selection (MVP).
                         Optional payload.selectedInserts: string[] of insert ids.
"""

import io
import json
import os
import tempfile

from pathlib import Path

from flask import Flask, request, send_file, jsonify

from engine import build_proposal
from catalog import get_catalog
from measure import warm_profiles, clear_profile_cache
from inserts import get_insert_manifest, list_inserts
from profile_validation import ProfileValidationError
from payload_schema import GeneratePayload, validation_error_body
from pydantic import ValidationError

app = Flask(__name__)
_BASE = Path(__file__).resolve().parent

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
        "inserts": list_inserts(kind=kind, category=category, vessel=vessel),
        "placement_rules": man.get("placement_rules", {}),
        "version": man.get("version"),
    })


@app.post("/generate")
def generate():
    payload = request.get_json(force=True, silent=True)
    if payload is None:
        return jsonify(error="Request body must be valid JSON"), 400
    try:
        payload = GeneratePayload.model_validate(payload).model_dump(exclude_none=True)
    except ValidationError as exc:
        return jsonify(validation_error_body(exc)), 422

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = os.path.join(tmpdir, "output.pdf")
        try:
            # AUTO still resolves when template_id is absent; with template_id
            # catalog.resolve prefers that id (manual MVP selection).
            report = build_proposal(payload, "AUTO", output_path)
        except ProfileValidationError as exc:
            return jsonify(
                error="PDF layout validation failed — cover/contact measurements out of spec",
                validation_errors=exc.errors,
            ), 422
        except Exception as exc:
            return jsonify(error=f"Proposal generation failed: {exc}"), 500

        with open(output_path, "rb") as f:
            pdf_bytes = f.read()

    event_slug = (report.get("event_type") or "proposal").replace(" ", "-")
    response = send_file(
        io.BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"{event_slug}.pdf",
    )
    response.headers["X-Warnings"] = json.dumps(report["warnings"])
    response.headers["X-Using-Brand-Font"] = str(report["using_brand_font"])
    response.headers["X-Page-Count"] = str(report["page_count_final"])
    response.headers["X-Template-Id"] = str(report.get("template_id") or "")
    response.headers["X-Template-Matched-By"] = str(report.get("template_matched_by") or "")
    response.headers["X-Inserts"] = json.dumps(report.get("inserts") or {})
    return response


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port)
