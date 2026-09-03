"""Guest count and cover date formatters."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from cover_contact import format_event_date, format_event_timings, format_guest_count, format_guest_range


def main() -> int:
    failed = 0

    def check(name: str, ok: bool, detail: str = "") -> None:
        nonlocal failed
        if ok:
            print(f"PASS  {name}")
        else:
            failed += 1
            print(f"FAIL  {name}" + (f" — {detail}" if detail else ""))

    check("guest 50.0 is 50", format_guest_count(50.0) == "50", repr(format_guest_count(50.0)))
    check("guest string 50.0 is 50", format_guest_count("50.0") == "50")
    check("guest range strips decimals", format_guest_range("50.0-80.0") == "50 \u2013 80")
    check(
        "cover date is full weekday month",
        format_event_date("2026-09-03") == "Thursday 3rd September 2026",
        format_event_date("2026-09-03"),
    )
    formatted = format_event_timings(
        "17:45 - 22:00",
        include_tbc=False,
        departure="18:00",
        return_time="22:00",
        embarkation="17:45",
    )
    check("cover uses departure not embark", formatted.startswith("18:00hrs") and "17:45" not in formatted, formatted)

    if failed:
        print(f"\n{failed} check(s) failed")
        return 1
    print("\nAll formatter checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
