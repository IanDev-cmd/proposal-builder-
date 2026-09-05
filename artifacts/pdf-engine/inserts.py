"""
inserts.py
----------
Merge optional proposal inserts into a base template PDF.

Placement rules (MVP, manual selection — no auto-pick):
  - vessel: replace page index 8 (Vessel Details)
  - staff:  replace page index 15 (Contact / page 16)
  - map:    insert after the vessel page (default index 9)
  - other:  append at end unless target_page is set

Multiple vessel/staff inserts: last selected wins for that slot.
Multiple maps: inserted in selection order after the vessel page.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import fitz

from pdf_cache import open_source_pdf

BASE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BASE_DIR / "assets" / "inserts" / "manifest.json"

_manifest_cache = None


def get_insert_manifest() -> dict:
    global _manifest_cache
    if _manifest_cache is None:
        if MANIFEST_PATH.exists():
            _manifest_cache = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        else:
            _manifest_cache = {"version": 1, "inserts": [], "placement_rules": {}}
    return _manifest_cache


def list_inserts(
    *,
    kind: str | None = None,
    category: str | None = None,
    vessel: str | None = None,
) -> list[dict]:
    items = list(get_insert_manifest().get("inserts", []))
    if kind:
        items = [i for i in items if i.get("kind") == kind]
    if category and category != "any":
        items = [i for i in items if i.get("category") in (category, "any")]
    if vessel:
        v = vessel.lower()
        items = [
            i
            for i in items
            if not i.get("vessel")
            or v in str(i.get("vessel", "")).lower()
            or str(i.get("vessel", "")).lower() in v
        ]
    return items


_WEOTT_KEY_RE = re.compile(r"weott[\s_-]*(yacht|limo|vii|vi|iv|iii|ii|v|i)(?![a-z])")


def weott_vessel_key(raw: str) -> str:
    m = _WEOTT_KEY_RE.search(str(raw or "").lower())
    return f"weott {m.group(1)}" if m else ""


def _infer_season(event_date: str | None, event_type: str | None) -> str:
    if re.search(r"christmas|xmas", event_type or "", re.I):
        return "christmas"
    if not event_date:
        return "all_seasons"
    try:
        month = int(str(event_date)[5:7])
    except (TypeError, ValueError):
        return "all_seasons"
    if month == 12:
        return "christmas"
    if 3 <= month <= 8:
        return "spring_summer"
    return "autumn_winter"


def infer_insert_slot(payload: dict) -> str:
    lead = payload.get("lead") or {}
    for key in ("day_period", "dayPeriod"):
        raw = str(lead.get(key) or payload.get(key) or "").strip().lower()
        if raw == "daytime":
            return "daytime"
        if raw == "evening":
            return "evening"
    text = " ".join(
        str(x or "")
        for x in (
            lead.get("event_timings"),
            lead.get("departure"),
            payload.get("departure"),
        )
    )
    m = re.search(r"(\d{1,2}):(\d{2})", text)
    if not m:
        return "daytime_or_evening"
    hour = int(m.group(1)) + int(m.group(2)) / 60
    if hour >= 17:
        return "evening"
    if hour < 12:
        return "daytime"
    return "evening" if hour >= 15 else "daytime"


def pick_vessel_insert_id(
    vessel: str,
    *,
    event_type: str = "",
    event_date: str = "",
    slot: str = "",
    category: str = "",
) -> str | None:
    """Choose the V2 vessel-profile insert for this boat when none was selected."""
    want = weott_vessel_key(vessel)
    if not want:
        return None
    wedding = bool(re.search(r"wedding|engagement", event_type or "", re.I))
    season = _infer_season(event_date, event_type)
    wanted_slot = slot or "daytime_or_evening"
    cat = (category or ("wedding" if wedding else "corporate")).lower()

    best_id = None
    best_score = -1
    for ins in get_insert_manifest().get("inserts", []):
        if ins.get("kind") != "vessel":
            continue
        have = weott_vessel_key(f"{ins.get('id', '')} {ins.get('label', '')} {ins.get('vessel', '')}")
        if not have or have != want:
            continue
        ins_cat = str(ins.get("category") or "any").lower()
        if ins_cat not in ("any", "", cat):
            continue
        score = 35
        iid = str(ins.get("id") or "").lower()
        label = str(ins.get("label") or "").lower()
        if wedding and ("wedding" in iid or "wedding" in label):
            score += 25
        if not wedding and "wedding" in iid:
            score -= 40
        ins_season = str(ins.get("season") or "any")
        if ins_season in (season, "any", "all_seasons", "any_season") or (
            ins_season == "except_christmas" and season != "christmas"
        ):
            score += 18
        else:
            score -= 25
        ins_slot = str(ins.get("slot") or "any")
        if ins_slot in (wanted_slot, "any", "daytime_or_evening"):
            score += 15 if ins_slot == wanted_slot else 6
        else:
            score -= 10
        if score > best_score:
            best_score = score
            best_id = ins.get("id")
    return str(best_id) if best_id and best_score > 0 else None


def resolve_insert_paths(selected_ids: list[str]) -> list[dict]:
    """Return ordered insert entries for the given ids (skips missing)."""
    by_id = {i["id"]: i for i in get_insert_manifest().get("inserts", [])}
    resolved = []
    for iid in selected_ids or []:
        if iid == "2024_weott_proposal_river_map":
            continue
        entry = by_id.get(iid)
        if not entry:
            continue
        if entry.get("kind") == "map":
            continue
        path = BASE_DIR / entry["path"]
        if not path.exists():
            continue
        resolved.append({**entry, "abs_path": str(path)})
    return resolved


def _replace_page(doc: fitz.Document, insert_path: str, page_index: int, warnings: list) -> None:
    src = open_source_pdf(insert_path)
    if src.page_count < 1:
        warnings.append(
            type(
                "ValidationWarning",
                (),
                {"field": "insert", "message": f"Insert has no pages: {insert_path}"},
            )()
        )
        return
    if page_index < 0 or page_index >= doc.page_count:
        warnings.append(
            type(
                "ValidationWarning",
                (),
                {
                    "field": "insert",
                    "message": (
                        f"target_page {page_index} out of range "
                        f"(doc has {doc.page_count} pages) — appending instead"
                    ),
                },
            )()
        )
        doc.insert_pdf(src, from_page=0, to_page=0, start_at=doc.page_count)
        return
    doc.insert_pdf(src, from_page=0, to_page=0, start_at=page_index)
    doc.delete_page(page_index + 1)


def _insert_page_at(doc: fitz.Document, insert_path: str, start_at: int, warnings: list) -> int:
    """Insert first page of insert_path at start_at. Returns new page count delta (1)."""
    src = open_source_pdf(insert_path)
    if src.page_count < 1:
        warnings.append(
            type(
                "ValidationWarning",
                (),
                {"field": "insert", "message": f"Insert has no pages: {insert_path}"},
            )()
        )
        return 0
    at = max(0, min(start_at, doc.page_count))
    doc.insert_pdf(src, from_page=0, to_page=0, start_at=at)
    return 1


def apply_inserts(doc: fitz.Document, selected_ids: list[str], warnings: list, extra_page_shift: int = 0) -> dict:
    """
    Apply selected inserts to an open document.
    Returns a small report of what was applied.
    """
    resolved = resolve_insert_paths(selected_ids)
    applied = []
    # Partition by kind; preserve user order within kind
    vessels = [r for r in resolved if r.get("kind") == "vessel"]
    staff = [r for r in resolved if r.get("kind") == "staff"]
    maps = []
    others = [r for r in resolved if r.get("kind") not in ("vessel", "staff", "map")]

    # Vessel: last wins
    if vessels:
        last = vessels[-1]
        page = last.get("target_page")
        if page is None:
            page = 8
        _replace_page(doc, last["abs_path"], int(page), warnings)
        applied.append({"id": last["id"], "kind": "vessel", "action": "replace", "page": page})
        if len(vessels) > 1:
            warnings.append(
                type(
                    "ValidationWarning",
                    (),
                    {
                        "field": "insert",
                        "message": f"Multiple vessel inserts selected; used last: {last['id']}",
                    },
                )()
            )

    # Maps: insert after vessel page (index 9 after replace keeps vessel at 8)
    map_at = 9
    for m in maps:
        target = m.get("target_page")
        at = int(target) if target is not None else map_at
        delta = _insert_page_at(doc, m["abs_path"], at, warnings)
        if delta:
            applied.append({"id": m["id"], "kind": "map", "action": "insert", "page": at})
            map_at = at + 1

    # Staff: last wins — page index may have shifted if maps were inserted before page 15
    if staff:
        last = staff[-1]
        page = last.get("target_page")
        if page is None:
            page = 15
        # After inserting N map pages at/after index 9, plus any overflow page
        # inserted at extras+1, contact/staff target shifts by N + overflow.
        shift = len(maps) + int(extra_page_shift or 0)
        adjusted = int(page) + shift if int(page) >= 9 else int(page)
        _replace_page(doc, last["abs_path"], adjusted, warnings)
        applied.append(
            {"id": last["id"], "kind": "staff", "action": "replace", "page": adjusted}
        )
        if len(staff) > 1:
            warnings.append(
                type(
                    "ValidationWarning",
                    (),
                    {
                        "field": "insert",
                        "message": f"Multiple staff inserts selected; used last: {last['id']}",
                    },
                )()
            )

    for o in others:
        page = o.get("target_page")
        if page is None:
            _insert_page_at(doc, o["abs_path"], doc.page_count, warnings)
            applied.append({"id": o["id"], "kind": o.get("kind"), "action": "append"})
        else:
            _replace_page(doc, o["abs_path"], int(page), warnings)
            applied.append(
                {"id": o["id"], "kind": o.get("kind"), "action": "replace", "page": page}
            )

    return {"applied": applied, "requested": list(selected_ids or []), "resolved": len(resolved)}
