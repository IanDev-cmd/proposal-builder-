---
name: Imported artifacts missing from registry
description: This workspace's artifacts (workspace-suite, api-server) don't appear in listArtifacts(), which breaks the Screenshot appPreview tool and blocks WorkflowsRestart by guessed name.
---

`listArtifacts()` returns `[]` even though `artifacts/<slug>/.replit-artifact/artifact.toml` files exist and describe real services. This is a pre-existing quirk of this imported project, not something to "fix" — it doesn't block the app from working.

**Why:** The artifact registry is separate from the `.replit` workflow config and from the `artifact.toml` files on disk. An import can leave services fully functional (or even wired into `.replit`) without ever registering them in the artifact registry.

**How to apply:**
- `Screenshot` with `source.type: "appPreview"` fails with "Artifact not found" for these services — use `source.type: "externalUrl"` against `https://${REPLIT_DEV_DOMAIN}<path>` instead (fetch the domain inside a `"use impure"` CodeExecution block).
- `WorkflowsRestart` with the documented guessed name (e.g. `artifacts/api-server: API Server`) can fail with "doesn't exist in config" if no `.replit` workflow entry was ever created for that service, even though the artifact.toml describes one. In that case, use the `configureWorkflow` CodeExecution callback to create a matching workflow by hand (command from the toml's `services.development.run`, port from `services[].localPort`) — this is the same pattern the imported project already used for its other, working service.
