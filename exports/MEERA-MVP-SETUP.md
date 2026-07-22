# Demo / Live Sheets + n8n

## Sheet IDs
| Mode | Sheet |
|---|---|
| **Demo** | https://docs.google.com/spreadsheets/d/1f67f2907cUnHbaXJOb8uf-QfUnPSfv9sQekjvLS8ITs/edit |
| **Live** | https://docs.google.com/spreadsheets/d/1STCEp_UgqH1qoDskFj2rvb8xA9hCdXgntOPPWmCzV6o/edit |

## UI
Nav bar **Demo | Live** toggle (Live asks for confirm). Mode is sent on LeadDataFetch, NoteAppend, QuoteStatus, and QuoteBuilder.

## Required tabs on DEMO sheet
- `Enquiry - Lead Data (2026)`
- `Nexus Ops Notes`
- `Nexus Ops Quotes`

(Use `exports/WEOTT-Nexus-TEST-Sheets.xlsx` if tabs are missing.)

## Required tabs on LIVE sheet (create if missing)
- Same Notes + Quotes tabs (do not invent finance — append only)
- Existing `Enquiry - Lead Data (2026)` for lead reads

## n8n
Import `exports/n8n-quote-builder-mvp.json` into meeraworkflows and reconnect Google Sheets OAuth on every Sheets node.

**Proposal engine (production):** `https://stargtm-kkzz.onrender.com/generate`

## stargtm / ProductionENV
- Upstream: https://github.com/ProximaOpal/stargtm  
- Production package: https://github.com/ProximaOpal/ProductionENV-Proposal_engine-  
- Live Render URL: https://stargtm-kkzz.onrender.com
