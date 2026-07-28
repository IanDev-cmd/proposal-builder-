# Proposal Testing — Natasha gold sources

**Source of truth:** Quote Sheet PDFs from Natasha’s Proposal Testing pack.

Local zip (not committed):

`C:\Users\grvns\Documents\New folder\Proposal Testing-20260727T091621Z-1-001.zip`

## Gold refs (latest quote sheet per ref)

| Ref | Quote sheet version | WEOTT target |
|-----|---------------------|--------------|
| WE.18900 | V4 — José Rubio / Space Made | £12,278.64 |
| WE.18759 | V2 — Mankaasha Umba / Outnet | £8,900.10 |
| WE.18931 | V2 — Mia Cruickshank / Databarracks (Elizabethan) | £18,982.51 |
| WE.18937 | V2 — Loretta Greeley-Ward / Wedding transfer | £10,462.17 |

Embedded playbooks: `artifacts/workspace-suite/src/lib/assets/goldFinancialScenarios.json`

Flattened PDF copies for CI/e2e: `_flat/` and `manifest.json`.

Rebuild playbooks from sheets:

```bash
cd artifacts/workspace-suite
npx tsx scripts/build-gold-playbooks-from-sheets.ts
node scripts/apply-generated-gold.mjs
npm run verify:gold:scenarios
node ../../exports/e2e-proposal-agent/sync-scenarios.mjs
```
