"""
vessel.py
---------
Page 9 "Vessel Details" page-swap protocol.

Staff previously deleted the generic vessel profile and inserted the
vessel-specific PDF (WEOTT I / Avon Tour / London Rose). This module does
the same: replace template page 9 with the matching single-page profile
from assets/vessels/.
"""

import os

import fitz

from pdf_cache import open_source_pdf

import config


def swap_vessel_page(doc: "fitz.Document", vessel_id: str, warnings: list, page_index=None) -> bool:
    """
    Replace the vessel details page with the profile PDF for `vessel_id`.
    Returns True if a swap was performed.
    """
    if not vessel_id:
        vessel_id = config.VESSEL_DEFAULT

    key = str(vessel_id).strip().lower().replace(" ", "_").replace("-", "_")
    aliases = {
        "weott": "weott_i",
        "weotti": "weott_i",
        "weott1": "weott_i",
        "avon": "avon_tour",
        "rose": "london_rose",
        "londonrose": "london_rose",
    }
    key = aliases.get(key, key)

    path = config.VESSEL_PROFILES.get(key)
    if not path or not os.path.exists(path):
        warnings.append(
            type("ValidationWarning", (), {"field": "vessel", "message": (
                f"Vessel profile '{vessel_id}' not found under assets/vessels/ -- "
                f"leaving vessel page unchanged. Known ids: {list(config.VESSEL_PROFILES)}"
            )})()
        )
        return False

    profile = open_source_pdf(path)
    if profile.page_count < 1:
        warnings.append(
            type("ValidationWarning", (), {"field": "vessel", "message": (
                f"Vessel profile '{path}' has no pages."
            )})()
        )
        return False

    target = page_index if page_index is not None else config.PAGE_VESSEL
    doc.insert_pdf(profile, from_page=0, to_page=0, start_at=target)
    doc.delete_page(target + 1)
    return True


def overlay_vessel_year(doc: "fitz.Document", page_index, font_mgr) -> int:
    """Replace a painted 2020–2025 on the vessel page with 2026. Leaves 2026."""
    if page_index is None:
        return 0
    page_index = int(page_index)
    if page_index < 0 or page_index >= doc.page_count:
        return 0
    page = doc[page_index]
    hits = []
    seen = set()
    for year in ("2020", "2021", "2022", "2023", "2024", "2025"):
        for rect in page.search_for(year):
            key = (round(rect.x0, 1), round(rect.y0, 1))
            if key in seen:
                continue
            seen.add(key)
            hits.append(fitz.Rect(rect))
    if not hits:
        return 0
    font_mgr.ensure_registered(page)
    for rect in hits:
        pad = fitz.Rect(rect.x0 - 0.2, rect.y0 - 0.15, rect.x1 + 0.4, rect.y1 + 0.15)
        page.add_redact_annot(pad)
    page.apply_redactions(
        images=fitz.PDF_REDACT_IMAGE_NONE,
        graphics=0,
        text=0,
    )
    for rect in hits:
        size = max(round(rect.height * 0.92, 2), 4.0)
        page.insert_text(
            (rect.x0, rect.y1 - rect.height * 0.12),
            "2026",
            fontname=font_mgr.regular_name,
            fontfile=font_mgr.regular_path,
            fontsize=size,
            color=config.TEXT_COLOR,
        )
    return len(hits)
