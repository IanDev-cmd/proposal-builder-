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
# quote_date may grow left to 198pt (see measure._measure_quote_date / config).
LEFT_PANEL_X0 = 196.0
LEFT_PANEL_X1 = 342.0
RIGHT_PANEL_X1 = 465.0

# Minimum editable width (pt) — placeholder spans are often ~38pt; real leads need more.
MIN_COVER_MAX_WIDTH: dict[str, float] = {
    "proposal_ref": 40.0,
    "prepared_by": 40.0,
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
            if x0 < LEFT_PANEL_X0 or x0 > 350:
                errors.append(f"cover.{key}: x0 {x0} outside left panel")
            if x1 > LEFT_PANEL_X1 + 4:
                errors.append(f"cover.{key}: x1 {x1} bleeds past left panel")

        if key in ("event_type", "event_date", "event_timings", "guest_range", "guest_quote_n"):
            # 4pt inward of the designed 360pt split — Christmas and other
            # InDesign packs drift a couple of points without leaving the panel.
            if x0 < 356:
                errors.append(f"cover.{key}: x0 {x0} outside right panel")

    if not profile.page_bespoke and profile.pages < 10:
        errors.append(f"page_bespoke unresolved (pages={profile.pages})")

    if errors:
        raise ProfileValidationError(errors)


COVER_FIELD_LABELS = {
    "proposal_ref": "proposal reference",
    "prepared_by": "prepared-by name",
    "quote_date": "quote date",
    "client_name": "client name",
    "organisation": "organisation name",
    "telephone": "telephone number",
    "email": "email address",
    "event_type": "event type",
    "event_date": "event date",
    "event_timings": "event timings",
    "guest_range": "guest range",
    "guest_quote_n": "guest quote number",
    "contact_phone": "telephone number",
    "contact_mobile": "mobile number",
    "contact_email": "email address",
    "contact_name": "contact name",
}


def humanize_cover_overflow(field: str) -> str:
    label = COVER_FIELD_LABELS.get(field) or str(field or "value").replace("_", " ")
    return f"The {label} is too long for the cover field."


def _is_overflow_message(message: str) -> bool:
    msg = (message or "").lower()
    return "shrink" in msg or "too long" in msg or "will not fit" in msg or "does not fit" in msg


def humanize_overflow_warnings(warnings: Iterable) -> list[str]:
    """Rewrite shrink/fit warnings to a specific sentence. Generation continues."""
    notices: list[str] = []
    for warning in warnings:
        field = getattr(warning, "field", "") or ""
        message = getattr(warning, "message", str(warning))
        if not field or not _is_overflow_message(message):
            continue
        human = humanize_cover_overflow(field)
        if hasattr(warning, "message"):
            warning.message = human
        if human not in notices:
            notices.append(human)
    return notices


def validate_render_warnings(warnings: Iterable, *, lead: dict | None = None) -> list[str]:
    """
    Cover/contact overflow is shown to the salesperson but does not block the PDF.
    Template geometry issues still fail via validate_profile_strict.
    """
    del lead
    return humanize_overflow_warnings(warnings)
