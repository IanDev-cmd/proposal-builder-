# Desktop migration feasibility

Audit date: 3 November 2026.

## Evidence

This report covers one tree: [IanDev-cmd/proposal-builder-](https://github.com/IanDev-cmd/proposal-builder-) branch `Refactor-new` at `aede184` (20 Oct 2026).

`main` and `refactor` were fast-forwarded to that commit on 3 Nov 2026. All three branches are the same code and the same root blueprint, `render.yaml`, which defines `weott-nexus-workspace`, `weott-quote-builder`, and `weott-proposal-engine`.

The desktop package is `artifacts/pdf-engine` and `artifacts/workspace-suite` from `aede184`.

---

## 1. Executive summary

**Wrapper: Electron, on Windows, with a PyInstaller onedir sidecar.**

**Database: SQLite on the engine, and keep the existing IndexedDB cache in the SPA.**

The product is already a local-first UI. The React app stores leads, quotes, proposals, and a sync outbox in IndexedDB (`nexus-workspace`, version 5). It then syncs those records to the Flask engine. The engine is the shared store, and today that store is Render Postgres. A desktop build keeps that split: the window keeps IndexedDB, and the sidecar writes SQLite instead of Postgres.

Electron fits the repo. The frontend is already pnpm, Vite, React, and TypeScript. Tauri would add a Rust toolchain this repo does not have. The PDF catalog is about 80 MB and is already compressed, so Tauri’s smaller shell does not change the installer much. Electron’s Chromium does cost RAM. That cost is acceptable for a Windows quote tool that must show a splash window and spawn Python.

Do not run embedded Postgres, PGlite, or DuckDB. Quotes are a small transactional document store with soft deletes and PDF blobs. SQLite matches that. PGlite is a WASM Postgres for Node or the browser, not a drop-in for `psycopg`. DuckDB does not preserve the current quote transaction shape.

Do not make Neon, Supabase, or Google Drive the desktop database. Those are still cloud, and they fail offline. Google Apps Script stays an optional online source for live leads and the Cost Mother catalog. The SPA already ships generated catalog JSON and caches leads.

### What zero cloud cost means here

| Capability | Offline desktop | Still needs a network |
|---|---|---|
| Build a quote, generate a PDF, reopen saved quotes on this PC | Yes, after the SQLite adapter | No |
| Same quotes on a second PC, or two people editing at once | No | A sync target (the thing this migration removes) |
| Fresh lead rows and rate changes from Google Sheets | Cached copies only | Apps Script (`NexusApi.gs`) |

That is the product tradeoff. Render Postgres is the team’s shared quote book. A local SQLite file is one workstation’s quote book.

---

## 2. Stack inventory

### Frontend — `weott-quote-builder`

| Item | Finding |
|---|---|
| Package | `@workspace/workspace-suite` |
| UI | React, Vite, Tailwind, wouter, TanStack Query, Zod, Radix, Framer Motion, lucide |
| Build | `pnpm --filter @workspace/workspace-suite run build` → `artifacts/workspace-suite/dist/public` |
| SPA fallback | `render.yaml` rewrites `/*` to `/index.html` |
| Dev server | Vite port `5173` (`PORT` override), host `0.0.0.0` |
| Tests | Vitest 3.2.4 |
| Local database | IndexedDB `nexus-workspace` v5: `leads`, `savedQuotes`, `proposals`, `opsNotes`, `opsQuotes`, `catalog`, `syncOutbox` |
| Engine URL | Hardcoded in `src/lib/backendUrls.ts` as `https://weott-proposal-engine.onrender.com` |
| Sheets URL | Hardcoded Apps Script `/exec` URL in the same file |
| Env | `artifacts/workspace-suite/.env.example` is a comment only. The PIN must not be inlined by Vite. |

There is no Node native addon and no `.woff` / `.otf` in the suite. Images are a company logo, staff avatars, and `public/doc-pages/page_01.png`–`page_18.png`.

### Engine — `weott-proposal-engine`

Python 3.11.9 (`artifacts/pdf-engine/runtime.txt`). Root `pyproject.toml` says `requires-python >= 3.13` and only `pymupdf`. Ignore that file for the desktop build. The engine runtime is 3.11.9.

`requirements.txt` (unpinned):

```
flask
gunicorn
pymupdf
pydantic
psycopg[binary,pool]
```

Native pieces:

- **PyMuPDF (`fitz`)** — MuPDF C library. Used for template open, redact, `insert_font`, `insert_text`, and `Font.text_length`.
- **psycopg binary** — bundled `libpq`. Used only by `workspace_pg.py`. Drop it from the desktop freeze once SQLite is the store.
- **gunicorn** — Render process manager (`--preload`, timeout 60). Do not freeze gunicorn into the desktop exe. The pool code already documents that a preloaded psycopg pool breaks across a gunicorn fork.

Other Python modules in the engine: `engine.py`, `catalog.py`, `config.py`, `cover_contact.py`, `bespoke.py`, `inserts.py`, `measure.py`, `vessel.py`, `payload_schema.py`, `profile_validation.py`, `pdf_cache.py`, `pdf_ops.py`, `fonts.py`, `team_auth.py`, `workspace_store.py`, `workspace_pg.py`.

### How the three Render resources connect

Blueprint: repo-root `render.yaml` on `Refactor-new`.

| Resource | Blueprint | Wiring |
|---|---|---|
| `weott-nexus-workspace` | `plan: basic-256mb`, database `weott_nexus`, user `weott` | `DATABASE_URL` injected into the engine from `connectionString`. YAML does not pin Postgres 18 or Oregon. Those are properties of the existing Render instance. |
| `weott-quote-builder` | static site | Browser calls the engine directly. No Render private network between the SPA and Flask. |
| `weott-proposal-engine` | Python, `rootDir: artifacts/pdf-engine`, plan `starter` | `gunicorn app:app --bind 0.0.0.0:$PORT --timeout 60 --preload` |

A second, stale blueprint lives at `artifacts/pdf-engine/render.yaml`. It describes only the Python service and has no database. The root blueprint is the one that matches the live names.

Engine environment:

| Variable | Where set | Desktop use |
|---|---|---|
| `PORT` | Render; local default **8000** in `app.py` | Fixed loopback port, for example `8765` |
| `DATABASE_URL` | From the Render Postgres | Unset on the desktop build |
| `WORKSPACE_STORE` | `memory` for tests | `sqlite` once the adapter exists |
| `WORKSPACE_DATA_DIR` | Default `artifacts/pdf-engine/data/workspace` | Per-user data dir, not inside Program Files |
| `NEXUS_TEAM_PASSWORD` | Render, `sync: false` | Local config outside the installer. Never bake the PIN into the exe |
| `NEXUS_AUTH_SECRET` | Render `generateValue: true` | Stable local secret so sessions survive restart |
| `NEXUS_ADMIN_TOKEN` | Render, `sync: false` | Local only, for bulk erase |
| `NEXUS_CORS_ORIGINS` | Optional comma list | Unused if Flask serves the SPA on the same origin |
| `FLASK_ENV` | `production` on Render | `production` |

`workspace_store.py` does **not** fall back to JSON for quotes or proposals. If `DATABASE_URL` is empty and `WORKSPACE_STORE` is not `memory`, every quote call raises `DATABASE_URL is required for quotes and proposals`. `memory` is process RAM and disappears on exit. The only file store today is the Cost Mother catalog: `data/workspace/cost_rates_catalog.json`.

### API the SPA already calls

Public:

- `GET /` — health. Body includes `status` (`ok` or `degraded`), `profile_warmup`, template count, insert count. There is no `/health` route.

Session (six-digit PIN, Bearer token):

- `POST /auth/login`, `GET /auth/session`, `POST /auth/touch`, `POST /auth/logout`
- `GET|PUT|DELETE /workspace/quotes` and `/workspace/quotes/<id>`
- `GET /workspace/quotes?full=1` returns full JSON, not the summary
- `GET|PUT|DELETE /workspace/proposals` and `/workspace/proposals/<id>` (PDF stored as `BYTEA`, returned as a data URL)
- `GET|PUT /workspace/catalog`
- `GET /templates`, `GET /inserts`
- `POST /generate` — JSON in, PDF out. Max body 32 MB.

CORS allowlist is built in `app.py`:

- `https://weott-quote-builder.onrender.com`
- `http://localhost:5173`, `http://127.0.0.1:5173`
- `http://localhost:4173`, `http://127.0.0.1:4173`
- plus `NEXUS_CORS_ORIGINS`

`_safe_origin` accepts any `https` host, and `http` only for `localhost` and `127.0.0.1`. `file://`, `app://`, and `tauri://` are rejected. The response does not send `Access-Control-Allow-Private-Network`.

### Assets that must ship beside the engine

Paths come from `config.py`: `BASE_DIR = dirname(abspath(__file__))`.

Fonts (`assets/fonts/`):

| File | In git | Used as |
|---|---|---|
| `CenturyGothic-Regular.ttf` (28,940 bytes) | Yes | Brand regular when the file exists |
| `CenturyGothic-Bold.ttf` | **No** | `fonts.py` checks the path, then uses `Fallback-Bold.ttf` |
| `Fallback-Regular.ttf` (160,316) | Yes | Regular fallback |
| `Fallback-Bold.ttf` (158,576) | Yes | Bold, including finance figures |

Templates: `assets/templates/catalog/manifest.json` plus 24 `template.pdf` files (corporate and wedding, day/evening slots). Sizes are mostly 2.2–3.4 MB. Sum is about 62 MB. Root `template.pdf` is another 2.5 MB (the file `config.py` was measured from).

Inserts: `assets/inserts/manifest.json` and about 48 PDFs under `assets/inserts/files/` (vessel season pages, staff page 16, river map). Roughly 15 MB.

Vessels: `assets/vessels/weott_i.pdf`, `avon_tour.pdf`, `london_rose.pdf` (about 1 MB).

`app.py` calls `warm_profiles()` at import, opening every catalog template before the process serves `GET /`. That warm-up is the desktop startup wait.

---

## 3. Wrapper comparison

Both options are a window plus a Python sidecar. The SPA does not generate PDFs. PyMuPDF stays in Python.

| | Electron | Tauri |
|---|---|---|
| Shell | Bundled Chromium | Rust binary + system WebView2 |
| Fit for this repo | Same language as the Vite app. `electron-builder` NSIS is a known Windows path. | New Rust toolchain, `tauri.conf.json`, sidecar permission model. Nobody on this repo writes Rust today. |
| Installer, Windows x64 | About **180–250 MB**. Chromium plus a ~40 MB PyInstaller onedir plus ~80 MB of PDFs. PDFs are already compressed, so the installer cannot shrink them much. | About **140–200 MB**. The shell saves tens of MB. The PDFs and MuPDF still dominate. |
| Installed RAM, idle | Often **200–400 MB** for the window, plus the Python process. | Often **80–150 MB** for the WebView2 window, plus the same Python process. PDF generation memory is MuPDF, in both cases. |
| Startup | Shell is fast. The wait is Python import of `fitz` and `warm_profiles()` before `GET /` answers. Expect several seconds, sometimes longer on a cold disk. | Same Python wait. WebView2 first launch can add a one-time check on Windows 10. |
| Windows build | Node + pnpm, already in the repo. One OS can produce the `.exe`. | Rustup, MSVC, WebView2 loader, plus the Python sidecar. More CI surface. |
| CORS | Solvable by loading `http://127.0.0.1:<port>` after health passes. | Same. A `tauri://` origin is rejected by `_safe_origin` until that function is widened. |

**Choose Electron.** The RAM difference is real and is the best argument for Tauri. It is not large enough to justify a Rust build chain for a single Windows quote desk. Revisit Tauri only if installed RAM becomes a support problem.

Serve the built SPA from Flask on `127.0.0.1` so the document and the API share one origin. The Electron window is then a host: it starts the sidecar, shows the splash, and loads that origin. It should not load `file://` or the Render static site.

Bind the sidecar to `127.0.0.1` only. Render’s `0.0.0.0` bind is for the platform proxy.

---

## 4. Database options

### Option A — local store. Recommended: SQLite

IndexedDB already survives refresh and restart inside the webview profile. That is the UI cache and the outbox. It is not a substitute for the engine, because `POST /generate` and the workspace routes live in Flask, and proposal PDFs are stored on the server as bytes.

`workspace_store.py` is the seam. Add `workspace_sqlite.py` and select it when `WORKSPACE_STORE=sqlite`. Keep the public functions (`list_quotes`, `put_quote`, `get_proposal`, soft delete, bulk clear). Map the existing tables:

| Postgres (`workspace_pg.SCHEMA_SQL`) | SQLite |
|---|---|
| `TIMESTAMPTZ` | ISO-8601 text, same strings the API already returns |
| `JSONB` | TEXT, JSON encoded on write |
| `BYTEA` pdf | BLOB |
| `ON CONFLICT` upserts | `ON CONFLICT DO UPDATE` (SQLite supports this) |
| `deleted_at` soft delete | Same column. A later PUT must still refuse a deleted quote (`QuoteDeletedError`, HTTP 409) |

Put the file in the user profile, for example `%LOCALAPPDATA%\WEOTT\Nexus\workspace.sqlite`, via `WORKSPACE_DATA_DIR`. An install under Program Files is not writable by a standard user, and an upgrade must not replace the database.

One user, one process: WAL mode is enough. The current pool (`min_size=2`, `max_size=10`) exists for gunicorn. The desktop process should use one SQLite connection with a short busy timeout. Do not open the file from Electron as well.

Rates catalog can stay the JSON file it already is.

Migration off Render: one script, run once, with the network.

1. `GET /workspace/quotes?full=1` and each `GET /workspace/proposals/<id>` (the list route strips the PDF).
2. Insert into SQLite with the same ids, so IndexedDB rows still match.
3. Keep `deleted_at` rows if a full SQL dump is available. The HTTP list hides them. Skipping them means a deleted id could be recreated, which the API currently forbids.

### Option B — embedded Postgres, PGlite, DuckDB. Reject

A local Postgres means `initdb`, a data directory, a port, Windows service recovery, and the same `libpq` packaging. PGlite does not speak the wire protocol `psycopg` uses. DuckDB would mean a new SQL dialect for a workload that is upserts and blobs, not analytics. The engine’s fork-safety comments are a warning against another process model, not a reason to embed a server.

### Option C — Neon, Supabase, or Drive sync. Not this migration

Free-tier Postgres still needs an account, a network, and a vendor limit. It fails the offline requirement the moment the boat office loses Wi-Fi. `workspaceSync.ts` already no-ops the cloud pull when the engine is unreachable and keeps IndexedDB. Point that client at localhost and the outbox drains locally.

Apps Script remains the live lead/rate feed. `catalogSync.ts`, `leadCache.ts`, and the generated JSON under `src/lib/assets/` already let quote building proceed from a snapshot. A desktop build should treat Sheets as refresh, not as the system of record for quotes.

---

## 5. Bundling PyMuPDF without a user Python install

Use **PyInstaller onedir**, Python **3.11.9**, on a Windows x64 build machine. Pin `pymupdf` to the version Render is running before freezing. `requirements.txt` is unpinned today. A different MuPDF build changes `Font.text_length`, and the cover fields only allow about 8% shrink (`COVER_SHRINK_RATIO_FLOOR = 0.92`).

`engine.spec` should:

- Set the entry to `app.py` (or a new `desktop_main.py` that sets `PORT`, `WORKSPACE_STORE`, and `WORKSPACE_DATA_DIR`, then serves the SPA).
- Collect `fitz` / `pymupdf` binaries (`collect_all` or the project’s hiddenimports). One missing `mupdf` DLL is a silent font or open failure.
- Add data trees, preserving paths relative to the engine root:
  - `assets/fonts`
  - `assets/templates`
  - `assets/inserts`
  - `assets/vessels`
  - `template.pdf`
- Exclude `psycopg`, `gunicorn`, `pytest`, and `tools/` from the desktop build.
- Prefer onedir. Onefile unpacks MuPDF and the PDF tree into a temp folder on every launch and makes the splash wait longer.

`config.BASE_DIR` is `dirname(abspath(__file__))`. In a PyInstaller build `__file__` lands in `_internal` (PyInstaller 6) or `_MEIPASS` (onefile). The spec must place `assets/` so that expression still finds the fonts, **or** `config.py` must grow a frozen-root helper and every asset path must use it. Catalog entries are relative (`_BASE / t["path"]`). A spec that flattens PDFs next to the exe will fail warm-up and `GET /` will stay `degraded`.

Verify the freeze with the existing engine tests that do not need Postgres (`test_geometry_frozen.py`, `test_payload_schema.py`) plus one real `POST /generate` against a catalog template. Compare `X-Using-Brand-Font` and a cover text width to a PDF from today’s Render engine.

### Splash

The wrapper owns the splash. Flask cannot show UI before it binds, and `warm_profiles()` runs at import, so the port is closed during the slow part.

1. Electron opens a splash window immediately (determinate bar, status line).
2. Spawn `engine.exe` with `PORT` and the user data dir. Capture stdout.
3. Poll `http://127.0.0.1:<port>/` every 300 ms, timeout around 60 s.
4. `status: ok` → load the SPA at that same origin.
5. `status: degraded` → still open the SPA, and show `profile_warmup.error`. Generation will 422 with “PDF layout validation failed” or “No matching proposal template” if templates did not load.
6. Process exit before the first 200 → splash shows the stderr tail. Do not leave the user on a blank Chromium error page.

There is no `/health` path. Poll `GET /`.

---

## 6. CORS and Private Network Access

Current `_safe_origin` plus the missing `Access-Control-Allow-Private-Network` header produce three different outcomes:

| SPA origin | API | Result with today’s `app.py` |
|---|---|---|
| `http://127.0.0.1:8765` served **by Flask** | same origin | No CORS preflight. This is the desktop design. |
| `http://127.0.0.1:5173` (Vite) | `http://127.0.0.1:8765` | Allowed. Already in the default list. Fine for development. |
| `file://`, `app://`, `tauri://` | loopback | Origin rejected. Browser shows a CORS failure. |
| `https://weott-quote-builder.onrender.com` | `http://127.0.0.1` | Chrome Private Network Access preflight. This server does not answer `Access-Control-Allow-Private-Network: true`. The call is blocked. |

Do not point the installed app at the Render static site, and do not add a wide private-network exception so a public website can call a desktop engine. The PIN would then be one loopback port away from any page the user opens.

---

## 7. Risks

**Font advance parity.** Bold brand type is already the fallback font, because `CenturyGothic-Bold.ttf` is not in git. `draw_prepared` paints finance figures twice, 0.18 pt apart, when `deep_bold` is set. A desktop build must ship the same three TTF files and the same PyMuPDF build. Installing “Century Gothic” from Windows fonts would change widths and may be a licensing problem. The digit probe in `fonts.py` exists because subset fonts often cannot round-trip `0123456789`.

**Template path inside the bundle.** Warm-up and generate both open paths from `BASE_DIR`. A missing catalog file becomes `degraded` health or HTTP 422, not a crash. The spec test is: `GET /` reports `templates` equal to the manifest count and `profile_warmup.ok` true.

**Geometry baselines.** `tests/geometry_baselines.sha256` and `measure.py` assume the current template coordinates in `config.py`. Replacing a `template.pdf` without re-running `tools/inspect_page.py` will fail validation (`ProfileValidationError`).

**Data location and upgrades.** Quotes and proposal BLOBs must live under `%LOCALAPPDATA%`, not next to the exe. electron-builder’s NSIS upgrade must not delete that directory.

**Single-machine sharing.** Two desktop installs will diverge. The sync outbox assumes one remote. After cutover, either disable cloud sync or point it only at localhost. Leaving `PROPOSAL_ENGINE_URL` on `onrender.com` would keep writing to the paid database.

**Session secret.** If `NEXUS_AUTH_SECRET` is empty, `team_auth` generates one at boot and every restart logs the user out. Persist a secret in the user data dir.

**Apps Script outage.** Lead search and rate refresh fail offline. Quote editing from IndexedDB and PDF generation from the bundled catalog still work. Say that on the splash or the leads screen the first time the network call fails.

**Unpinned dependencies.** Freeze only after pinning `flask`, `pymupdf`, and `pydantic` to the versions that produced the last accepted PDF on Render.

---

## 8. Implementation roadmap

Each phase is one PR on `Refactor-new` (`aede184`). `main` and `refactor` already match that commit, including the blueprint. A push to `main` is what Render deploys.

### Phase 1 — Python engine executable (`engine.spec`)

Scope: `artifacts/pdf-engine` only. No UI.

- Add `requirements-desktop.txt` with pinned `flask`, `pymupdf`, `pydantic`. Omit `gunicorn` and `psycopg`.
- Add `desktop_main.py`: set `HOST=127.0.0.1`, read `PORT`, refuse to bind `0.0.0.0`.
- Add `bundle_root()` and use it for `BASE_DIR` when `sys.frozen` is set. Dev behavior stays `dirname(__file__)`.
- Add `engine.spec` (onedir) collecting MuPDF and the `assets/` tree plus `template.pdf`.
- Document the build: Python 3.11.9 x64, `pyinstaller engine.spec`.
- Acceptance: on a clean Windows user account with no Python installed, `GET /` returns `status: ok` and `profile_warmup.ok: true`, and one Christmas and one wedding `POST /generate` return a PDF whose `X-Using-Brand-Font` matches Render.

### Phase 2 — Electron shell and splash

New folder `desktop/` (package owned by the pnpm workspace).

- Electron main process spawns `engine.exe`, polls `GET /`, then `loadURL` the same origin.
- Splash window: progress bar, “Opening templates”, then the SPA. On degraded health, show `profile_warmup.error` and continue.
- Kill the sidecar on window close and on quit. If the port is taken, exit with a clear splash message rather than attaching to a stranger’s process.
- Development mode can spawn `python desktop_main.py` instead of the frozen exe.
- Acceptance: cold start on Windows 10 shows the splash until `GET /` succeeds, then the quote builder. Killing the engine mid-session returns to the splash with the exit reason.

### Phase 3 — SQLite adapter

- `workspace_sqlite.py` implementing the functions `workspace_store.py` already branches on.
- `WORKSPACE_STORE=sqlite` selects it. `DATABASE_URL` stays the Postgres path for Render.
- Schema matches `SCHEMA_SQL`, including soft delete and the 409 on a deleted quote.
- File path: `%LOCALAPPDATA%\WEOTT\Nexus\workspace.sqlite` (override with `WORKSPACE_DATA_DIR`).
- One-shot `tools/import_workspace_snapshot.py` that reads a JSON export from the live engine (`full=1` quotes plus proposal bodies) and loads SQLite.
- Point `backendUrls.ts` at the desktop origin via a Vite `define` or a tiny `config.json` Flask serves. Remove the hardcoded `onrender.com` host from the packaged build.
- Leave Apps Script URLs in place for online lead refresh.
- Acceptance: with `DATABASE_URL` unset, create a quote, restart the exe, and see the same quote. Generate a proposal, restart, and download the same PDF bytes. `pytest` `test_workspace_pg.py` still passes against Postgres in CI; add `test_workspace_sqlite.py` with the same cases (upsert, soft delete, 409, proposal blob).

### Phase 4 — Installer

- `electron-builder` NSIS, x64, one-click per machine or per user. Artifact name `WEOTT Quote Builder Setup.exe`.
- Extra resource: the Phase 1 onedir folder.
- Installer does not include `NEXUS_TEAM_PASSWORD` or `NEXUS_ADMIN_TOKEN`. First launch writes them to the user data dir from a prompt, or reads them from an existing file an admin copied.
- Uninstall must leave `%LOCALAPPDATA%\WEOTT\Nexus` in place unless the user checks “delete saved quotes”.
- Acceptance: install on a PC that has never had Python or Node. Splash, PIN login, saved quote, PDF download, reboot, quote still present. Upgrade install keeps the SQLite file.

---

## 9. Suggested first PR boundary

Phase 1 is independently shippable and is the riskiest part (MuPDF DLLs, font files, 80 MB of templates, `__file__` paths). Do not start Electron until `GET /` is healthy from the frozen exe.
