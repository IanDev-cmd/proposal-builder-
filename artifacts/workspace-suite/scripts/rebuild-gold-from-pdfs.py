#!/usr/bin/env python3
"""
Rebuild goldFinancialScenarios.json from Natasha Proposal Testing quote sheets.

Source of truth: C:\\Users\\grvns\\Documents\\New folder\\Proposal Testing

Extracts:
  - every YES cost line (incl. wrapped cutlery delivery)
  - bespoke amounts
  - Weekly Period / Day Period / No. of tables
  - Total Cost (to WEOTT)

Applies engine fixes needed for Quote Sheet parity:
  - CONTIGENCY STAFF × event hours (not staff_hours)
  - Photographers × event hours (not staff_hours)
  - Festive Crackers × guests
  - min billable hours = 4 for vessel/hours/staff
  - Welcome pack sheet amount £5
  - sheet amount overrides when formula ≠ sheet (BG Music, WiFi, etc.)

Usage:
  python artifacts/workspace-suite/scripts/rebuild-gold-from-pdfs.py
  python artifacts/workspace-suite/scripts/rebuild-gold-from-pdfs.py --apply
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

try:
    import fitz
except ImportError as e:
    raise SystemExit("pip install pymupdf") from e

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / "src" / "lib"
ASSETS = LIB / "assets"
CATALOG_TS = LIB / "quoteBuilderCatalog.ts"
RATES_JSON = LIB / "costMotherRates.generated.json"
GOLD_JSON = ASSETS / "goldFinancialScenarios.json"
GOLD_GEN = ASSETS / "goldFinancialScenarios.generated.json"
YES_FIXTURE = (
    ROOT.parent.parent / "exports" / "proposal-testing-scenario" / "fixtures" / "gold-yes-lines.json"
)
PROPOSAL_TESTING = Path(r"C:\Users\grvns\Documents\New folder\Proposal Testing")

TOLERANCE = 0.05
CONTINGENCY = 0.0225
STAFF_HOURS_BUFFER = 3
MIN_BILLABLE_HOURS = 4.0

SCENARIOS = {
    "WE.18900": {
        "version": "V4",
        "label": "Christmas V4 — Space Made",
        "vessel": "Avontuur",
        "vesselUi": "WEOTT II (Avontuur)",
        "emb": "18:00",
        "dis": "22:00",
        "guests": 50,
        "fallbackWeekly": "Mon to Thur",
        "fallbackDay": "Evening",
    },
    "WE.18759": {
        "version": "V2",
        "label": "Summer V2 — The Outnet",
        "vessel": "Avontuur",
        "vesselUi": "WEOTT II (Avontuur)",
        "emb": "13:00",
        "dis": "17:00",
        "guests": 70,
        "fallbackWeekly": "Mon to Thur",
        "fallbackDay": "Daytime",
    },
    "WE.18931": {
        "version": "V2",
        "label": "Team Building V2 — Databarracks",
        "vessel": "Elizabethan",
        "vesselUi": "WEOTT VI (Elizabethan)",
        "emb": "13:00",
        "dis": "17:00",
        "guests": 80,
        "fallbackWeekly": "Thur to Sun",
        "fallbackDay": "Daytime",
    },
    "WE.18937": {
        "version": "V2",
        "label": "Wedding Transfer V2 — Caribou",
        "vessel": "Avontuur",
        "vesselUi": "WEOTT II (Avontuur)",
        "emb": "14:30",
        "dis": "16:30",
        "guests": 150,
        "fallbackWeekly": "Fri to Sun",
        "fallbackDay": "Daytime",
    },
}

LABEL_ALIASES = {
    "weott providing": "Own Food Surcharge",
    "photographer - corporate / special": "Photographer - Corporate/Special",
}

MENU_FROM_CATERING = {
    "hot fork buffet (all seasons)": ["Hot Fork Buffet (All Seasons)"],
    "substantial canapes (all sesons)": ["Substantial Canapes (All Sesons)"],
    "street food station (all seasons)": ["Street Food Station (All Seasons)"],
    "charcuterie cups (all seasons)": ["Charcuterie Cups (All Seasons)"],
    "fruit skewers (spring/summer only)": ["Street Food Station (All Seasons)"],
}

# Catalog multiplier overrides to match Quote Sheet billing
MULT_OVERRIDES = {
    "CONTIGENCY STAFF": "hours",
    "Photographer - Corporate/Special": "hours",
    "Photographer - Wedding": "hours",
    "Festive Crackers": "guests",
}

# Sheet uses £5; Cost Mother snapshot has £20
SHEET_SET_AMOUNTS = {
    "Welcome and Thank You Pack": 5.0,
}

MULTIPLIERS: dict[str, str] = {}


def norm(s: str) -> str:
    return (
        re.sub(r"\s+", " ", s.lower())
        .replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("\ufffd", "")
        .strip()
    )


def load_catalog() -> list[dict]:
    text = CATALOG_TS.read_text(encoding="utf-8")
    lines: list[dict] = []
    seen: set[str] = set()
    # Multiline-safe: L( 'section', 'label', 'mult'
    for m in re.finditer(
        r"L\(\s*'([^']+)'\s*,\s*'((?:\\'|[^'])*)'\s*(?:,\s*'([^']+)')?",
        text,
        re.S,
    ):
        section, label, mult = m.group(1), m.group(2).replace("\\'", "'"), m.group(3) or "set"
        if label in seen:
            continue
        seen.add(label)
        mult = MULT_OVERRIDES.get(label, mult)
        lines.append({"section": section, "label": label, "multiplier": mult})
        MULTIPLIERS[label] = mult
    for m in re.finditer(
        r'L\(\s*\'([^\']+)\'\s*,\s*"([^"]+)"\s*(?:,\s*\'([^\']+)\')?',
        text,
        re.S,
    ):
        section, label, mult = m.group(1), m.group(2), m.group(3) or "set"
        if label in seen:
            continue
        seen.add(label)
        mult = MULT_OVERRIDES.get(label, mult)
        lines.append({"section": section, "label": label, "multiplier": mult})
        MULTIPLIERS[label] = mult
    for lab, mt in MULT_OVERRIDES.items():
        MULTIPLIERS[lab] = mt
    return lines


def map_to_catalog(raw: str, catalog: list[dict]) -> str | None:
    raw = raw.strip().rstrip(":")
    alias = LABEL_ALIASES.get(norm(raw))
    if alias:
        return alias
    n = norm(raw)
    labels = [c["label"] for c in catalog]
    for c in labels:
        if norm(c) == n:
            return c
    for c in labels:
        cn = norm(c)
        if n and (n in cn or cn in n):
            return c
    return None


def find_quote_sheet(ref: str, version: str) -> Path:
    for p in PROPOSAL_TESTING.rglob("*.pdf"):
        if ref in str(p) and version in p.name and ("Quote Sheet" in p.name or "Client Data" in p.name):
            return p
    raise FileNotFoundError(f"No quote sheet for {ref} {version}")


def page_rows(page) -> list[list[str]]:
    words = page.get_text("words")
    by_y: dict[float, list] = defaultdict(list)
    for w in words:
        by_y[round(w[1], 0)].append(w)
    rows = []
    for _, row in sorted(by_y.items()):
        row = sorted(row, key=lambda w: w[0])
        rows.append([w[4] for w in row])
    return rows


def extract_field_value(rows: list[list[str]], label: str) -> str | None:
    """Find 'Label Value' on same row, or Label on one row and value on next."""
    for i, texts in enumerate(rows):
        line = " ".join(texts)
        if label not in line:
            continue
        # same-row: Label <value>
        m = re.search(re.escape(label) + r"\s+(.+)$", line)
        if m:
            val = m.group(1).strip()
            # stop at next known field header fragments
            for stop in ("Day Period", "Group Size", "No. of", "Section", "Weekly Period"):
                if stop in val and stop != label:
                    val = val.split(stop)[0].strip()
            if val and val not in ("Day Period", "Group Size"):
                return val
        # next non-empty row
        for j in range(i + 1, min(i + 3, len(rows))):
            nxt = " ".join(rows[j]).strip()
            if nxt and not nxt.endswith(":"):
                return nxt.split()[0] if label.startswith("No.") else nxt
    return None


def parse_pdf(pdf: Path, catalog: list[dict]):
    doc = fitz.open(pdf)
    all_rows: list[list[str]] = []
    yes_rows: list[tuple[str, float | None]] = []

    for page in doc:
        rows = page_rows(page)
        all_rows.extend(rows)
        for texts in rows:
            if not any(t.upper() == "YES" for t in texts):
                continue
            idx = next(i for i, t in enumerate(texts) if t.upper() == "YES")
            label = " ".join(texts[:idx]).strip(" :-|")
            tail = " ".join(texts[idx:])
            if "no commission" in tail.lower() or label in ("Agent Referral", "Repeat Client"):
                continue
            if not label:
                label = "Delivery charge for cutlery and linen (or contigency for lost/damage items)"
            nums = re.findall(r"([\d,]+\.\d{2})", tail.replace("\ufffd", ""))
            amt = float(nums[0].replace(",", "")) if nums else None
            yes_rows.append((label, amt))

    weekly = extract_field_value(all_rows, "Weekly Period")
    day = extract_field_value(all_rows, "Day Period")
    tables_raw = extract_field_value(all_rows, "No. of tables")
    tables = None
    if tables_raw:
        m = re.search(r"(\d+)", tables_raw)
        if m:
            tables = int(m.group(1))

    # Prefer word-row scan for period (more reliable)
    for texts in all_rows:
        line = " ".join(texts)
        if line.startswith("Weekly Period") and len(texts) >= 2:
            # e.g. ['Weekly', 'Period', 'Mon', 'to', 'Thur'] or ['Weekly Period', 'Fri to Sun']
            rest = line.replace("Weekly Period", "", 1).strip()
            if rest in ("Mon to Thur", "Fri to Sun", "Mon to Wed", "Thur to Sun"):
                weekly = rest
            elif "Mon to Thur" in line:
                weekly = "Mon to Thur"
            elif "Fri to Sun" in line:
                weekly = "Fri to Sun"
            elif "Thur to Sun" in line:
                weekly = "Thur to Sun"
            elif "Mon to Wed" in line:
                weekly = "Mon to Wed"
        if line.startswith("Day Period"):
            if "Evening" in line:
                day = "Evening"
            elif "Daytime" in line:
                day = "Daytime"
        if "No. of tables" in line:
            m = re.search(r"No\. of tables\s+(\d+)", line)
            if m:
                tables = int(m.group(1))

    sheet_weott = None
    for texts in all_rows:
        line = " ".join(texts)
        if "Total Cost (to WEOTT)" in line:
            nums = re.findall(r"([\d,]+\.\d{2})", line.replace("\ufffd", ""))
            if nums:
                sheet_weott = float(nums[0].replace(",", ""))
                break

    doc.close()

    cost_labels: list[str] = []
    sheet_amounts: dict[str, float] = {}
    bespoke_amts: list[tuple[str, float]] = []
    unmapped: list[str] = []
    seen: set[str] = set()

    rates_probe = json.loads(RATES_JSON.read_text(encoding="utf-8"))
    rate_items = {i["label"]: i["rates"] for i in rates_probe["items"]}

    for raw, amt in yes_rows:
        if re.match(r"^Bespoke(?:\s*\(\d+\))?$", raw or "", re.I):
            if amt and amt > 0:
                label = "Bar tab" if "1" in raw else raw
                bespoke_amts.append((label, amt))
            continue
        mapped = map_to_catalog(raw, catalog)
        # Street food amount parked on WEOTT Providing
        if mapped == "Own Food Surcharge" and amt and amt > 500:
            mapped = "Street Food Station (All Seasons)"
        if not mapped:
            unmapped.append(raw)
            continue
        if mapped not in seen:
            seen.add(mapped)
            cost_labels.append(mapped)
        if amt is not None:
            sheet_amounts[mapped] = amt

    return {
        "weeklyPeriod": weekly,
        "dayPeriod": day,
        "tables": tables,
        "sheetWeott": sheet_weott,
        "costLineLabels": cost_labels,
        "sheetAmounts": sheet_amounts,
        "bespoke": bespoke_amts,
        "unmapped": unmapped,
    }


def load_rate_index():
    bundle = json.loads(RATES_JSON.read_text(encoding="utf-8"))
    idx = {}
    for item in bundle["items"]:
        rates = {k: float(v) for k, v in item["rates"].items()}
        idx[item["label"]] = rates
        idx[norm(item["label"])] = rates
    return idx


def lookup_rate(label: str, key: str, rate_idx: dict) -> float | None:
    for k in (label, norm(label)):
        m = rate_idx.get(k)
        if m and key in m:
            return m[key]
    return None


def event_hours(emb: str, dis: str) -> float:
    def to_min(t: str) -> int:
        h, m = (t or "0:0").split(":")[:2]
        return int(h) * 60 + int(m)

    mins = to_min(dis) - to_min(emb)
    if mins <= 0:
        return 4.0
    return max(1.0, round(mins / 60 * 100) / 100)


def billable_hours(actual: float, mt: str) -> float:
    if mt in ("vessel_hours", "hours", "staff_hours"):
        return max(actual, MIN_BILLABLE_HOURS)
    return actual


def calc_line(
    label: str,
    key: str,
    rate_idx: dict,
    actual_h: float,
    guests: float,
    tables: float,
    sheet_amounts: dict[str, float],
) -> tuple[float, str | None]:
    """Return (amount, note). Prefer sheet amount when formula drifts > £1."""
    if label in SHEET_SET_AMOUNTS:
        return SHEET_SET_AMOUNTS[label], "sheet_set"

    rate = lookup_rate(label, key, rate_idx)
    mt = MULTIPLIERS.get(label, "set")
    if rate is None:
        if label in sheet_amounts:
            return sheet_amounts[label], "sheet_only"
        return 0.0, "no_rate"

    bill_h = billable_hours(actual_h, mt)
    if mt in ("vessel_hours", "hours"):
        mult = bill_h
    elif mt == "staff_hours":
        mult = bill_h + STAFF_HOURS_BUFFER
    elif mt == "guests":
        mult = guests
    elif mt == "tables":
        mult = tables
    else:
        mult = 1.0
    formula = round(rate * mult + 1e-9, 2)
    sheet = sheet_amounts.get(label)
    if sheet is not None and abs(sheet - formula) > 1.0:
        return sheet, f"sheet_override formula={formula}"
    return formula, None


def calc_weott(
    labels: list[str],
    key: str,
    rate_idx: dict,
    actual_h: float,
    guests: float,
    tables: float,
    bespoke_total: float,
    sheet_amounts: dict[str, float],
) -> tuple[float, list[str], dict[str, float]]:
    selected = set(labels)
    for d in (
        "Vessel/Venue Hire",
        "Catering Delivery Charge (In every quote)",
        "Event Decor (Add to every quote)",
        "Catering/Staff Food Contigency (ADD TO ALL QUOTES)",
    ):
        selected.add(d)

    notes = []
    overrides: dict[str, float] = {}
    sub = 0.0
    for lab in selected:
        amt, note = calc_line(lab, key, rate_idx, actual_h, guests, tables, sheet_amounts)
        if note == "no_rate":
            notes.append(f"No rate: {lab}")
            continue
        if note and note.startswith("sheet_override"):
            overrides[lab] = amt
            notes.append(f"{lab}: {note}")
        elif note == "sheet_set":
            overrides[lab] = amt
        sub += amt
    sub += bespoke_total
    cont = round(sub * CONTINGENCY + 1e-9, 2)
    return round(sub + cont + 1e-9, 2), notes, overrides


def build_bespoke_lines(bespoke: list[tuple[str, float]]) -> list[dict]:
    out = []
    for i, (label, amount) in enumerate(bespoke[:4]):
        out.append({"id": f"bespoke_{i+1}", "label": label, "amount": amount, "enabled": amount > 0})
    while len(out) < 4:
        n = len(out) + 1
        out.append({"id": f"bespoke_{n}", "label": f"Bespoke ({n})", "amount": 0, "enabled": False})
    return out


def infer_menu(labels: list[str]) -> list[str]:
    for lab in labels:
        menu = MENU_FROM_CATERING.get(norm(lab))
        if menu:
            return menu
    return []


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    catalog = load_catalog()
    rate_idx = load_rate_index()
    existing = json.loads(GOLD_JSON.read_text(encoding="utf-8")) if GOLD_JSON.exists() else {}

    out = {}
    yes_fixture = {}
    failed = False

    for ref, cfg in SCENARIOS.items():
        pdf = find_quote_sheet(ref, cfg["version"])
        parsed = parse_pdf(pdf, catalog)

        weekly = parsed["weeklyPeriod"] or cfg["fallbackWeekly"]
        day = parsed["dayPeriod"] or cfg["fallbackDay"]
        # sanitize bad parses
        if weekly not in ("Mon to Thur", "Fri to Sun", "Mon to Wed", "Thur to Sun"):
            weekly = cfg["fallbackWeekly"]
        if day not in ("Daytime", "Evening"):
            day = cfg["fallbackDay"]
        tables = parsed["tables"] or int(existing.get(ref, {}).get("form", {}).get("noOfTables") or 10)

        base = existing.get(ref, {})
        form = dict(base.get("form") or {})
        labels = parsed["costLineLabels"]
        form["costLineLabels"] = labels
        form["quoteVersion"] = cfg["version"]
        form["weeklyPeriod"] = weekly
        form["dayPeriod"] = day
        form["groupBracket"] = form.get("groupBracket") or "Standard"
        form["noOfTables"] = str(tables)
        form["guestCount"] = str(cfg["guests"])
        form["embarkation"] = cfg["emb"]
        form["disembarkation"] = cfg["dis"]
        form["vesselType"] = [cfg["vesselUi"]]

        bespoke_lines = build_bespoke_lines(parsed["bespoke"])
        form["bespokeLines"] = bespoke_lines
        if bespoke_lines[0]["enabled"]:
            form["bespokeAmount"] = bespoke_lines[0]["amount"]
            form["bespokeLabel"] = bespoke_lines[0]["label"]

        menu = infer_menu(labels)
        if menu:
            form["menuType"] = menu

        actual_h = event_hours(cfg["emb"], cfg["dis"])
        key = f"{cfg['vessel']}|{weekly}|{day}|Standard"
        bespoke_total = sum(b["amount"] for b in bespoke_lines if b["enabled"])

        calc_val, notes, overrides = calc_weott(
            labels,
            key,
            rate_idx,
            actual_h,
            float(cfg["guests"]),
            float(tables),
            bespoke_total,
            parsed["sheetAmounts"],
        )
        if overrides:
            form["lineAmountOverrides"] = overrides

        target = parsed["sheetWeott"] if parsed["sheetWeott"] is not None else base.get("goldQuoteWeottCost", calc_val)
        delta = round(calc_val - target, 2)
        ok = abs(delta) <= TOLERANCE

        margin = base.get("marginPercent", 25)
        if isinstance(margin, str):
            margin = float(margin)

        out[ref] = {
            "label": cfg["label"],
            "goldQuoteWeottCost": target,
            "marginPercent": margin,
            "form": form,
            "_meta": {
                "sourcePdf": str(pdf),
                "key": key,
                "tables": tables,
                "calcWeott": calc_val,
                "sheetWeott": parsed["sheetWeott"],
                "delta": delta,
                "ok": ok,
                "unmapped": parsed["unmapped"],
                "overrides": overrides,
                "notes": notes,
            },
        }
        yes_fixture[ref] = {
            "version": cfg["version"],
            "sourcePdf": str(pdf),
            "sheetWeott": parsed["sheetWeott"],
            "weeklyPeriod": weekly,
            "dayPeriod": day,
            "noOfTables": tables,
            "costLineLabels": labels,
            "sheetAmounts": parsed["sheetAmounts"],
            "bespokeLines": bespoke_lines,
            "lineAmountOverrides": overrides,
            "unmapped": parsed["unmapped"],
        }

        status = "PASS" if ok else "FAIL"
        print(f"\n{ref} {cfg['version']} -- {status}")
        print(f"  PDF: {pdf.name}")
        print(f"  key={key} tables={tables} YES={len(labels)}")
        if parsed["unmapped"]:
            for u in parsed["unmapped"]:
                print(f"    ! unmapped {u}")
        print(f"  Sheet WEOTT={parsed['sheetWeott']}  Calc={calc_val:.2f}  delta={delta:.2f}")
        if overrides:
            print(f"  overrides: {overrides}")
        if not ok:
            failed = True
            for n in notes[:8]:
                print(f"    {n}")

    gold_out = {
        ref: {
            "label": e["label"],
            "goldQuoteWeottCost": e["goldQuoteWeottCost"],
            "marginPercent": e["marginPercent"],
            "form": e["form"],
        }
        for ref, e in out.items()
    }
    gen_payload = {
        ref: {
            **gold_out[ref],
            "calcWeott": out[ref]["_meta"]["calcWeott"],
            "delta": out[ref]["_meta"]["delta"],
            "ok": out[ref]["_meta"]["ok"],
            "unmapped": out[ref]["_meta"]["unmapped"],
            "overrides": out[ref]["_meta"]["overrides"],
        }
        for ref in out
    }

    GOLD_GEN.write_text(json.dumps(gen_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nWrote {GOLD_GEN}")
    YES_FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    YES_FIXTURE.write_text(json.dumps(yes_fixture, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {YES_FIXTURE}")

    if args.apply:
        GOLD_JSON.write_text(json.dumps(gold_out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Applied -> {GOLD_JSON}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
