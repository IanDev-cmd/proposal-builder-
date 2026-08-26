"""Persist quote reviewStatus on the engine workspace store."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class QuoteReviewStoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        os.environ["WORKSPACE_DATA_DIR"] = self._tmp.name
        import workspace_store as ws

        ws.DATA_DIR = Path(self._tmp.name)
        ws.QUOTES_DIR = ws.DATA_DIR / "quotes"
        ws.PROPOSALS_DIR = ws.DATA_DIR / "proposals"
        self.ws = ws

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_new_quote_defaults_pending(self) -> None:
        saved = self.ws.put_quote({"id": "q1", "title": "Test", "grandTotal": "12"})
        self.assertEqual(saved["reviewStatus"], "pending")
        self.assertEqual(self.ws.get_quote("q1")["reviewStatus"], "pending")

    def test_approve_persists(self) -> None:
        self.ws.put_quote({"id": "q1", "title": "Test", "grandTotal": 1})
        saved = self.ws.put_quote(
            {
                "id": "q1",
                "title": "Test",
                "grandTotal": 1,
                "reviewStatus": "approved",
                "reviewedAt": "2026-08-25T12:00:00Z",
            }
        )
        self.assertEqual(saved["reviewStatus"], "approved")
        self.assertEqual(self.ws.get_quote("q1")["reviewStatus"], "approved")

    def test_re_save_without_status_keeps_approval(self) -> None:
        self.ws.put_quote(
            {
                "id": "q1",
                "title": "Test",
                "grandTotal": 1,
                "reviewStatus": "disapproved",
                "reviewedAt": "2026-08-25T12:00:00Z",
            }
        )
        saved = self.ws.put_quote({"id": "q1", "title": "Test updated", "grandTotal": 2})
        self.assertEqual(saved["reviewStatus"], "disapproved")
        self.assertEqual(saved["title"], "Test updated")

    def test_invalid_status_becomes_pending(self) -> None:
        saved = self.ws.put_quote({"id": "q1", "reviewStatus": "maybe"})
        self.assertEqual(saved["reviewStatus"], "pending")

    def test_clear_quotes_leaves_proposals(self) -> None:
        self.ws.put_quote({"id": "q1", "title": "Quote"})
        self.ws.put_proposal({"id": "p1", "title": "Proposal"})
        self.assertEqual(self.ws.clear_quotes(), 1)
        self.assertIsNone(self.ws.get_quote("q1"))
        self.assertIsNotNone(self.ws.get_proposal("p1"))

    def test_clear_proposals_leaves_quotes(self) -> None:
        self.ws.put_quote({"id": "q1", "title": "Quote"})
        self.ws.put_proposal({"id": "p1", "title": "Proposal"})
        self.assertEqual(self.ws.clear_proposals(), 1)
        self.assertIsNone(self.ws.get_proposal("p1"))
        self.assertIsNotNone(self.ws.get_quote("q1"))


if __name__ == "__main__":
    unittest.main()
