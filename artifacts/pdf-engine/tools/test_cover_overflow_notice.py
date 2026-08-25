"""Cover overflow must be a specific notice, not a hard 422."""

from __future__ import annotations

import sys
import unittest
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from profile_validation import (  # noqa: E402
    humanize_cover_overflow,
    validate_render_warnings,
)


@dataclass
class _Warn:
    field: str
    message: str


class CoverOverflowNoticeTest(unittest.TestCase):
    def test_telephone_sentence(self) -> None:
        self.assertEqual(
            humanize_cover_overflow("telephone"),
            "The telephone number is too long for the cover field.",
        )

    def test_shrink_does_not_raise(self) -> None:
        warnings = [
            _Warn(
                field="telephone",
                message="'020 7946 0958 / 07700 900123' had to shrink from 7.5pt to 4.1pt to fit its box",
            )
        ]
        notices = validate_render_warnings(warnings)
        self.assertEqual(notices, ["The telephone number is too long for the cover field."])
        self.assertEqual(warnings[0].message, "The telephone number is too long for the cover field.")


if __name__ == "__main__":
    unittest.main()
