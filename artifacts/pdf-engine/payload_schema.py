"""
Pydantic contracts for POST /generate.
Reject malformed bodies with HTTP 422 instead of failing mid-render.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator


def _to_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        raise ValueError("boolean is not a numeric calculation field")
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace(",", "").replace("£", "").strip()
    try:
        return float(s)
    except ValueError as exc:
        raise ValueError(f"non-numeric value: {v!r}") from exc


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
    event_timings: str | None = None
    guest_range: str | None = None
    guest_quote_n: str | int | float | None = None
    contact_name: str | None = None
    contact_title: str | None = None
    contact_phone: str | None = None
    contact_mobile: str | None = None
    contact_email: str | None = None


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
    selectedInserts: list[str] | None = None
    inserts: list[str] | None = None
    selected_inserts: list[str] | None = None
    packageWording: dict[str, Any] = Field(default_factory=dict)
    menuLinks: dict[str, Any] = Field(default_factory=dict)
    mode: str | None = None


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
