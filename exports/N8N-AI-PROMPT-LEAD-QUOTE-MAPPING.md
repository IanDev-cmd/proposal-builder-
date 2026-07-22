# n8n AI Assistant Prompt — WEOTT Nexus Lead/Quote Data Mapping

Copy everything below the line into the n8n AI assistant.

---

## ROLE
You are updating my existing n8n workflow for West End on the Thames (WEOTT) / Nexus Proposal Builder.

Do NOT invent a new CRM. Do NOT hardcode pricing rates into Code nodes permanently if they can be read from Google Sheets. Goal: map Lead Sheet + Cost Mother / Quote Builder sheet data correctly so the UI can prefill and the PDF engine can assemble proposals.

## PRODUCT RULES (from client Sapphire + PM Meera)
1. Google Sheets remain source of truth.
2. Automate: calculations inputs, data population, document assembly.
3. Leave commercial judgment / package wording / margin tweaks to the REP.
4. Template + insert selection stays MANUAL (UI already sends `template_id` + `selectedInserts`).
5. Do NOT recalculate finance in n8n when the UI already sends `financials` / `calculations` — pass through.
6. Demo vs Live:
   - `mode: "demo"` → TEST sheet `https://docs.google.com/spreadsheets/d/1f67f2907cUnHbaXJOb8uf-QfUnPSfv9sQekjvLS8ITs/edit`
   - `mode: "live"` → PRODUCTION sheet `https://docs.google.com/spreadsheets/d/1STCEp_UgqH1qoDskFj2rvb8xA9hCdXgntOPPWmCzV6o/edit`
7. PDF engine: `POST https://stargtm-kkzz.onrender.com/generate` (return PDF binary).

## CURRENT WORKFLOW (what I already have — keep webhook paths)
I will paste my current workflow JSON after this prompt. Review it first and list gaps, then rebuild/fix connections.

Existing webhooks to KEEP (same paths):
- `POST /webhook/QuoteBuilder` → transform → stargtm → respond PDF
- `POST /webhook/LeadDataFetch` → Sheets → structure leads → respond JSON
- `POST /webhook/NoteAppend` → append notes (demo/live)
- `POST /webhook/QuoteStatus` → append quote financials (demo/live)

### Known bugs / gaps in my current graph (confirm these)
1. **LeadDataFetch Demo branch is MISSING** — after `Lead Fetch Mode`, only `Get Leads LIVE` is connected. Demo mode still hits production. Fix: IF live → Get Leads LIVE else → Get Leads DEMO (Enquiry tab on TEST sheet).
2. **Lead field mapping is incomplete** vs Sapphire’s required Lead Sheet fields.
3. Nodes `Quote Builder 2026`, `WEOTT Event & Catering Staff Ratios`, `Cutlery Ratios` exist but are **orphaned** (not connected). Either wire them into a pricing lookup webhook OR remove until Cost Mother is ready — do not leave dead nodes.
4. Transform QuoteBuilder does not pass budget, flexible date, agent, prepared-by REP, vessels, packageWording, menuLinks, progress notes key items into a structured shape the UI can round-trip.
5. No Cost Mother Sheet / Price Comparison live rate fetch for the UI yet.

## REQUIRED LEAD FIELDS (Sapphire Q1) — LeadDataFetch MUST return these aliases
Map flexibly by header prefix/contains (sheet headers vary by year). Return EVERY lead as a flat object with these keys (empty string if missing):

### Client details (from Enquiry - Lead Data 2026)
| Alias | Sheet header hints |
|---|---|
| `referenceNumber` | Client Reference Number / WEOTT Reference / Cient Reference |
| `name` | Name |
| `companyName` | Company Name |
| `email` | Main Contact - Email |
| `phone` | Main Contact - Number |
| `jobRole` | Main Contact - Job Role |
| `companySector` | Company Sector |
| `budget` | Budget / Client Target Budget / Client’s Budget |
| `repeatClient` | Repeat Client / Source contains "Repeat Client" → boolean or YES/NO |
| `agent` / `agentReferral` | Agent Referral / Agent |
| `preparedBy` / `assignedRep` | Prepared By / Assigned Rep / Client Relationship REP / REP |
| `status` | Live/Dead / Live/Dead/Blacklisted/Booked |
| `source` | Source |
| `enquiryDate` | Enquiry Date |

### Event details
| Alias | Sheet header hints |
|---|---|
| `eventType` | Event Type |
| `fullEventDate` | Full Event Date / Event Date |
| `eventDateFlexible` | Event Date - Flexible? / Flexible |
| `eventDateDisplay` | If flexible → `"Date TBC"` else standalone date string |
| `requestedEventTimes` | Requested Event Times / Event Timings |
| `groupSize` | Group Size |
| `groupSizeQuote` | Lower bound of range if "50 - 60" → `50` (quote based on lower predicted number) |
| `vessels` | Vessel / Vessels (array or comma string) |
| `progressNotes` | Progress Notes / Key Items / Notes |
| `market` | Market |
| `bestTimeToCall` | Best time to call |
| `yearOfEvent` | Year of Event |

