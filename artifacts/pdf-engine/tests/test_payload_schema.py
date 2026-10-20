"""POST /generate wire checks. Validation runs before any PDF stamping."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from payload_schema import GeneratePayload, validation_error_body


def test_non_numeric_money_is_rejected_with_field_paths():
    with pytest.raises(ValidationError) as caught:
        GeneratePayload.model_validate({"calculations": {"grand_total": "twelve pounds", "vat": "£10"}})
    body = validation_error_body(caught.value)
    locs = [".".join(err["loc"]) for err in body["validation_errors"]]
    assert any(loc.endswith("grand_total") for loc in locs)
    assert any(loc.endswith("vat") for loc in locs)


def test_insert_aliases_normalize_to_selected_inserts():
    for key in ("selectedInserts", "selected_inserts", "inserts"):
        payload = GeneratePayload.model_validate({key: ["river_map", "staff_profile"]}).model_dump()
        assert payload["selectedInserts"] == ["river_map", "staff_profile"]
        assert "selected_inserts" not in payload
        assert "inserts" not in payload


def test_inserts_must_be_a_list_of_strings():
    with pytest.raises(ValidationError):
        GeneratePayload.model_validate({"inserts": "river_map"})


def test_generate_route_returns_422_before_stamping():
    from app import app
    from team_auth import issue_token

    token, _exp = issue_token()
    client = app.test_client()
    response = client.post(
        "/generate",
        json={"calculations": {"package_cost": "not-a-number"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422
    body = response.get_json()
    assert body["validation_errors"]
    assert any("package_cost" in ".".join(err["loc"]) for err in body["validation_errors"])
