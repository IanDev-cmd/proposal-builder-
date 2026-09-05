"""Christmas daytime/evening packs must measure and overlay like other corporates."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from catalog import get_catalog  # noqa: E402
from engine import build_proposal  # noqa: E402
from inserts import pick_vessel_insert_id  # noqa: E402
from measure import get_profile  # noqa: E402
from profile_validation import validate_profile_strict  # noqa: E402

DAY = ROOT / "assets/templates/catalog/corporate/christmas_event/daytime/template.pdf"
EVE = ROOT / "assets/templates/catalog/corporate/christmas_event/evening/template.pdf"
CLIENT = ROOT / "assets/templates/catalog/corporate/client_event/evening/template.pdf"

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

PAYLOAD = {
    "template_id": "corporate/christmas_event/evening",
    "category": "corporate",
    "event_type": "Christmas Event",
    "vessel": "WEOTT II (Avontuur)",
    "selectedInserts": [],
    "lead": {
        "client_name": "Overlay Client",
        "organisation": "Overlay Co",
        "proposal_ref": "WE.99999",
        "prepared_by": "Test Rep",
        "quote_date": "2026-09-05",
        "event_type": "Christmas Event",
        "event_date": "2026-12-12",
        "event_date_flexible": False,
        "event_timings": "18:00 - 22:00",
        "departure": "18:00",
        "return_time": "21:45",
        "disembarkation": "22:00",
        "telephone": "020 7946 0958",
        "email": "ops@overlay.test",
        "guest_range": "50-60",
        "guest_quote_n": 60,
        "contact_name": "Katherine Bulaon",
        "contact_title": "Client Relationship Manager",
        "contact_phone": "020 3452 2222",
        "contact_email": "katherine@westendonthethames.com",
    },
    "calculations": {
        "guests": 60,
        "package_cost": 12000,
        "vat": 2400,
        "grand_total": 14400,
        "per_guest": 200,
    },
    "packageWording": {
        "venue_and_management": [
            {
                "heading": "4 hours private venue hire – timings can be amended upon request - current itinerary is as follows;",
                "items": [
                    "Embark will begin at 17:45hrs",
                    "Boat departs at 18:00hrs",
                    "Boat returns at 21:45hrs",
                    "Disembarkation at 22:00hrs",
                ],
            }
        ],
    },
}


def _page_titles(path: Path) -> list[str]:
    import fitz

    doc = fitz.open(path)
    titles = []
    for i, page in enumerate(doc):
        lines = [ln.strip() for ln in (page.get_text("text") or "").splitlines() if ln.strip()]
        titles.append(f"{i}:{' | '.join(lines[:3])[:90]}")
    doc.close()
    return titles


class ChristmasOverlayTest(unittest.TestCase):
    def test_catalog_ids(self) -> None:
        ids = {t["id"] for t in get_catalog().templates}
        self.assertIn("corporate/christmas_event/daytime", ids)
        self.assertIn("corporate/christmas_event/evening", ids)
        self.assertTrue(DAY.exists())
        self.assertTrue(EVE.exists())

    def test_profiles_match_corporate_gates(self) -> None:
        for path, tid in ((DAY, "corporate/christmas_event/daytime"), (EVE, "corporate/christmas_event/evening")):
            profile = get_profile(str(path), force=True)
            validate_profile_strict(profile, template_id=tid, category="corporate")
            self.assertGreaterEqual(profile.pages, 16)
            self.assertIsNotNone(profile.page_bespoke)
            self.assertIsNotNone(profile.page_vessel)
            self.assertIsNotNone(profile.page_contact)
            self.assertEqual(profile.page_vessel, 8, f"{tid} vessel page drifted")
            self.assertEqual(profile.page_contact, 15, f"{tid} contact page drifted")
            required = {
                "proposal_ref",
                "prepared_by",
                "quote_date",
                "client_name",
                "organisation",
                "telephone",
                "email",
                "event_type",
                "event_date",
                "event_timings",
                "guest_range",
                "guest_quote_n",
            }
            self.assertTrue(required.issubset(profile.cover_fields.keys()), profile.cover_fields.keys())
            self.assertTrue(profile.financial_fields)
            self.assertTrue(profile.package_columns)
            qd = profile.cover_fields["quote_date"]["bbox"][0]
            cn = profile.cover_fields["prepared_by"].get("label_x0") or profile.cover_fields["client_name"]["bbox"][0]
            self.assertGreaterEqual(qd, 220.0, f"{tid} quote_date x0 {qd} left of cover labels")
            self.assertAlmostEqual(qd, float(cn), delta=2.0, msg=f"{tid} quote_date x0 {qd} vs label {cn}")
            self.assertLessEqual(profile.cover_fields["quote_date"]["bbox"][2], 347.0)

    def test_all_catalog_templates_pass_layout_gates(self) -> None:
        cat = get_catalog()
        self.assertGreaterEqual(len(cat.templates), 20)
        for t in cat.templates:
            path = ROOT / t["path"]
            self.assertTrue(path.exists(), t["id"])
            profile = get_profile(str(path), force=True)
            validate_profile_strict(profile, template_id=t["id"], category=t.get("category"))

    def test_page13_markers_like_client_event(self) -> None:
        import fitz

        client = fitz.open(CLIENT)
        client_idx = None
        for i, page in enumerate(client):
            if "YOUR BESPOKE PACKAGE" in (page.get_text("text") or "").upper() and "CONTENTS" not in (
                page.get_text("text") or ""
            ).upper():
                client_idx = i
                break
        self.assertIsNotNone(client_idx)
        client.close()

        for path in (DAY, EVE):
            doc = fitz.open(path)
            profile = get_profile(str(path), force=True)
            text = (doc[profile.page_bespoke].get_text("text") or "").lower()
            for marker in PACKAGE_MARKERS:
                self.assertIn(marker.lower(), text, f"{path.name} missing {marker}")
            doc.close()

    def test_christmas_vessel_insert_is_seasonal(self) -> None:
        picked = pick_vessel_insert_id(
            "WEOTT II (Avontuur)",
            event_type="Christmas Event",
            event_date="2026-12-12",
            slot="evening",
            category="corporate",
        )
        self.assertIsNotNone(picked)
        self.assertIn("christmas", str(picked))
        self.assertNotIn("except_christmas", str(picked))

    def test_overlay_writes_lead_not_template_sample(self) -> None:
        import fitz

        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "christmas.pdf"
            report = build_proposal(PAYLOAD, "AUTO", str(out))
            self.assertTrue(out.exists())
            self.assertEqual(report.get("template_id"), "corporate/christmas_event/evening")
            doc = fitz.open(out)
            cover = doc[0].get_text("text") or ""
            self.assertIn("Overlay Client", cover)
            self.assertIn("| Overlay Client", cover)
            self.assertIn("Overlay Co", cover)
            self.assertIn("WE.99999", cover)
            self.assertNotIn("Sarah Prentice", cover)
            self.assertNotIn("Blue Apple", cover)
            self.assertIn("Christmas Event", cover)
            self.assertIn("18:00hrs", cover)
            self.assertIn("22:00hrs", cover)
            profile = get_profile(str(EVE), force=True)
            pack = doc[profile.page_bespoke].get_text("text") or ""
            self.assertIn("Embark will begin", pack)
            self.assertIn("18:00hrs", pack)
            doc.close()

    def test_cover_date_line_margin_and_validity(self) -> None:
        import fitz

        out_dir = ROOT / "tools" / "output"
        out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / "cover_quote_date_september.pdf"
        payload = json.loads(json.dumps(PAYLOAD))
        payload["lead"]["quote_date"] = "2026-09-05"
        report = build_proposal(payload, "AUTO", str(out))
        self.assertTrue(out.exists(), report)
        profile = get_profile(str(EVE), force=True)
        label_x = float(profile.cover_fields["prepared_by"]["label_x0"])
        doc = fitz.open(out)
        page = doc[0]
        self._assert_gold_date_line(page, label_x, tid="christmas evening")
        self.assertNotIn("27 January 2026", page.get_text("text") or "")
        doc.close()

    def test_all_catalog_covers_match_gold_date_line(self) -> None:
        import fitz

        from cover_contact import fill_cover_page
        from fonts import get_font_manager

        fm = get_font_manager()
        lead = dict(PAYLOAD["lead"])
        lead["quote_date"] = "2026-09-05"
        out_dir = ROOT / "tools" / "output"
        out_dir.mkdir(parents=True, exist_ok=True)
        checked = 0
        save_ids = {
            "corporate/christmas_event/evening",
            "corporate/christmas_event/daytime",
            "corporate/client_event/evening",
        }
        for t in get_catalog().templates:
            path = ROOT / t["path"]
            profile = get_profile(str(path), force=True)
            if "quote_date" not in (profile.cover_fields or {}):
                continue
            doc = fitz.open(path)
            fill_cover_page(doc, lead, fm, [], profile)
            page = doc[profile.page_cover]
            label_x = float(
                (profile.cover_fields.get("prepared_by") or {}).get("label_x0")
                or profile.cover_fields["quote_date"]["origin"][0]
            )
            self._assert_gold_date_line(page, label_x, tid=t["id"])
            if t["id"] in save_ids:
                dest = out_dir / f"cover_quote_date_{t['id'].replace('/', '_')}.pdf"
                doc.save(str(dest), garbage=3, deflate=True)
            doc.close()
            checked += 1
        self.assertGreaterEqual(checked, 18)

    def _assert_gold_date_line(self, page, label_x: float, *, tid: str) -> None:
        date_hit = page.search_for("5 September 2026")
        valid_hit = page.search_for("Quotation valid for 28 days")
        self.assertTrue(date_hit, f"{tid} missing date: {page.get_text('text')[:240]}")
        self.assertTrue(valid_hit, f"{tid} missing validity phrase")
        date_r = min(date_hit, key=lambda r: r.x0)
        valid_r = max(valid_hit, key=lambda r: r.x1)
        self.assertAlmostEqual(date_r.x0, float(label_x), delta=2.5, msg=tid)
        self.assertGreaterEqual(valid_r.x0, date_r.x1 + 1.0, tid)
        self.assertLessEqual(valid_r.x1, 344.0, f"{tid} validity x1 {valid_r.x1} past panel stroke")
        self.assertGreaterEqual(valid_r.x1, 338.0, f"{tid} validity x1 {valid_r.x1} not at panel stroke")
        self.assertFalse(page.search_for("Date | 5 September"), tid)


if __name__ == "__main__":
    if "--titles" in sys.argv:
        print("CLIENT")
        print("\n".join(_page_titles(CLIENT)))
        print("XMAS DAY")
        print("\n".join(_page_titles(DAY)))
        print("XMAS EVE")
        print("\n".join(_page_titles(EVE)))
        sys.exit(0)
    unittest.main()
