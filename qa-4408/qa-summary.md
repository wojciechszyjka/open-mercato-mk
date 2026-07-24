# Self-QA — PR #4408 (fix(dashboards): apply overrides.widgets.dashboard to the server-side widget catalog, #4377)

**Date:** 2026-07-24
**Verdict:** PASS
**Runner:** local (host), Next.js dev on port 3010

## Environment

| Item | Value |
|---|---|
| Worktree | `.ai/cezar/runs/qa-4408/repo` |
| Base | `origin/develop` @ `78e5b7a65` |
| PR head | `da04e9d54` (`refs/pull/4408/head`), merged clean into develop (`a99f515dc`) |
| Database | fresh `mercato_qa4408` (docker `mercato-postgres`), `yarn workspace @open-mercato/app initialize` with example data |
| App | `PORT=3010 yarn dev:app:verbose` |
| Users | `superadmin@acme.com` / `secret` |

## Test override

Added to `apps/mercato/src/modules.ts` (QA-only, not part of the PR):

```ts
{
  id: 'customers',
  from: '@open-mercato/core',
  overrides: {
    widgets: {
      dashboard: {
        'customers:new-deals:widget': null,        // metadata.id customers.dashboard.newDeals, defaultEnabled: true
        'dashboards:top-customers:widget': null,   // metadata.id dashboards.analytics.topCustomers
      },
    },
  },
}
```

Keys verified against `apps/mercato/.mercato/generated/dashboard-widgets.generated.ts`.

## Results

### P1 — Disabled dashboard widget catalog behavior — PASS

| Check | With fix | Without fix (control) |
|---|---|---|
| `GET /api/dashboards/widgets/catalog` count | 19 | 21 |
| `customers.dashboard.newDeals` in catalog | absent ✅ | **present ❌** |
| `dashboards.analytics.topCustomers` in catalog | absent ✅ | **present ❌** |
| Controls (`customers.dashboard.newCustomers`, `dashboards.analytics.revenueKpi`) | present ✅ | present ✅ |
| Role widget picker (`/backend/roles/<employee>/edit`), "Top Customers" / "New Deals" | not listed ✅ | **listed ❌** |
| Other widgets in picker (Top Products, Revenue, …) | listed and rendering ✅ | listed ✅ |

### P1 — Default layout for a user with no saved layout — PASS

`dashboard_layouts` truncated before each run, then `GET /api/dashboards/layout` as superadmin.

| Check | With fix | Without fix (control) |
|---|---|---|
| default layout size | 8 items | 9 items |
| `customers.dashboard.newDeals` (defaultEnabled: true) in default layout | absent ✅ | **present ❌** |
| `allowedWidgetIds` contains either disabled widget | no ✅ | **yes ❌** |
| `/backend` renders "New Deals" tile | no ✅ | **yes ❌** (screenshot `01-dashboard-control.png`) |
| Remaining widgets render normally | yes ✅ (Customer Tasks, New Customers, Next Customer Interactions, New Orders, New Quotes, Notes, Todos, Welcome) | yes ✅ |

### P1 — Existing saved layouts referencing a now-disabled widget — PASS

Injected two extra items into the stored `dashboard_layouts.layout_json`
(`customers.dashboard.newDeals`, `dashboards.analytics.topCustomers`), 10 items total, then loaded `/backend`.

- `GET /api/dashboards/layout` served 8 items — both disabled ids filtered out server-side ✅
- Dashboard rendered without a broken/empty tile ✅
- Zero uncaught page errors (`page.on('pageerror')` collected `[]`) ✅
- Reload did not restore the disabled widgets ✅

### Unit tests

`yarn workspace @open-mercato/core test -- --testPathPattern dashboards` → **14 suites / 126 tests passed** (matches the PR description).

## Observation (not a blocker, pre-existing, out of PR scope)

`dashboard_role_widgets` rows seeded by the CLI (`mercato dashboards seed-defaults` /
`enable-analytics-widgets`, run by `yarn initialize`) still contain the disabled widget ids, and
`GET /api/dashboards/roles/widgets` returns them verbatim.

Cause: `applyModuleOverridesFromEnabledModules(enabledModules)` is only called from the Next.js app
bootstrap (`apps/mercato/src/bootstrap.ts`), so the override store is empty in CLI processes. The
CLI helpers themselves already filter through `loadAllWidgets()` — they just see an unfiltered
catalog there. This affects every `modules.ts` override domain in CLI processes, not just dashboard
widgets, and it predates this PR.

Impact is inert: every read path (`resolveAllowedWidgetIds`, layout GET, catalog, visibility editor)
intersects against the catalog, so the stale ids never reach the UI — confirmed above
(`allowedWidgetIds` excluded them while the role row still listed them). Worth a follow-up issue
about dispatching `modules.ts` overrides in the CLI/worker bootstrap.

## Artifacts

- `evidence/shots/01-dashboard-fixed.png` / `01-dashboard-control.png`
- `evidence/shots/02-role-widget-picker-fixed.png` / `02-role-widget-picker-control.png`
- `evidence/shots/03-saved-layout-after-disable.png`, `04-saved-layout-after-reload.png`
- Logs: `api-fixed.log`, `api-control.log`, `ui-fixed.log`, `ui-control.log`, `saved-layout.log`, `tests.log`
- Scripts: `evidence/qa-4408-api.mjs`, `evidence/qa-4408-ui.mjs`, `evidence/qa-4408-saved-layout.mjs`
