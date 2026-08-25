"""Smoke-test post-cutover backends. Not imported by the app.

  1. Apps Script NexusApi.gs  — LeadDataFetch / CostRatesFetch / NoteAppend / QuoteStatus
  2. n8n harmonyproxy         — PrefillHealer + LeadNotesSummary only
  3. Flask /generate          — PDF (no QuoteBuilder hop)

Set APPS_SCRIPT_WEBAPP_URL to the /exec URL after Deploy. Tests against
PASTE_DEPLOYMENT_ID are skipped rather than faked.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

APPS_SCRIPT_URL = os.environ.get(
    "APPS_SCRIPT_WEBAPP_URL",
    "https://script.google.com/macros/s/AKfycbx3fu-1x77Ft3gJ4DM72_inDQD8jabrZShFWrZjTVHC5NLE5ipXSYPmAG6gA2czDaWHSQ/exec",
)
N8N_BASE = "https://harmonyproxy.app.n8n.cloud/webhook"
FLASK_GENERATE = "https://weott-proposal-engine.onrender.com/generate"


def _configured_apps() -> bool:
    return "PASTE_DEPLOYMENT_ID" not in APPS_SCRIPT_URL and "script.google.com" in APPS_SCRIPT_URL


def request_json(
    url: str,
    *,
    method: str = "POST",
    body: dict | None = None,
    content_type: str = "application/json",
    timeout: int = 90,
    accept: str = "application/json",
) -> dict:
    data = None if body is None and method == "GET" else (b"" if body is None else json.dumps(body).encode("utf-8"))
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", content_type)
    req.add_header("Accept", accept)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            ct = res.headers.get("Content-Type", "")
            status = res.status
    except urllib.error.HTTPError as e:
        raw = e.read()
        ct = e.headers.get("Content-Type", "") if e.headers else ""
        status = e.code
    except Exception as e:
        return {
            "ok": False,
            "status": None,
            "ms": round((time.time() - t0) * 1000),
            "error": f"{type(e).__name__}: {str(e)[:220]}",
            "preview": "",
            "parsed": None,
        }
    ms = round((time.time() - t0) * 1000)
    if "pdf" in (ct or "").lower() or raw[:4] == b"%PDF":
        return {
            "ok": 200 <= status < 300 and raw[:4] == b"%PDF",
            "status": status,
            "ms": ms,
            "error": "",
            "preview": f"PDF {len(raw)} bytes",
            "parsed": None,
        }
    text = raw.decode("utf-8", errors="replace")
    preview = text[:240].replace("\n", " ")
    try:
        parsed = json.loads(text) if text.strip() else None
    except Exception:
        parsed = None
    return {
        "ok": 200 <= status < 300 and parsed is not None,
        "status": status,
        "ms": ms,
        "error": "" if parsed is not None else "non-JSON",
        "preview": preview,
        "parsed": parsed,
    }


def apps_get(action: str, params: dict | None = None) -> dict:
    q = {"action": action, **(params or {})}
    url = APPS_SCRIPT_URL + "?" + urllib.parse.urlencode(q)
    r = request_json(url, method="GET", body=None, timeout=60)
    r["path"] = f"AppsScript GET {action}"
    return r


def apps_post(action: str, body: dict, timeout: int = 60) -> dict:
    r = request_json(
        APPS_SCRIPT_URL,
        method="POST",
        body={**body, "action": action},
        content_type="text/plain;charset=utf-8",
        timeout=timeout,
    )
    r["path"] = f"AppsScript POST {action}"
    return r


def n8n_post(path: str, body: dict | None, timeout: int = 90) -> dict:
    r = request_json(f"{N8N_BASE}/{path}", body=body, timeout=timeout)
    r["path"] = path
    return r


def extra(parsed) -> str:
    if not isinstance(parsed, dict):
        return ""
    bits = []
    if "count" in parsed:
        bits.append(f"count={parsed.get('count')}")
    if "counts" in parsed:
        bits.append(f"catalog={parsed.get('counts')}")
    if "matches" in parsed:
        bits.append(f"matches={len(parsed.get('matches') or [])}")
    if "points" in parsed:
        bits.append(f"points={len(parsed.get('points') or [])}")
    fe = parsed.get("failureEvent")
    if isinstance(fe, dict):
        bits.append(f"failure={str(fe.get('reason') or '')[:80]}")
    if "ok" in parsed:
        bits.append(f"ok={parsed.get('ok')}")
    return " " + " ".join(bits) if bits else ""


def skip(name: str, reason: str) -> dict:
    return {
        "name": name,
        "ok": True,
        "status": "SKIP",
        "ms": 0,
        "error": "",
        "preview": reason,
        "parsed": None,
        "skipped": True,
    }


def main() -> int:
    results: list[dict] = []

    if _configured_apps():
        jobs = [
            ("LeadDataFetch", lambda: apps_get("LeadDataFetch")),
            ("LeadDataFetch empty POST", lambda: apps_post("LeadDataFetch", {})),
            ("CostRatesFetch", lambda: apps_get("CostRatesFetch")),
            (
                "NoteAppend",
                lambda: apps_post(
                    "NoteAppend",
                    {
                        "referenceNumber": "WE.PAYLOADTEST",
                        "leadName": "Payload Test",
                        "note": "Apps Script smoke",
                        "tag": "qa",
                    },
                ),
            ),
            ("NotesFetch", lambda: apps_get("NotesFetch", {"referenceNumber": "WE.PAYLOADTEST"})),
            (
                "QuoteStatus",
                lambda: apps_post(
                    "QuoteStatus",
                    {
                        "referenceNumber": "WE.PAYLOADTEST",
                        "status": "draft",
                        "guestCount": 40,
                        "costToClient": 1000,
                        "vat": 200,
                        "grandTotal": 1200,
                    },
                ),
            ),
            ("QuotesFetch", lambda: apps_get("QuotesFetch", {"referenceNumber": "WE.PAYLOADTEST"})),
        ]
        for name, fn in jobs:
            print(">>", name, flush=True)
            r = fn()
            r["name"] = name
            results.append(r)
            print(
                f"   status={r['status']} ok={r['ok']} {r['ms']}ms {r['error'] or r['preview'][:160]}",
                flush=True,
            )
    else:
        print(">> Apps Script skipped -- paste /exec URL into APPS_SCRIPT_WEBAPP_URL", flush=True)
        results.append(skip("Apps Script suite", "PASTE_DEPLOYMENT_ID placeholder"))

    gemini_jobs = [
        (
            "PrefillHealer",
            lambda: n8n_post(
                "PrefillHealer",
                {
                    "notes": "Progress 1: 40 guests on WEOTT II, canapes and prosecco. Progress 2: evening cruise.",
                    "taxonomy": {
                        "lines": [
                            {
                                "id": "catering_canapes_all_seasons",
                                "label": "Canapes (All Seasons)",
                                "aliases": ["Canapes", "CANAPES"],
                            }
                        ]
                    },
                },
            ),
        ),
        (
            "LeadNotesSummary",
            lambda: n8n_post(
                "LeadNotesSummary",
                {
                    "notes": "Progress 1: Called client, 40 pax, budget 8k. Progress 2: Prefers WEOTT II evening.",
                    "leadName": "Payload Test",
                    "referenceNumber": "WE.PAYLOADTEST",
                },
            ),
        ),
    ]
    for name, fn in gemini_jobs:
        print(">>", name, flush=True)
        r = fn()
        r["name"] = name
        results.append(r)
        print(
            f"   status={r['status']} ok={r['ok']} {r['ms']}ms {r['error'] or r['preview'][:160]}",
            flush=True,
        )

    print(">> Flask /generate PDF", flush=True)
    qb = request_json(
        FLASK_GENERATE,
        body={
            "event_type": "Social Gathering",
            "category": "corporate",
            "template_id": "corporate/social_gathering/evening",
            "manual_template": True,
            "departure": "19:00",
            "returnTime": "23:00",
            "lead": {
                "proposal_ref": "WE.PAYLOADTEST",
                "quote_date": "25 August 2026 | Quotation valid for 28 days",
                "client_name": "Payload Test",
                "organisation": "WEOTT",
                "event_type": "Social Gathering",
                "event_date": "Date TBC",
                "event_timings": "19:00 - 23:00",
                "guest_range": "40",
                "guest_quote_n": "40",
            },
            "calculations": {
                "guests": 40,
                "package_cost": 2604.82,
                "vat": 520.96,
                "grand_total": 3125.78,
            },
            "packageWording": {
                "venue_and_management": [
                    {
                        "heading": "4 hours private venue hire – timings can be amended upon request - current itinerary is as follows;",
                        "items": [
                            "Embark will begin at 18:45hrs",
                            "Boat departs at 19:00hrs",
                            "Returns to pier for 23:00hrs",
                            "Disembark completes at 23:00hrs",
                        ],
                    }
                ]
            },
        },
        timeout=120,
        accept="application/pdf",
    )
    qb["name"] = "Flask /generate"
    results.append(qb)
    print(
        f"   status={qb['status']} ok={qb['ok']} {qb['ms']}ms {qb['error'] or qb['preview'][:160]}",
        flush=True,
    )

    print("\n==== SUMMARY ====")
    fail = 0
    for r in results:
        if r.get("skipped"):
            mark = "SKIP"
        elif r["ok"]:
            mark = "PASS"
        else:
            mark = "FAIL"
            fail += 1
        print(
            f"{mark:4} {r['name']:32} HTTP {r['status']} {r['ms']}ms{extra(r.get('parsed'))}"
        )
    print("failed", fail, "of", len(results))
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
