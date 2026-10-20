"""
Pydantic contracts for POST /generate.
Reject malformed bodies with HTTP 422 instead of failing mid-render.
"""

from __future__ import annotations

import re

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

# BEGIN GENERATED CATALOGUE CONSTANTS — scripts/build-catalogue-taxonomy.mjs
VAT_RATE = 0.2
CONTINGENCY_RATE = 0.0225
STAFF_HOURS_BUFFER = 3
EVENT_MANAGER_HOURS_BUFFER = 4
MIN_BILLABLE_HOURS = 4


class CatalogueLineBinding(BaseModel):
    """Taxonomy line shape. Not applied to POST /generate, so PDF payload keys stay intact."""

    model_config = ConfigDict(extra="ignore")
    id: str
    section: str
    label: str
    multiplier: Literal["vessel_hours", "guests", "guests_hours", "hours", "staff_hours", "tables", "set"]


# END GENERATED CATALOGUE CONSTANTS

__all__ = [
    "CONTINGENCY_RATE",
    "CatalogueLineBinding",
    "EVENT_MANAGER_HOURS_BUFFER",
    "GenerateLead",
    "GeneratePayload",
    "MIN_BILLABLE_HOURS",
    "STAFF_HOURS_BUFFER",
    "VAT_RATE",
    "validation_error_body",
]

# Strict decimal. Currency symbols and thousands separators are rejected.
_STRICT_NUMBER = re.compile(r"^-?(?:0|[1-9]\d*)(?:\.\d+)?$")
_INSERT_KEYS = ("selectedInserts", "selected_inserts", "inserts")


def _to_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, bool) or not isinstance(v, (int, float, str)):
        raise ValueError("numeric calculation fields must be JSON numbers")
    if isinstance(v, str):
        text = v.strip()
        if not _STRICT_NUMBER.fullmatch(text):
            raise ValueError(f"non-numeric value: {v!r}")
        return float(text)
    return float(v)


def _insert_ids(value: Any) -> list[str]:
    if isinstance(value, str) or not isinstance(value, list):
        raise ValueError("selectedInserts must be a list of strings")
    out: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise ValueError("selectedInserts must be a list of strings")
        out.append(item.strip())
    return out


class GenerateLead(BaseModel):
    model_config = ConfigDict(extra="allow")

    proposal_ref: str | None = None
    prepared_by: str | None = None
    quote_date: str | None = None
    client_name: str | None = None
    organisation: str | None = None
    telephone: str | None = None
    email: str | None = None
    event_type: str | None = None
    event_date: str | None = None  # ISO-8601 preferred (YYYY-MM-DD or full datetime)
    date_flexible: bool | None = None
    event_timings: str | None = None
    guest_range: str | None = None
    guest_quote_n: str | int | float | None = None
    contact_name: str | None = None
    contact_title: str | None = None
    contact_phone: str | None = None
    contact_mobile: str | None = None
    contact_email: str | None = None
    quote_version: str | None = None
    key_items: str | None = None
    weekly_period: str | None = None
    day_period: str | None = None
    group_bracket: str | None = None
    no_of_tables: str | int | float | None = None
    budget: str | None = None
    vessels: str | None = None
    market: str | None = None
    source: str | None = None
    year_of_event: str | int | float | None = None
    repeat_client: str | bool | None = None
    agent: str | None = None


class Calculations(BaseModel):
    model_config = ConfigDict(extra="allow")

    guests: float | None = None
    package_cost: float | None = None
    vat: float | None = None
    grand_total: float | None = None

    @field_validator("guests", "package_cost", "vat", "grand_total", mode="before")
    @classmethod
    def coerce_number(cls, v: Any) -> float | None:
        return _to_float(v)


class GeneratePayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    event_type: str | None = None
    category: str | None = None
    slot: str | None = None
    template_id: str | None = None
    manual_template: bool | None = None
    vessel: str | None = None
    lead: GenerateLead = Field(default_factory=GenerateLead)
    calculations: Calculations = Field(default_factory=Calculations)
    selectedUpgrades: list[str] = Field(default_factory=list)
    selectedInserts: list[str] = Field(default_factory=list)
    packageWording: dict[str, Any] = Field(default_factory=dict)
    menuLinks: dict[str, Any] = Field(default_factory=dict)
    mode: str | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_inserts(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        payload = dict(data)
        chosen: Any = None
        for key in _INSERT_KEYS:
            if key in payload and payload[key] is not None:
                chosen = payload[key]
                break
        payload["selectedInserts"] = _insert_ids(chosen) if chosen is not None else []
        payload.pop("inserts", None)
        payload.pop("selected_inserts", None)
        return payload


def validation_error_body(exc: ValidationError) -> dict[str, Any]:
    return {
        "error": "Request body failed generate-payload schema validation",
        "validation_errors": [
            {
                "loc": [str(p) for p in err["loc"]],
                "msg": err["msg"],
                "type": err["type"],
            }
            for err in exc.errors()
        ],
    }
