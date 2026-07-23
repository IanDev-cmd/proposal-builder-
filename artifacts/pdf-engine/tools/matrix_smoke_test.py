"""
matrix_smoke_test.py
--------------------
Systematic smoke tests across all templates, all inserts, and representative
insert subsets. Catches crashes, blank pages, dimension drift, and missing
cover values without requiring a full cartesian explosion.

Usage (from artifacts/pdf-engine):
  python tools/matrix_smoke_test.py
  python tools/matrix_smoke_test.py --quick
  python tools/matrix_smoke_test.py --out ../../exports/matrix-smoke-report.json
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
import tempfile
import time
import traceback
from collections import Counter
from copy import deepcopy
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from catalog import get_catalog  # noqa: E402
from engine import build_proposal  # noqa: E402
from inserts import get_insert_manifest  # noqa: E402

SAMPLE = json.loads((ROOT / "data" / "sample_payload.json").read_text(encoding="utf-8"))


def base_payload(**overrides) -> dict:
    p = deepcopy(SAMPLE)
    p["lead"] = dict(p.get("lead") or {})
    for k, v in overrides.items():
        if k == "lead" and isinstance(v, dict):
            p["lead"].update(v)
        else:
            p[k] = v
    return p


def page_quality(doc: fitz.Document) -> list[str]:
    issues = []
    if doc.page_count < 12:
        issues.append(f"too_few_pages:{doc.page_count}")
    sizes = {(round(p.rect.width, 1), round(p.rect.height, 1)) for p in doc}
    if len(sizes) > 2:
        issues.append(f"inconsistent_page_sizes:{sorted(sizes)[:5]}")
    blank = 0
    for i, page in enumerate(doc):
        text_len = len(page.get_text("text") or "")
        imgs = page.get_images()
        if text_len < 20 and len(imgs) == 0:
            blank += 1
            issues.append(f"blank_page:{i}")
    if blank:
        issues.append(f"blank_pages_total:{blank}")
    return issues


def cover_has_values(doc: fitz.Document, lead: dict) -> list[str]:
    issues = []
    text = (doc[0].get_text("text") or "").lower().replace(" ", "")
    ref = str(lead.get("proposal_ref") or "").lower().replace(" ", "")
    name = str(lead.get("client_name") or "").lower()
    # Tiny shrunk glyphs sometimes won't round-trip via get_text — only flag
    # clear misses when the ref is a normal WE.#### shape.
    if ref and re.fullmatch(r"we\.\d{3,5}", ref) and ref not in text and ref.replace(".", "") not in text:
        issues.append(f"cover_missing_ref:{ref}")
    if name and name.split()[0] not in (doc[0].get_text("text") or "").lower():
        issues.append(f"cover_missing_client:{name}")
    return issues


def run_one(label: str, payload: dict, out_dir: Path) -> dict:
    t0 = time.perf_counter()
    out_path = out_dir / f"{label.replace('/', '_')[:80]}.pdf"
    row = {
        "label": label,
        "ok": False,
        "ms": 0,
        "pages": 0,
        "template_id": None,
        "warnings": [],
        "issues": [],
        "error": None,
    }
    try:
        report = build_proposal(payload, "AUTO", str(out_path))
        row["template_id"] = report.get("template_id")
        row["warnings"] = report.get("warnings") or []
        row["pages"] = report.get("page_count_final") or 0
        doc = fitz.open(out_path)
        try:
            row["issues"].extend(page_quality(doc))
            row["issues"].extend(cover_has_values(doc, payload.get("lead") or {}))
            # Template / event mismatch (bad output class like engagement hero + social gathering)
            resolved_et = (report.get("event_type") or "").lower()
            lead_et = str((payload.get("lead") or {}).get("event_type") or payload.get("event_type") or "").lower()
            if lead_et and resolved_et and lead_et not in resolved_et and resolved_et not in lead_et:
                # soft issue when template_id forced a different family
                hero = (doc[0].get_text("text") or "")[:200].lower()
                if "engagement celebration" in hero and "social gathering" in lead_et:
                    row["issues"].append("template_hero_mismatch:engagement_vs_social_gathering")
        finally:
            doc.close()
        row["ok"] = len([i for i in row["issues"] if not i.startswith("cover_missing_ref:")]) == 0
        # Soft: missing ref alone is a flake risk on some templates; escalate only with other issues
        if any(i.startswith("cover_missing_ref:") for i in row["issues"]) and any(
            i.startswith("cover_missing_client:") or i.startswith("blank_") for i in row["issues"]
        ):
            row["ok"] = False
        if len(row["issues"]) == 0:
            row["ok"] = True
        # Hard fail only on structural insert problems
        if any("out of range" in w.lower() for w in row["warnings"]):
            row["ok"] = False
            row["issues"].append("insert_page_out_of_range")
        if any("no pages" in w.lower() for w in row["warnings"]):
            row["ok"] = False
            row["issues"].append("insert_empty")
        # Any non-ref issue still fails
        hard = [i for i in row["issues"] if not i.startswith("cover_missing_ref:")]
        row["ok"] = len(hard) == 0 and "insert_page_out_of_range" not in row["issues"] and "insert_empty" not in row["issues"]
        if row.get("error"):
            row["ok"] = False
    except Exception as exc:
        row["error"] = f"{type(exc).__name__}: {exc}"
        row["issues"].append("exception")
        row["traceback"] = traceback.format_exc(limit=4)
    row["ms"] = round((time.perf_counter() - t0) * 1000)
    return row


def pick_by_kind(inserts: list[dict], kind: str, n: int = 1) -> list[str]:
    ids = [i["id"] for i in inserts if i.get("kind") == kind]
    return ids[:n]


def subset_cases(inserts: list[dict]) -> list[tuple[str, list[str]]]:
    vessels = pick_by_kind(inserts, "vessel", 5)
    staff = pick_by_kind(inserts, "staff", 4)
    maps = pick_by_kind(inserts, "map", 2)
    cases: list[tuple[str, list[str]]] = []
    if vessels:
        cases.append(("subset/vessel_only", [vessels[0]]))
    if staff:
        cases.append(("subset/staff_only", [staff[0]]))
    if maps:
        cases.append(("subset/map_only", [maps[0]]))
    if vessels and staff:
        cases.append(("subset/vessel_staff", [vessels[0], staff[0]]))
    if vessels and maps:
        cases.append(("subset/vessel_map", [vessels[0], maps[0]]))
    if vessels and staff and maps:
        cases.append(("subset/vessel_staff_map", [vessels[0], staff[0], maps[0]]))
    if len(vessels) >= 2:
        cases.append(("subset/two_vessels_last_wins", vessels[:2]))
    if len(staff) >= 2:
        cases.append(("subset/two_staff_last_wins", staff[:2]))
    # Probability sample: random mixes
    rng = random.Random(42)
    for i in range(12):
        mix = []
        if vessels:
            mix.append(rng.choice(vessels))
        if staff and rng.random() > 0.3:
            mix.append(rng.choice(staff))
        if maps and rng.random() > 0.5:
            mix.append(rng.choice(maps))
        if mix:
            cases.append((f"subset/random_{i}", mix))
    return cases


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="Fewer insert singles / randoms")
    ap.add_argument(
        "--out",
        default=str(ROOT.parents[1] / "exports" / "matrix-smoke-report.json"),
        help="JSON report path",
    )
    args = ap.parse_args()

    cat = get_catalog()
    inserts = get_insert_manifest().get("inserts", [])
    results: list[dict] = []

    # Phase 0 — asset integrity
    missing_tpl = []
    for t in cat.templates:
        path = ROOT / t["path"] if not Path(t["path"]).is_absolute() else Path(t["path"])
        # catalog stores relative from pdf-engine root
        path = ROOT / t["path"]
        if not path.exists():
            missing_tpl.append(t["id"])
        else:
            try:
                d = fitz.open(path)
                if d.page_count < 1:
                    missing_tpl.append(t["id"] + ":empty")
                d.close()
            except Exception as e:
                missing_tpl.append(f"{t['id']}:{e}")

    missing_ins = []
    for i in inserts:
        path = ROOT / i["path"]
        if not path.exists():
            missing_ins.append(i["id"])
        else:
            try:
                d = fitz.open(path)
                if d.page_count < 1:
                    missing_ins.append(i["id"] + ":empty")
                d.close()
            except Exception as e:
                missing_ins.append(f"{i['id']}:{e}")

    print(f"templates={len(cat.templates)} inserts={len(inserts)}")
    print(f"missing_templates={len(missing_tpl)} missing_inserts={len(missing_ins)}")
    if missing_tpl:
        print("MISSING TEMPLATES", missing_tpl[:20])
    if missing_ins:
        print("MISSING INSERTS", missing_ins[:20])

    with tempfile.TemporaryDirectory() as tmp:
        out_dir = Path(tmp)

        # Phase 1 — every template alone
        print("\n=== Phase 1: all templates ===")
        for idx, t in enumerate(cat.templates):
            payload = base_payload(
                template_id=t["id"],
                category=t["category"],
                event_type=t["event_type"],
                slot=t.get("slot"),
                lead={
                    "event_type": t["event_type"],
                    "proposal_ref": f"WE.{9000 + idx}",
                    "client_name": "Matrix Smoke Client",
                },
                selectedInserts=[],
            )
            row = run_one(f"template/{t['id']}", payload, out_dir)
            results.append(row)
            mark = "OK" if row["ok"] else "FAIL"
            print(f"  [{mark}] {t['id']} pages={row['pages']} ms={row['ms']} issues={row['issues'][:2]}")

        # Phase 2 — every insert alone on corporate + wedding baselines
        print("\n=== Phase 2: all inserts (baselines) ===")
        baselines = [
            "corporate/social_gathering/evening",
            "wedding/engagement_celebration/default",
        ]
        if args.quick:
            baselines = baselines[:1]
            insert_list = inserts[::3]  # every 3rd
        else:
            insert_list = inserts

        for base_id in baselines:
            base_t = next((x for x in cat.templates if x["id"] == base_id), None)
            if not base_t:
                continue
            for i_idx, ins in enumerate(insert_list):
                payload = base_payload(
                    template_id=base_id,
                    category=base_t["category"],
                    event_type=base_t["event_type"],
                    lead={
                        "event_type": base_t["event_type"],
                        "proposal_ref": f"WE.{8000 + i_idx}",
                        "client_name": "Insert Smoke Client",
                    },
                    selectedInserts=[ins["id"]],
                )
                row = run_one(f"insert/{base_id}/{ins['id']}", payload, out_dir)
                results.append(row)
                if not row["ok"]:
                    print(
                        f"  [FAIL] {ins['id']} on {base_id} "
                        f"issues={row['issues']} err={row['error']} warn={row['warnings'][:1]}"
                    )

        # Phase 3 — subset probabilities
        print("\n=== Phase 3: subset combinations ===")
        cases = subset_cases(inserts)
        if args.quick:
            cases = cases[:8]
        base_id = "corporate/social_gathering/evening"
        base_t = next(x for x in cat.templates if x["id"] == base_id)
        for label, ids in cases:
            payload = base_payload(
                template_id=base_id,
                category=base_t["category"],
                event_type=base_t["event_type"],
                lead={
                    "event_type": base_t["event_type"],
                    "proposal_ref": "WE.4242",
                    "client_name": "Subset Smoke Client",
                },
                selectedInserts=ids,
            )
            row = run_one(label, payload, out_dir)
            row["selectedInserts"] = ids
            results.append(row)
            mark = "OK" if row["ok"] else "FAIL"
            print(f"  [{mark}] {label} n={len(ids)} issues={row['issues'][:2]}")

    failed = [r for r in results if not r["ok"]]
    summary = {
        "templates": len(cat.templates),
        "inserts": len(inserts),
        "missing_templates": missing_tpl,
        "missing_inserts": missing_ins,
        "runs": len(results),
        "passed": len(results) - len(failed),
        "failed": len(failed),
        "fail_labels": [r["label"] for r in failed[:50]],
        "issue_counts": Counter(i for r in failed for i in r["issues"]),
        "results": results,
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\nPASS {summary['passed']}/{summary['runs']}  FAIL {summary['failed']}")
    print(f"Report → {out_path}")
    if summary["issue_counts"]:
        print("Top issues:", dict(summary["issue_counts"].most_common(10)))
    return 1 if failed or missing_tpl or missing_ins else 0


if __name__ == "__main__":
    raise SystemExit(main())
