"""Meeting-notes PDF checks: Page 13 columns + cover event timings.

Uses the Lily Day / WE.19108 sample when present, and the Client Event
evening template as the standard Page 13 layout.
"""
from __future__ import annotations

import sys
from pathlib import Path

import fitz

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = Path(r"C:\Users\grvns\Downloads\Proposal - Lily Day (OpusApeiro) - WE.19108.pdf")
TEMPLATE = ROOT / "assets/templates/catalog/corporate/client_event/evening/template.pdf"

PACKAGE_MARKERS = (
    "Entertainment",
    "Decorative items",
    "Stationery",
    "Food and beverages",
    "Full event management",
    "Consider upgrading",
    "Embark will begin",
    "Boat departs",
)


def page_text(page) -> str:
    return page.get_text("text") or ""


def find_bespoke(doc) -> int:
    for i, page in enumerate(doc):
        t = page_text(page)
        if "YOUR BESPOKE PACKAGE" in t.upper() and "CONTENTS" not in t.upper():
            return i
    raise SystemExit("No Page 13 / Your Bespoke Package page found")


def main() -> int:
    failed = 0

    def check(name: str, ok: bool, detail: str = "") -> None:
        nonlocal failed
        if ok:
            print(f"PASS  {name}")
        else:
            failed += 1
            print(f"FAIL  {name}" + (f" — {detail}" if detail else ""))

    tpl = fitz.open(TEMPLATE)
    tidx = find_bespoke(tpl)
    ttext = page_text(tpl[tidx])
    for m in PACKAGE_MARKERS:
        check(f"template has {m}", m.lower() in ttext.lower())
    tpl.close()

    sys.path.insert(0, str(ROOT))
    from cover_contact import format_event_timings

    formatted = format_event_timings(
        "18:45 - 23:00",
        include_tbc=False,
        departure="19:00",
        return_time="22:45",
        disembarkation="23:00",
    )
    check("cover uses departure not embarkation", formatted.startswith("19:00hrs") and "18:45" not in formatted, formatted)
    check("cover ends at event finish not pier return", "23:00hrs" in formatted and "22:45" not in formatted, formatted)

    if SAMPLE.exists():
        gen = fitz.open(SAMPLE)
        gidx = find_bespoke(gen)
        gtext = page_text(gen[gidx])
        for m in PACKAGE_MARKERS:
            check(f"sample Page 13 has {m}", m.lower() in gtext.lower())
        check("sample itinerary is 18:45/19:00/23:00", "18:45hrs" in gtext and "19:00hrs" in gtext and "23:00hrs" in gtext)
        cover = page_text(gen[0])
        check("sample cover event window is 19:00–23:00", "19:00hrs" in cover and "23:00hrs" in cover)
        check("sample cover does not show 18:45 as event timings", "18:45" not in cover)
        gen.close()
    else:
        print("SKIP  sample PDF not on disk")

    if failed:
        print(f"\n{failed} PDF check(s) failed")
        return 1
    print("\nAll Page 13 / cover PDF checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
