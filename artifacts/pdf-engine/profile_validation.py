"""
profile_validation.py
---------------------
Strict layout gates — every template/insert must measure before render.
Rejects profiles with missing cover keys, undersized value boxes, or bad geometry.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

# Measured from config.COVER_FIELDS + catalog templates (corporate cluster).
LEFT_PANEL_X1 = 342.0
RIGHT_PANEL_X1 = 465.0

# Minimum editable width (pt) — placeholder spans are often ~38pt; real leads need more.
MIN_COVER_MAX_WIDTH: dict[str, float] = {
    "proposal_ref": 40.0,
    "prepared_by": 100.0,
    "quote_date": 34.0,
    "client_name": 58.0,
    "organisation": 65.0,
    "telephone": 50.0,
    "email": 85.0,
    "event_type": 70.0,
    "event_date": 52.0,
    "event_timings": 70.0,
    "guest_range": 22.0,
    "guest_quote_n": 6.0,
}

REQUIRED_COVER_CORPORATE = frozenset(
    {
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
)

# Wedding engagement templates omit organisation row.
REQUIRED_COVER_WEDDING = REQUIRED_COVER_CORPORATE - {"organisation"}

MIN_COVER_FONT_PT = 4.0  # template body size on cover — never shrink below this
COVER_SHRINK_RATIO_FLOOR = 0.92  # any cover shrink beyond 8% fails strict generation


@dataclass
class ProfileValidationError(Exception):
    errors: list[str]

    def __str__(self) -> str:
        return "; ".join(self.errors)


def _required_cover_keys(template_id: str | None, category: str | None) -> frozenset[str]:
    tid = (template_id or "").lower()
    cat = (category or "").lower()
    if "wedding" in cat or tid.startswith("wedding/"):
        return REQUIRED_COVER_WEDDING
    return REQUIRED_COVER_CORPORATE


def validate_profile_strict(profile, *, template_id: str | None = None, category: str | None = None) -> None:
    """Raise ProfileValidationError if measured geometry fails layout gates."""
    errors: list[str] = []
    cover = profile.cover_fields or {}
    required = _required_cover_keys(template_id, category)

    missing = sorted(required - set(cover.keys()))
    if missing:
        errors.append(f"cover_fields missing: {', '.join(missing)}")

    for key, spec in cover.items():
        if not spec or "bbox" not in spec:
            errors.append(f"cover.{key}: empty spec")
            continue
        mw = float(spec.get("max_width") or 0)
        need = MIN_COVER_MAX_WIDTH.get(key, 8.0)
        if key in required and mw < need:
            errors.append(f"cover.{key}: max_width {mw}pt < required {need}pt")

        x0, y0, x1, y1 = spec["bbox"]
        if x1 <= x0 or y1 <= y0:
            errors.append(f"cover.{key}: invalid bbox {spec['bbox']}")

        if key in ("client_name", "organisation", "telephone", "email", "proposal_ref", "prepared_by", "quote_date"):
            if x0 < 200 or x0 > 350:
                errors.append(f"cover.{key}: x0 {x0} outside left panel")
            if x1 > LEFT_PANEL_X1 + 4:
                errors.append(f"cover.{key}: x1 {x1} bleeds past left panel")

        if key in ("event_type", "event_date", "event_timings", "guest_range", "guest_quote_n"):
            if x0 < 360:
                errors.append(f"cover.{key}: x0 {x0} outside right panel")

    if not profile.page_bespoke and profile.pages < 10:
        errors.append(f"page_bespoke unresolved (pages={profile.pages})")

    if errors:
        raise ProfileValidationError(errors)


def validate_render_warnings(warnings: Iterable, *, lead: dict | None = None) -> None:
    """
    After render, fail on cover layout shrink or missing critical cover ink.
    """
    errors: list[str] = []
    for w in warnings:
        field = getattr(w, "field", "") or ""
        msg = getattr(w, "message", str(w))
        if field in MIN_COVER_MAX_WIDTH and "shrink from" in msg.lower():
            errors.append(f"cover.{field}: {msg[:120]}")
            continue
        if field in MIN_COVER_MAX_WIDTH and "shrink" in msg.lower():
            errors.append(f"cover.{field}: {msg[:120]}")

    if errors:
        raise ProfileValidationError(errors)
