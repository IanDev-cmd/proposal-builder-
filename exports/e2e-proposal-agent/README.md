# E2E Proposal Agent (no AI)

Deterministic Playwright click-through + webhook fallback for the 4 zip scenarios.

## Setup

```bash
# Frontend (repo root / workspace-suite)
cd artifacts/workspace-suite
# PORT + BASE_PATH required
set PORT=5173
set BASE_PATH=/
npx pnpm@9 run dev

# Agent
cd exports/e2e-proposal-agent
npm install
npx playwright install chromium
```

Frontend `N8N_BASE` is set to `https://harmonylove.app.n8n.cloud/webhook`.

## Run

```bash
npm run agent      # clicks Quote Builder; falls back to QuoteBuilder webhook / weott-proposal-engine
npm run diagnose   # compares generated PDFs vs gold quote/proposal PDFs
```

Outputs land in `output/`:

- `WE.xxxxx/WE.xxxxx.generated.pdf`
- step screenshots, `run-report.json`, `fallback.payload.json`
- `diagnosis.md` / `diagnosis.json`
- `ui-index.json` — indexed Quote Builder controls
- `scenarios.json` — playbooks for all 4 leads

## Notes

- Demo `LeadDataFetch` often returns empty — agent injects fixtures from `saved Lead data.txt` / `fixtures/*.lead.json`.
- If UI generate fails, agent POSTs the scenario payload to QuoteBuilder (then PDF engine).
