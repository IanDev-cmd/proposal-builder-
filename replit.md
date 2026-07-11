# Workspace Suite

A business/workspace management suite (Dashboard, Calendar, Employee Dashboard, Process Timeline, and a multi-step account Setup Wizard) built as a pnpm-workspace monorepo, imported from GitHub.

## Run & Operate

- `pnpm install` — install dependencies (already run once during import setup)
- `pnpm --filter @workspace/workspace-suite run dev` — run the frontend (bound via the `artifacts/workspace-suite: web` workflow, port from `PORT` env var, currently 23392)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000, not currently wired into a workflow)
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

- `artifacts/workspace-suite/src/pages/` — top-level pages: `Dashboard.tsx`, `Calendar.tsx`, `EmployeeDashboard.tsx`, `ProcessTimeline.tsx`, `SetupWizard.tsx`
- `artifacts/workspace-suite/src/pages/SetupWizard.tsx` — 5-step account setup wizard; every field/tab is fully interactive (dropdowns, toggles, editable tables, file upload, permission matrix) with local component state, no backend wiring yet
- `artifacts/api-server` — Express API scaffold, not yet connected to the frontend
- `lib/db`, `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` — shared DB schema, OpenAPI spec, and generated client packages, currently unused by the frontend

## Architecture decisions

- The project was imported with the frontend (`workspace-suite`) and backend (`api-server`) scaffolded as separate, currently-disconnected packages — the frontend uses no live data yet.
- Only one workflow (`artifacts/workspace-suite: web`) is currently configured; the API server has no workflow of its own.

## Product

Internal business-operations suite: dashboard overview, calendar/scheduling, employee dashboard, a process timeline view, and a guided setup wizard (business info, operations, account config, data import/export, category mapping).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After `pnpm install`, dependencies weren't present yet (fresh import) — `vite: not found` will show until `pnpm install` is run at the repo root.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