### Response shape for LeadDataFetch
```json
{
  "count": 123,
  "mode": "demo|live",
  "leads": [ { "...aliases above..." } ]
}
```

Sort newest first (reverse sheet order is fine).

## QUOTEBUILDER TRANSFORM — required stargtm payload
Input arrives from Nexus UI (`body` may wrap payload). Transform MUST:

1. Prefer UI-sent `calculations` / `financials` (do not recalculate rates here).
2. Build:
```json
{
  "event_type": "...",
  "category": "corporate|wedding",
  "template_id": "...",
  "manual_template": true,
  "selectedInserts": ["..."],
  "selectedUpgrades": ["live_dj", "..."],
  "packageWording": {
    "venue_and_management": [],
    "entertainment_and_decor": [],
    "stationery_and_catering": []
  },
  "menuLinks": {
    "food_menu": null,
    "mood_board": null
  },
  "vessel": "...",
  "mode": "demo|live",
  "lead": {
    "proposal_ref": "WE.xxxxx",
    "client_name": "",
    "organisation": "",
    "telephone": "",
    "email": "",
    "event_type": "",
    "event_date": "Date TBC or formatted date",
    "event_timings": "HH:MM - HH:MM",
    "guest_range": "",
    "guest_quote_n": "50",
    "prepared_by": "REP name from lead or staff insert",
    "contact_name": "",
    "contact_title": "Client Relationship Manager",
    "contact_phone": "020 8323 5827",
    "contact_email": "sales@westendonthethames.com",
    "budget": "",
    "repeat_client": false,
    "agent_referral": false
  },
  "calculations": {
    "guests": 0,
    "package_cost": 0,
    "vat": 0,
    "grand_total": 0
  }
}
```
3. Upgrade label → id map (keep existing map in Transform node).
4. If `eventDateFlexible` or date empty/TBC → `lead.event_date = "Date TBC"`.
5. Staff: if UI sends `staffContact` / `lead.contact_name` / selected staff insert, use that for `prepared_by` + contact fields; else default Katherine Bulaon.
6. Pass `packageWording` and `menuLinks` through when present.

## NEW / OPTIONAL WEBHOOKS TO ADD (if easy)
### A) `POST /webhook/CostRatesFetch`
Purpose: return Cost Mother / Price Comparison rates so UI can STOP hardcoding.
Sheets (LIVE workbook unless mode=demo and you mirror tabs on TEST):
- Prefer tab names containing: `Price Comparison`, `Cost Mother`, `Quote Builder 2026`, `Minimum target margin`, `Vessel Capacity`
- Also available in my graph: `Quote Builder 2026`, `WEOTT Event & Catering Staff Ratios`, `Cutlery Ratios`

Response shape:
```json
{
  "mode": "live",
  "fetchedAt": "ISO",
  "vesselRates": [],
  "cateringRates": [],
  "margins": [],
  "staffRatios": [],
  "cutleryRatios": [],
  "raw": { "note": "optional truncated debug" }
}
```
Normalize rows into stable keys. If sheet layout is irregular, return structured arrays + raw headers so we can iterate. Do not invent prices.

### B) Keep NoteAppend + QuoteStatus as-is but ensure Demo/Live IF branches both work.

## GOOGLE SHEETS CREDENTIALS
Reuse existing credential: `Google Sheets OAuth2 API` (id `8aF9CpidfdOSoB9E` if present).

## DELIVERABLES — do this in order
1. **Confirm** against my pasted workflow JSON: list every gap vs this prompt (bullet list).
2. **Ask me** only if a sheet tab/header is ambiguous (max 3 questions). If you can proceed with flexible header matching, do so.
3. **Rebuild/fix** the workflow:
   - Fix LeadDataFetch Demo/Live split
   - Expand Structure all Leads aliases to full Sapphire list
   - Expand Transform QuoteBuilder for Date TBC, budget, agent, preparedBy, vessels, packageWording, menuLinks
   - Wire OR remove orphaned Quote Builder / Ratios / Cutlery nodes
   - Add CostRatesFetch if feasible
4. Output the **full updated workflow JSON** I can import, plus a short changelog.

## ACCEPTANCE TESTS
- `LeadDataFetch` with `{ "mode": "demo" }` never reads production sheet.
- `LeadDataFetch` with `{ "mode": "live" }` returns leads including `budget`, `preparedBy`, `eventDateFlexible`, `groupSizeQuote`, `vessels`, `progressNotes` when columns exist.
- `QuoteBuilder` with UI payload returns PDF from `https://stargtm-kkzz.onrender.com/generate`.
- Transform does not overwrite UI `calculations.package_cost` / `vat` / `grand_total` with invented numbers.
- NoteAppend / QuoteStatus write to correct Demo vs Live workbook.

## MY CURRENT WORKFLOW JSON
Paste the workflow JSON below this line (the JSON I provided starting with `"nodes": [` …).

---

End of prompt. After the AI confirms gaps, tell it to implement and export the full workflow JSON.
