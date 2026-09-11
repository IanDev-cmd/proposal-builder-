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
        os.environ["WORKSPACE_STORE"] = "memory"
        os.environ.pop("DATABASE_URL", None)
        import workspace_store as ws

        ws.DATA_DIR = Path(self._tmp.name)
        ws.reset_memory()
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

    def test_proposal_pdf_round_trip(self) -> None:
        import base64

        raw = b"%PDF-1.4 test"
        data_url = "data:application/pdf;base64," + base64.b64encode(raw).decode("ascii")
        saved = self.ws.put_proposal({"id": "p-pdf", "title": "Deck", "pdfDataUrl": data_url})
        self.assertTrue(saved["hasPdf"])
        listed = self.ws.list_proposals(include_pdf=False)
        self.assertEqual(len(listed), 1)
        self.assertNotIn("pdfDataUrl", listed[0])
        fetched = self.ws.get_proposal("p-pdf")
        self.assertTrue(str(fetched["pdfDataUrl"]).startswith("data:application/pdf;base64,"))

    def test_deleted_quote_hidden(self) -> None:
        self.ws.put_quote({"id": "q1", "title": "Quote"})
        self.assertTrue(self.ws.delete_quote("q1"))
        self.assertIsNone(self.ws.get_quote("q1"))
        self.assertEqual(self.ws.list_quotes(), [])


if __name__ == "__main__":
    unittest.main()
