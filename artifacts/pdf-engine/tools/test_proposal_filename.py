"""Lead PDF filename is Proposal - Name (Company) - REF.pdf"""

from __future__ import annotations

import re
import unittest

_PLACEHOLDER_COMPANY = re.compile(r"^(na|n/?a|n\.a\.?|none|nil|null|-|—|–)$", re.I)
_REF_VERSION_TAIL = re.compile(r"\s+V\d+\s*$", re.I)


def _version_suffix(raw: str) -> str:
    t = re.sub(r"\s+", " ", str(raw or "")).strip()
    if re.fullmatch(r"bf\s*costs", t, re.I):
        return "_BF Costs"
    m = re.fullmatch(r"v\s*(\d+)", t, re.I)
    if m:
        return f"_V{int(m.group(1))}"
    return ""


def proposal_download_name(payload: dict, report: dict) -> str:
    lead = payload.get("lead") or {}
    nexus = payload.get("nexusLead") or {}
    if not isinstance(lead, dict):
        lead = {}
    if not isinstance(nexus, dict):
        nexus = {}

    def clean(s: str) -> str:
        s = re.sub(r'[<>:"/\\|?*]', "", s)
        return re.sub(r"\s+", " ", s).strip()

    name = clean(str(lead.get("client_name") or nexus.get("name") or "").strip()) or "Contact TBC"
    company = clean(
        str(lead.get("organisation") or nexus.get("companyName") or nexus.get("company") or "").strip()
    )
    if not company or _PLACEHOLDER_COMPANY.match(company):
        company = ""
    ref = clean(str(nexus.get("referenceNumber") or lead.get("reference_number") or "").strip())
    if not ref:
        ref = clean(str(lead.get("proposal_ref") or report.get("proposal_ref") or "").strip())
    tail = _REF_VERSION_TAIL.search(ref)
    ref_version = tail.group(0).strip() if tail else ""
    ref = _REF_VERSION_TAIL.sub("", ref).strip()
    if not ref:
        ref = "REF TBC"
    version = (
        lead.get("quote_version")
        or lead.get("quoteVersion")
        or nexus.get("quoteVersion")
        or payload.get("quoteVersion")
        or ref_version
        or "V1"
    )
    suffix = _version_suffix(str(version)) or "_V1"
    who = f"{name} ({company})" if company else name
    return f"Proposal - {who} - {ref}{suffix}.pdf"


class ProposalFilenameTest(unittest.TestCase):
    def test_lily_day_sample(self) -> None:
        name = proposal_download_name(
            {
                "lead": {
                    "client_name": "Lily Day",
                    "organisation": "OpusApeiro",
                    "proposal_ref": "WE.19108 V2",
                    "reference_number": "WE.19108",
                },
                "nexusLead": {
                    "name": "Lily Day",
                    "companyName": "OpusApeiro",
                    "referenceNumber": "WE.19108",
                },
            },
            {},
        )
        self.assertEqual(name, "Proposal - Lily Day (OpusApeiro) - WE.19108_V1.pdf")

    def test_version_from_quote_version(self) -> None:
        name = proposal_download_name(
            {
                "lead": {
                    "client_name": "Rupali Patil Maria Evans",
                    "organisation": "ITC Infotech",
                    "reference_number": "WE.19167",
                    "quote_version": "V2",
                },
            },
            {},
        )
        self.assertEqual(name, "Proposal - Rupali Patil Maria Evans (ITC Infotech) - WE.19167_V2.pdf")

    def test_bf_costs_suffix(self) -> None:
        name = proposal_download_name(
            {"lead": {"client_name": "Alexis King", "reference_number": "WE.19001", "quote_version": "BF Costs"}},
            {},
        )
        self.assertEqual(name, "Proposal - Alexis King - WE.19001_BF Costs.pdf")

    def test_strips_version_when_only_cover_ref(self) -> None:
        name = proposal_download_name(
            {"lead": {"client_name": "Lily Day", "proposal_ref": "WE.19108 V4"}},
            {},
        )
        self.assertEqual(name, "Proposal - Lily Day - WE.19108_V4.pdf")

    def test_joanna_eaton_house_name(self) -> None:
        name = proposal_download_name(
            {
                "lead": {
                    "client_name": "Joanna Eaton",
                    "organisation": "EY",
                    "reference_number": "WE.19103",
                },
                "nexusLead": {
                    "name": "Joanna Eaton",
                    "company": "EY",
                    "referenceNumber": "WE.19103",
                },
            },
            {},
        )
        self.assertEqual(name, "Proposal - Joanna Eaton (EY) - WE.19103_V1.pdf")

    def test_drops_na_company(self) -> None:
        name = proposal_download_name(
            {
                "lead": {"client_name": "Katrina Watson", "organisation": "NA", "reference_number": "WE.19132"},
                "nexusLead": {"name": "Katrina Watson", "company": "NA", "referenceNumber": "WE.19132"},
            },
            {},
        )
        self.assertEqual(name, "Proposal - Katrina Watson - WE.19132_V1.pdf")


if __name__ == "__main__":
    unittest.main()
