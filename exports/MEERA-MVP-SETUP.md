# Demo / Live Sheets + n8n

## Sheet IDs
| Mode | Sheet |
|---|---|
| **Demo** | https://docs.google.com/spreadsheets/d/1f67f2907cUnHbaXJOb8uf-QfUnPSfv9sQekjvLS8ITs/edit |
| **Live** | https://docs.google.com/spreadsheets/d/1STCEp_UgqH1qoDskFj2rvb8xA9hCdXgntOPPWmCzV6o/edit |

## Design (confirmed)
- **No demo leads** — Demo `LeadDataFetch` reads empty `Sheet1` and returns `{ count: 0, leads: [] }`. Live reads `Enquiry - Lead Data (2026)`.
- **Write-back always has full fields** — Demo + Live append to `Nexus Ops Notes` and `Nexus Ops Quotes` (create tabs from seed if missing).
- **Cost rates** — `POST /webhook/CostRatesFetch` reads LIVE rate tabs (raw rows; no invented schema).

## Required DEMO tabs
Import / copy from `exports/WEOTT-Nexus-TEST-Sheets.xlsx`:
1. `Sheet1` — leave empty (0 leads)
2. `Nexus Ops Notes` — header row only
3. `Nexus Ops Quotes` — header row only
4. `Enquiry - Lead Data (2026)` — header scaffold only (optional; for future repoint)

### Nexus Ops Notes headers
`Created At | Mode | Reference | Email | Lead Name | Tag | Note`

### Nexus Ops Quotes headers
`Updated At | Mode | Reference | Email | Lead Name | Quote Id | Status | Version | Title | Event Type | Event Date | Guests | Guests High | Repeat Client | Agent Referral | Key Items | Weekly Period | Day Period | Group Bracket | No Of Tables | Selected Upgrades | Selected Cost Lines | Template Id | Selected Inserts | Staff Contact | Subtotal Pre Contingency | Base Cost | Contingency | Margin | Margin Amount | Discount % | Discount Amount | Commission % | Commission Amount | Updated Profit | Cost Per Guest Exc | Cost Per Guest Inc | Cost To Client | Package Cost | VAT | Upgrade Total | Grand Total | Section Totals`

Financials UI mirrors Quote Builder 2026 Sections 1–14 (Cost Mother rates, contingency 2.25%, margin, discount, commission, £/guest).

## Required LIVE tabs (create if missing)
- `Nexus Ops Notes` + `Nexus Ops Quotes` (same headers) — append-only write-back
- Existing `Enquiry - Lead Data (2026)` for lead reads
- Rate tabs already present: Price Comparison / Vessel & Event Items, Cost Mother Sheet, Quote Builder 2026, Minimum target margin, Staff Ratios, Cutlery Ratios

## UI
Nav **Demo | Live** toggle. Mode sent on LeadDataFetch, NoteAppend, QuoteStatus, QuoteBuilder, CostRatesFetch.

Lead → Quote Builder prefills: vessels, event type, Date TBC / flexible, requested times, guest lower bound, budget, progress notes, repeat client, Prepared By (REP).

Financials: Cost Mother Sections 1–14, editable margin/discount/commission %, cost cross-check approval gate, package wording notes, Cost Lines step for YES toggles + bespoke.

## n8n
Import `exports/n8n-quote-builder-mvp.json` into meeraworkflows and reconnect Google Sheets OAuth (`8aF9CpidfdOSoB9E`) on every Sheets node.

Webhooks: `QuoteBuilder` · `LeadDataFetch` · `NoteAppend` · `QuoteStatus` · `CostRatesFetch`

**Proposal engine:** `https://stargtm-kkzz.onrender.com/generate`

## stargtm / ProductionENV
- Upstream: https://github.com/ProximaOpal/stargtm  
- Production package: https://github.com/ProximaOpal/ProductionENV-Proposal_engine-  
- Live Render URL: https://stargtm-kkzz.onrender.com
