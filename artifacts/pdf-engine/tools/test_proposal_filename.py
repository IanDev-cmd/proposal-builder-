"""Lead PDF filename is Proposal - Name (Company) - REF.pdf"""

from __future__ import annotations

import re
import unittest

_REF_VERSION_TAIL = re.compile(r"\s+V\d+\s*$", re.I)


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
    ref = clean(str(nexus.get("referenceNumber") or lead.get("reference_number") or "").strip())
    if not ref:
        ref = clean(str(lead.get("proposal_ref") or report.get("proposal_ref") or "").strip())
        ref = _REF_VERSION_TAIL.sub("", ref).strip()
    if not ref:
        ref = "REF TBC"
    who = f"{name} ({company})" if company else name
    return f"Proposal - {who} - {ref}.pdf"


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
        self.assertEqual(name, "Proposal - Lily Day (OpusApeiro) - WE.19108.pdf")

    def test_strips_version_when_only_cover_ref(self) -> None:
        name = proposal_download_name(
            {"lead": {"client_name": "Lily Day", "proposal_ref": "WE.19108 V4"}},
            {},
        )
        self.assertEqual(name, "Proposal - Lily Day - WE.19108.pdf")

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
        self.assertEqual(name, "Proposal - Joanna Eaton (EY) - WE.19103.pdf")


if __name__ == "__main__":
    unittest.main()
