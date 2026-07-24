# Self-QA — PR #4383 `fix(workflows): resolve synthetic code-definition UUID in definitions/[id] GET`

**Date:** 2026-07-24
**Verdict: PASS** (P0 + P1 from the maintainer's QA instructions, plus a reproduced before/after)

## Environment

| Item | Value |
|---|---|
| Base | `origin/develop` @ `78e5b7a65` |
| PR head | `307c8056c` (merged locally into `qa-4383-merged` @ `86e04607c`, clean merge) |
| Runner | local `yarn dev:app` (Next dev), port **3012** |
| Database | fresh `mercato_qa4383` (docker `mercato-postgres`), `yarn workspace @open-mercato/app initialize` |
| Login | `superadmin@acme.com` / `secret`, tenant Acme Corp |
| Note | the app resolves `@open-mercato/core` from `dist`, so the before/after comparison was done by rebuilding core from the pre-fix and post-fix sources on the same running instance |

## P0 — core fix (PASS)

Started an instance of the **code-only** workflow `workflows.simple-approval`
(`POST /api/workflows/instances` → 201, `status: RUNNING`).

| Check | Before fix (develop build) | After fix (PR build) |
|---|---|---|
| `instance.definitionId` | `56d62189-2305-43b5-9f81-fc1f8549a6cd` (synthetic) | same deterministic UUID |
| `GET /api/workflows/definitions/<definitionId>` | **404** `{"error":"Workflow definition not found"}` | **200** |
| `data.id` | — | `code:workflows.simple-approval` |
| `data.workflowId` | — | `workflows.simple-approval` |
| `data.isCodeBased` | — | `true` |
| Instance page `/backend/instances/<id>` | text **"Workflow definition not found (ID: 56d62189-…)"** (shot `before-02-visual-flow.png`) | **Visual Workflow Flow** graph renders: Start → Submit for Approval → Pending Approval, with legend (shot `after-02-visual-flow.png`) |

## P1 — regression coverage (PASS)

| Check | Result |
|---|---|
| `GET /api/workflows/definitions/code:workflows.simple-approval` (existing canonical branch) | 200, `data.id = code:workflows.simple-approval` |
| `GET /api/workflows/definitions/8f2b1c3d-4e5f-4a6b-9c8d-0e1f2a3b4c5d` (random UUID) | **404** `{"error":"Workflow definition not found"}` — fallback matches only real synthetic code UUIDs |
| DB-persisted definition `sales_pipeline_v1` (`fc5f113b-…`): start instance → `GET definitions/<db uuid>` | 200, `data.id = fc5f113b-…`, `isCodeBased: false` — DB lookup path unchanged |
| Instance page for the persisted workflow | Visual Workflow Flow renders the 5-step sales pipeline graph (shot `after-03-persisted-instance.png`) |

## Evidence files

- `shots/before-02-visual-flow.png` — the bug reproduced on the pre-fix build
- `shots/after-01-instance-detail.png`, `shots/after-02-visual-flow.png` — code workflow after the fix
- `shots/after-03-persisted-instance.png` — DB-persisted workflow after the fix
- `qa-4383.mjs`, `qa-4383-persisted.mjs`, `lib.mjs` — the Playwright/API drivers used
- `route.before.ts` / `route.after.ts` — the two route versions compared

## Notes

- No cross-tenant concern observed: both branches return code definitions from the process-level
  registry, exactly as the pre-existing `code:` branch already did.
- QA account is read-only on the repo, so the `qa-approved` / `qa-self-verified` labels have to be
  applied by a maintainer.
