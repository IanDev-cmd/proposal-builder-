# WEOTT Nexus — agent notes

Canonical code lives only at [IanDev-cmd/proposal-builder-](https://github.com/IanDev-cmd/proposal-builder-). Local folder: `Documents/proposal building/proposal-builder-main`.

- **SPA:** `artifacts/workspace-suite`
- **PDF engine:** `artifacts/pdf-engine` (`POST /generate`, `/workspace/quotes`)
- **Assets:** `artifacts/pdf-engine/assets` (templates, inserts, fonts, vessels)
- **Leads/rates:** Google Apps Script URL in `artifacts/workspace-suite/src/lib/backendUrls.ts`

Do not use a second engine repo. Cursor workspace root must be this folder only.
