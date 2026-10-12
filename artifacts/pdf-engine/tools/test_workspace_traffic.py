"""Quote summaries, deleted-quote conflicts, and catalog PUT size."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ["WORKSPACE_STORE"] = "memory"
os.environ.pop("DATABASE_URL", None)
os.environ["NEXUS_AUTH_TEST"] = "1"
os.environ["NEXUS_TEAM_PASSWORD"] = "945762"
os.environ["NEXUS_AUTH_SECRET"] = "test-signing-secret-please-ignore"


class WorkspaceTrafficTest(unittest.TestCase):
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

    def _fat_quote(self) -> dict:
        return {
            "id": "quote-WE.19167-V1",
            "title": "Christmas",
            "leadKey": "lead-1",
            "leadName": "Meera",
            "referenceNumber": "WE.19167",
            "vesselType": "Barge",
            "eventType": "Corporate",
            "guestCount": "40",
            "eventDate": "2026-12-12",
            "grandTotal": 1200,
            "step": 3,
            "reviewStatus": "pending",
            "proposalId": "p1",
            "data": {"blob": "X" * 8000, "lines": [1, 2, 3]},
            "lead": {"name": "Meera", "notes": "Y" * 2000},
            "internalNote": "not-a-list-field",
        }

    def test_quote_list_is_a_summary(self) -> None:
        self.ws.put_quote(self._fat_quote())
        listed = self.ws.list_quotes()
        self.assertEqual(len(listed), 1)
        row = listed[0]
        self.assertEqual(row["id"], "quote-WE.19167-V1")
        self.assertEqual(row["leadName"], "Meera")
        self.assertEqual(row["grandTotal"], 1200)
        self.assertNotIn("data", row)
        self.assertNotIn("lead", row)
        self.assertNotIn("internalNote", row)
        encoded = json.dumps(row)
        self.assertLess(len(encoded), 800)
        self.assertNotIn("XXXX", encoded)

    def test_full_query_keeps_the_document(self) -> None:
        self.ws.put_quote(self._fat_quote())
        full = self.ws.list_quotes(full=True)
        self.assertEqual(full[0]["data"]["lines"], [1, 2, 3])
        self.assertEqual(full[0]["lead"]["name"], "Meera")
        fetched = self.ws.get_quote("quote-WE.19167-V1")
        self.assertEqual(fetched["data"]["lines"], [1, 2, 3])

    def test_put_deleted_quote_stays_deleted(self) -> None:
        self.ws.put_quote(self._fat_quote())
        self.assertTrue(self.ws.delete_quote("quote-WE.19167-V1"))
        with self.assertRaises(self.ws.QuoteDeletedError):
            self.ws.put_quote(self._fat_quote())
        self.assertIsNone(self.ws.get_quote("quote-WE.19167-V1"))
        self.assertEqual(self.ws.list_quotes(), [])
        self.assertEqual(self.ws.list_quotes(full=True), [])

    def test_catalog_put_body_omits_the_payload(self) -> None:
        saved = self.ws.put_rates_catalog(
            {
                "catalogBuiltAt": "2026-10-12T11:00:00Z",
                "payload": {"lines": ["Z" * 5000]},
            }
        )
        body = self.ws.catalog_put_body(saved)
        self.assertEqual(set(body), {"ok", "savedAt", "catalogBuiltAt"})
        self.assertTrue(body["ok"])
        self.assertEqual(body["catalogBuiltAt"], "2026-10-12T11:00:00Z")
        self.assertNotIn("payload", body)
        stored = self.ws.get_rates_catalog()
        self.assertIn("payload", stored)
        self.assertEqual(len(stored["payload"]["lines"][0]), 5000)

    def test_http_summary_conflict_and_catalog(self) -> None:
        import app as engine_app

        client = engine_app.app.test_client()
        login = client.post("/auth/login", json={"pin": "945762"})
        self.assertEqual(login.status_code, 200, login.get_data(as_text=True))
        headers = {"Authorization": f"Bearer {login.get_json()['token']}"}

        created = client.put(
            "/workspace/quotes/quote-WE.19167-V1",
            headers=headers,
            json=self._fat_quote(),
        )
        self.assertEqual(created.status_code, 200, created.get_data(as_text=True))

        listed = client.get("/workspace/quotes", headers=headers)
        self.assertEqual(listed.status_code, 200)
        payload = listed.get_json()["quotes"][0]
        self.assertNotIn("data", payload)
        self.assertNotIn("lead", payload)
        self.assertLess(listed.content_length or len(listed.data), 800)

        full = client.get("/workspace/quotes?full=1", headers=headers)
        self.assertIn("data", full.get_json()["quotes"][0])
        one = client.get("/workspace/quotes/quote-WE.19167-V1", headers=headers)
        self.assertEqual(one.status_code, 200)
        self.assertEqual(one.get_json()["data"]["lines"], [1, 2, 3])

        deleted = client.delete("/workspace/quotes/quote-WE.19167-V1", headers=headers)
        self.assertEqual(deleted.status_code, 200)
        revived = client.put(
            "/workspace/quotes/quote-WE.19167-V1",
            headers=headers,
            json=self._fat_quote(),
        )
        self.assertEqual(revived.status_code, 409)
        self.assertEqual(revived.get_json()["error"], "Quote was deleted")
        gone = client.get("/workspace/quotes/quote-WE.19167-V1", headers=headers)
        self.assertEqual(gone.status_code, 404)

        catalog = client.put(
            "/workspace/catalog",
            headers=headers,
            json={"catalogBuiltAt": "2026-10-12T11:00:00Z", "payload": {"lines": ["Z" * 4000]}},
        )
        self.assertEqual(catalog.status_code, 200)
        answer = catalog.get_json()
        self.assertEqual(set(answer), {"ok", "savedAt", "catalogBuiltAt"})
        self.assertLess(len(catalog.data), 400)
        fetched_catalog = client.get("/workspace/catalog", headers=headers)
        self.assertIn("payload", fetched_catalog.get_json())

    def test_gunicorn_stays_one_worker_on_starter(self) -> None:
        for path in (REPO / "render.yaml", ROOT / "render.yaml"):
            text = path.read_text(encoding="utf-8")
            self.assertIn("plan: starter", text, path)
            self.assertIn("--timeout 60 --preload", text, path)
            self.assertNotIn("--timeout 120", text, path)
            self.assertNotIn("--workers", text, path)
        proc = (ROOT / "Procfile").read_text(encoding="utf-8")
        self.assertIn("--timeout 60", proc)
        self.assertNotIn("--workers", proc)


if __name__ == "__main__":
    unittest.main()
