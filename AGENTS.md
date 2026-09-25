# WEOTT Nexus — agent notes

Canonical code lives only at [IanDev-cmd/proposal-builder-](https://github.com/IanDev-cmd/proposal-builder-). Local folder: `Documents/proposal building/proposal-builder-main`.

- **SPA:** `artifacts/workspace-suite`
- **PDF engine:** `artifacts/pdf-engine` (`POST /generate`, `/workspace/quotes`)
- **Render (paid starter, not Free):** `weott-proposal-engine` `plan: starter` ($7); `weott-nexus-workspace` `plan: basic-256mb` (Postgres paid starter, $6). `weott-quote-builder` is a static CDN site and cannot set `plan`. Never use `plan: free` on the engine or database.
- **Assets:** `artifacts/pdf-engine/assets` (templates, inserts, fonts, vessels)
- **Leads/rates:** Google Apps Script URL in `artifacts/workspace-suite/src/lib/backendUrls.ts`

Do not use a second engine repo. Cursor workspace root must be this folder only.
