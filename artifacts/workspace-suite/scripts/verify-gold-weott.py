#!/usr/bin/env python3
"""Verify goldFinancialScenarios.json WEOTT via TS-equivalent Python mirror."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / "src" / "lib"
GOLD = LIB / "assets" / "goldFinancialScenarios.json"
RATES = LIB / "costMotherRates.generated.json"
CATALOG = LIB / "quoteBuilderCatalog.ts"

CONT = 0.0225
STAFF_BUF = 3
MIN_H = 4.0
TOL = 0.05

VESSEL_MAP = {
    "WEOTT II (Avontuur)": "Avontuur",
    "WEOTT I (Rose)": "London Rose",
    "WEOTT VI (Elizabethan)": "Elizabethan",
    "WEOTT III (Golden Sal)": "Golden Salamander",
}

MULT_OVERRIDES = {
    "CONTIGENCY STAFF": "hours",
    "Photographer - Corporate/Special": "hours",
    "Photographer - Wedding": "hours",
    "Festive Crackers": "guests",
}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower()).strip()


def load_mults():
    text = CATALOG.read_text(encoding="utf-8")
    mults = {}
    for m in re.finditer(r"L\(\s*'([^']+)'\s*,\s*'((?:\\'|[^'])*)'\s*(?:,\s*'([^']+)')?", text, re.S):
        lab = m.group(2).replace("\\'", "'")
        mults[lab] = MULT_OVERRIDES.get(lab, m.group(3) or "set")
    for m in re.finditer(r'L\(\s*\'([^\']+)\'\s*,\s*"([^"]+)"\s*(?:,\s*\'([^\']+)\')?', text, re.S):
        lab = m.group(2)
        mults[lab] = MULT_OVERRIDES.get(lab, m.group(3) or "set")
    mults.update(MULT_OVERRIDES)
    return mults


def load_rates():
    b = json.loads(RATES.read_text(encoding="utf-8"))
    return {i["label"]: {k: float(v) for k, v in i["rates"].items()} for i in b["items"]}


def hours(emb, dis):
    def tm(t):
        h, m = (t or "0:0").split(":")[:2]
        return int(h) * 60 + int(m)

    mins = tm(dis) - tm(emb)
    return max(1.0, round(mins / 60 * 100) / 100) if mins > 0 else 4.0


def main():
    gold = json.loads(GOLD.read_text(encoding="utf-8"))
    rates = load_rates()
    mults = load_mults()
    failed = False
    for ref, sc in gold.items():
        f = sc["form"]
        vessel_ui = (f.get("vesselType") or ["WEOTT II (Avontuur)"])[0]
        vessel = VESSEL_MAP.get(vessel_ui, vessel_ui)
        key = f"{vessel}|{f['weeklyPeriod']}|{f['dayPeriod']}|{f.get('groupBracket') or 'Standard'}"
        actual = hours(f.get("embarkation", "10:00"), f.get("disembarkation", "18:00"))
        guests = float(f.get("guestCount") or 0)
        tables = float(f.get("noOfTables") or 0)
        labels = set(f.get("costLineLabels") or [])
        labels |= {
            "Vessel/Venue Hire",
            "Catering Delivery Charge (In every quote)",
            "Event Decor (Add to every quote)",
            "Catering/Staff Food Contigency (ADD TO ALL QUOTES)",
        }
        overrides = f.get("lineAmountOverrides") or {}
        sub = 0.0
        for lab in labels:
            if lab in overrides:
                sub += float(overrides[lab])
                continue
            rmap = rates.get(lab)
            if not rmap or key not in rmap:
                print(ref, "NO RATE", lab, key)
                failed = True
                continue
            rate = rmap[key]
            mt = mults.get(lab, "set")
            bill = max(actual, MIN_H) if mt in ("vessel_hours", "hours", "staff_hours") else actual
            if mt in ("vessel_hours", "hours"):
                mult = bill
            elif mt == "staff_hours":
                mult = bill + STAFF_BUF
            elif mt == "guests":
                mult = guests
            elif mt == "tables":
                mult = tables
            else:
                mult = 1
            sub += round(rate * mult, 2)
        for b in f.get("bespokeLines") or []:
            if b.get("enabled") and b.get("amount"):
                sub += float(b["amount"])
        tot = round(sub * (1 + CONT), 2)
        target = sc["goldQuoteWeottCost"]
        delta = round(tot - target, 2)
        ok = abs(delta) <= TOL
        print(f"{ref} calc={tot:.2f} target={target} delta={delta:.2f} {'PASS' if ok else 'FAIL'}")
        if not ok:
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
