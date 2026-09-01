"""V2 vessel-profile insert is chosen for WEOTT II when none was selected."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from inserts import pick_vessel_insert_id, weott_vessel_key  # noqa: E402


class PickVesselInsertTest(unittest.TestCase):
    def test_weott_ii_key(self) -> None:
        self.assertEqual(weott_vessel_key("WEOTT II (Avontuur)"), "weott ii")

    def test_weott_ii_summer_insert(self) -> None:
        picked = pick_vessel_insert_id(
            "WEOTT II (Avontuur)",
            event_type="Summer Event",
            event_date="2026-06-12",
            slot="daytime",
            category="corporate",
        )
        self.assertIsNotNone(picked)
        self.assertTrue(str(picked).startswith("weott_ii_"))
        self.assertNotIn("wedding", str(picked))


if __name__ == "__main__":
    unittest.main()
