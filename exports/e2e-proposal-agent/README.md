# E2E Proposal Agent (no AI)

Deterministic Playwright click-through for the **4 gold proposal tests** (WE.18759, WE.18900, WE.18931, WE.18937).

## What “right” testing means

Earlier runs were misleading because they:

- Manually re-filled the form instead of using **lead prefill**
- Failed Step 7 approve and fell back to **webhook** (no `packageWording`, empty inserts)
- Used a **stale `scenarios.json`** that didn’t match `goldFinancialScenarios.json`

**Correct path (must all pass):**

1. Gate locally: `cd artifacts/workspace-suite && npm run verify:gold:scenarios`
2. Inject lead fixture → Quote Builder (prefill fills form)
3. **Next × 5** — cost lines (step 4, incl. Section 2 catering) then financials / grand total (step 5); do not manually override blue fields
4. Step 6 — parity must show gold WEOTT → **Approve & continue**
5. Step 7 — **Confirm all** blue suggestions → **Generate**
6. `npm run diagnose` — money + package wording vs gold PDFs

`PREFILL_MODE=0` disables prefill click-through (legacy manual fill).

## Setup

```bash
# Frontend
cd artifacts/workspace-suite
set PORT=5173
set BASE_PATH=/
npx pnpm@9 run dev

# Agent
cd exports/e2e-proposal-agent
npm install
npx playwright install chromium
```

## Run

```bash
npm run agent      # prefill mode → UI generate; webhook fallback only on failure
npm run diagnose   # PDF vs gold proposal-testing-scenario fixtures
```

## Gold sources of truth

| File | Purpose |
|------|---------|
| `artifacts/workspace-suite/src/lib/assets/goldFinancialScenarios.json` | Step 4 cost lines (Section 2 catering), rates, WEOTT targets |
| `artifacts/workspace-suite/src/lib/assets/goldPackageWording.json` | Bespoke page columns (looks) |
| `exports/proposal-testing-scenario/fixtures/*.lead.json` | Lead injection for e2e |
| `exports/proposal-testing-scenario/_flat/*Proposal*.pdf` | Visual/financial gold PDFs |

## Pass criteria per ref

| Ref | Grand total (inc VAT) | Notes |
|-----|----------------------|--------|
| WE.18900 | £18,418.00 | V4 single pack (gold zip has combined V3+V4 doc) |
| WE.18759 | £13,350.15 | Summer V2 |
| WE.18937 | £15,065.52 | Wedding transfer 20% margin |
| WE.18931 | £28,473.77 | Team building Rose |

Webhook fallback is **not** a pass for UI testing — it only proves the engine can draw money if payload is complete.
