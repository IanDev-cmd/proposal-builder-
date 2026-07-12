# Workspace Suite

A business/workspace management suite (Dashboard, Calendar, Employee Dashboard, Process Timeline, and a multi-step account Setup Wizard) built as a pnpm-workspace monorepo, imported from GitHub.

## Run & Operate

- `pnpm install` — install dependencies (already run; re-run if `node_modules` is ever missing, e.g. after a fresh clone/import)
- `pnpm --filter @workspace/workspace-suite run dev` — run the frontend (bound via the `artifacts/workspace-suite: web` workflow, port from `PORT` env var, currently 23392) — **this is the running, verified workflow**
- `pnpm --filter @workspace/api-server run dev` — run the API server; scaffolded but not wired into a workflow, and currently fails on `pnpm install` alone because `build.mjs` needs `esbuild` as a direct dependency of `artifacts/api-server` (only set up if/when the API server is actually needed)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (not yet configured; only needed once the API server/DB packages are actually used)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind, Radix UI, Framer Motion, wouter (in `artifacts/workspace-suite`)
- API: Express 5 (in `artifacts/api-server`, scaffolded but not yet wired to the frontend)
- DB: PostgreSQL + Drizzle ORM (in `lib/db`, not yet provisioned)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec in `lib/api-spec`)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/workspace-suite/src/pages/Home.tsx` — landing page ("/"), a white card with icon tiles (Leads, Tasks, Forms, Timeline, Calendar, Apps, Proposal Doc — all pages except Settings) and a green bottom panel showing a feature checklist for the highlighted tile; clicking/opening a tile navigates to that page
- `artifacts/workspace-suite/src/pages/Apps.tsx` — connected-apps grid (Gmail, Google Sheets, Dropbox, Google Drive, WhatsApp, Viva, Slack, Scribe, LinkedIn, Instagram, Google Reviews, Chatbot Form), centered, icons via Google's favicon service
- `artifacts/workspace-suite/src/pages/Forms.tsx` — 5-step proposal wizard (Event Core, Itinerary, Catering, Financials, Upgrades), redesigned to clone a DNB-style account-creation wizard layout: mint-green left sidebar with logo + numbered step list, white content panel with uppercase section labels and pill-shaped inputs, pill "Next" button bottom-right. All original dropdown options/content preserved verbatim.
- `artifacts/workspace-suite/src/pages/ProposalDoc.tsx` — redesigned to clone a Dropbox-style file browser: dark icon rail on the left (mirrors the old Details/Pricing/Drafts/Signed/Notes tabs), centered file grid (18 real proposal doc pages + 3 draft sections as "files"), right-hand File Preview panel (description, shared-with, share/edit/delete actions). Replaced the previous PDF-viewer/tabs UI entirely.
- `artifacts/api-server` — Express API scaffold, not yet connected to the frontend
- `lib/db`, `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` — shared DB schema, OpenAPI spec, and generated client packages, currently unused by the frontend

## Architecture decisions

- The project was imported with the frontend (`workspace-suite`) and backend (`api-server`) scaffolded as separate, currently-disconnected packages — the frontend uses no live data yet.
- Only one workflow (`artifacts/workspace-suite: web`) is currently configured; the API server has no workflow of its own.
- Global color scheme is a single bright green (`#2ecc71`) + white/dark-navy. All redesigned pages (Home, Apps, Forms, Proposal Doc) reuse this same palette even when cloning reference layouts from other brands (DNB teal → app green, Dropbox blue → app green) — layout/structure is cloned, brand color is not.

## Product

Internal business-operations suite: a Home page for picking a section, dashboard overview, calendar/scheduling, employee dashboard, a process timeline view, and a guided setup wizard (business info, operations, account config, data import/export, category mapping).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Dependencies are installed and the `artifacts/workspace-suite: web` workflow is running (verified via `curl localhost:23392` returning 200 and Vite serving the app with no console errors).
- The `api-server` and DB packages are still just scaffolding — no workflow, no `DATABASE_URL` configured. Only set those up if/when the user asks to wire up the backend.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
