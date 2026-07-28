# Workspace Suite

WEOTT Nexus — Quote Builder and proposal workspace (pnpm monorepo).

## Run locally

```bash
pnpm install
pnpm --filter @workspace/workspace-suite run dev
```

Open http://localhost:5173 (or the port shown in the terminal).

## Deploy (Render)

- **Frontend (static):** use root `render.yaml` — builds `artifacts/workspace-suite` and publishes `dist/public` with SPA rewrites.
- **PDF engine:** `artifacts/pdf-engine/render.yaml` — Python/stargtm service on Render.

Env for local dev (optional):

- `PORT` — dev server port (default `5173`)
- `BASE_PATH` — Vite base path (default `/`)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind, Radix UI, Framer Motion, wouter (`artifacts/workspace-suite`)
- PDF engine: Python FastAPI/gunicorn (`artifacts/pdf-engine`)
- Finance SoT: `artifacts/workspace-suite/src/lib/quoteFinance.ts`
- n8n webhooks: `artifacts/workspace-suite/src/lib/backendUrls.ts`

## Key paths

- `artifacts/workspace-suite/src/pages/Forms.tsx` — Quote Builder wizard
- `artifacts/pdf-engine/` — proposal PDF generation (stargtm)
- `exports/n8n-quote-builder-mvp.json` — n8n workflow export

## Product notes

Google Sheets remains source of truth for MVP. Postgres/api-server packages are scaffold only — do not stand up a second DB for MVP.

Test Sheet twin: `exports/WEOTT-Nexus-TEST-Sheets.xlsx`
