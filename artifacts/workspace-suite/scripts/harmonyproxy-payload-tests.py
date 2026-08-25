"""Smoke-test all live harmonyproxy n8n webhooks. Not imported by the app."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

BASE = "https://harmonyproxy.app.n8n.cloud/webhook"


def post(path: str, body: dict | None, timeout: int = 90, accept: str = "application/json") -> dict:
    url = f"{BASE}/{path}"
    data = b"" if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
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
            "path": path,
            "ok": False,
            "status": None,
            "ms": round((time.time() - t0) * 1000),
            "error": f"{type(e).__name__}: {str(e)[:220]}",
            "preview": "",
            "parsed": None,
        }
    ms = round((time.time() - t0) * 1000)
    if "pdf" in (ct or "").lower() or raw[:4] == b"%PDF":
        preview = f"PDF {len(raw)} bytes"
        return {
            "path": path,
            "ok": 200 <= status < 300 and raw[:4] == b"%PDF",
            "status": status,
            "ms": ms,
            "error": "",
            "preview": preview,
            "parsed": None,
        }
    text = raw.decode("utf-8", errors="replace")
    preview = text[:240].replace("\n", " ")
    try:
        parsed = json.loads(text) if text.strip() else None
    except Exception:
        parsed = None
    return {
        "path": path,
        "ok": 200 <= status < 300 and parsed is not None,
        "status": status,
        "ms": ms,
        "error": "" if parsed is not None else "non-JSON",
        "preview": preview,
        "parsed": parsed,
    }


def extra(parsed) -> str:
    if not isinstance(parsed, dict):
        return ""
    bits = []
    if "count" in parsed:
        bits.append(f"leads={parsed.get('count')} mode={parsed.get('mode')}")
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


def main() -> int:
    results: list[dict] = []

    jobs = [
        ("LeadDataFetch live", lambda: post("LeadDataFetch", {"mode": "live"})),
        ("LeadDataFetch demo", lambda: post("LeadDataFetch", {"mode": "demo"})),
        ("LeadDataFetch empty", lambda: post("LeadDataFetch", {})),
        ("CostRatesFetch", lambda: post("CostRatesFetch", {"mode": "live"})),
        (
            "NoteAppend demo",
            lambda: post(
                "NoteAppend",
                {
                    "mode": "demo",
                    "referenceNumber": "WE.PAYLOADTEST",
                    "leadName": "Payload Test",
                    "note": "harmonyproxy webhook smoke",
                    "tag": "qa",
                },
            ),
        ),
        (
            "QuoteStatus demo",
            lambda: post(
                "QuoteStatus",
                {
                    "mode": "demo",
                    "referenceNumber": "WE.PAYLOADTEST",
                    "status": "draft",
                    "guestCount": 40,
                    "costToClient": 1000,
                    "vat": 200,
                    "grandTotal": 1200,
                },
            ),
        ),
        (
            "PrefillHealer",
            lambda: post(
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
            lambda: post(
                "LeadNotesSummary",
                {
                    "notes": "Progress 1: Called client, 40 pax, budget 8k. Progress 2: Prefers WEOTT II evening.",
                    "leadName": "Payload Test",
                    "referenceNumber": "WE.PAYLOADTEST",
                },
            ),
        ),
        ("ContractSync missing", lambda: post("ContractSync", {})),
        (
            "PayloadContractCheck empty",
            lambda: post("PayloadContractCheck", {"source": "LeadDataFetch", "raw": ""}),
        ),
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

    leads = next((r for r in results if r["name"] == "LeadDataFetch live"), None)
    rates = next((r for r in results if r["name"] == "CostRatesFetch"), None)
    if leads and leads.get("parsed"):
        print(">> PayloadContractCheck LeadDataFetch", flush=True)
        r = post("PayloadContractCheck", {"source": "LeadDataFetch", "payload": leads["parsed"]})
        r["name"] = "PayloadContractCheck leads"
        results.append(r)
        print(
            f"   status={r['status']} ok={r['ok']} {r['ms']}ms {r['error'] or r['preview'][:160]}",
            flush=True,
        )
    if rates and rates.get("parsed"):
        print(">> PayloadContractCheck CostRatesFetch", flush=True)
        r = post("PayloadContractCheck", {"source": "CostRatesFetch", "payload": rates["parsed"]})
        r["name"] = "PayloadContractCheck rates"
        results.append(r)
        print(
            f"   status={r['status']} ok={r['ok']} {r['ms']}ms {r['error'] or r['preview'][:160]}",
            flush=True,
        )

    print(">> QuoteBuilder PDF", flush=True)
    qb = post(
        "QuoteBuilder",
        {
            "mode": "demo",
            "event_type": "Social Gathering",
            "category": "corporate",
            "template_id": "corporate/social_gathering/evening",
            "manual_template": True,
            "departure": "19:00",
            "returnTime": "23:00",
            "lead": {
                "proposal_ref": "WE.PAYLOADTEST",
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
    qb["name"] = "QuoteBuilder"
    results.append(qb)
    print(
        f"   status={qb['status']} ok={qb['ok']} {qb['ms']}ms {qb['error'] or qb['preview'][:160]}",
        flush=True,
    )

    print("\n==== SUMMARY ====")
    fail = 0
    for r in results:
        mark = "PASS" if r["ok"] else "FAIL"
        if not r["ok"]:
            fail += 1
        print(
            f"{mark:4} {r['name']:32} HTTP {r['status']} {r['ms']}ms{extra(r.get('parsed'))}"
        )
    print("failed", fail, "of", len(results))
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
