# Dashboards `in` / `not_in` Aggregation Filter Operators

Issue: #4669 (follow-up from #4629)

## Goal

Cover the untested `in` and `not_in` widget-data filter operators in
`packages/core/src/modules/dashboards/lib/aggregations.ts` and act on what the coverage reveals.

## Finding

The operators are not merely untested — they are broken for every possible value.

MikroORM does not bind parameters at the driver level. `AbstractSqlConnection.execute` calls
`platform.formatQuery`, which interpolates each parameter into the SQL text, and
`BasePostgreSqlPlatform.escape` renders a JavaScript array as a bare comma-separated list. The
`= ANY(?)` / `!= ALL(?)` form therefore produced SQL PostgreSQL rejects:

| Value passed by the caller | Rendered SQL | PostgreSQL 17 |
|---|---|---|
| `['completed', 'shipped']` | `status = ANY('completed', 'shipped')` | `syntax error at or near ","` |
| `['completed']` | `status = ANY('completed')` | `malformed array literal: "completed"` |
| `[]` | `status = ANY()` | `syntax error at or near ")"` |
| `'completed'` | `status = ANY('completed')` | `malformed array literal: "completed"` |

`not_in` fails identically through `!= ALL(?)`. Both operators are reachable from the public
`WidgetDataRequest` operator union and the widget-data API schema, so any caller using them got a
500 rather than a filtered aggregation.

## Decision

Fix the binding rather than remove the operators. The operator union
(`services/widgetDataService.ts`) and the request schema (`api/widgets/data/schema.ts`) are public
contract surfaces under `BACKWARD_COMPATIBILITY.md`; removing members is a breaking change, while
the operators themselves are the natural way to express set membership.

The fix renders one placeholder per member — `col IN (?, ?)` / `col NOT IN (?, ?)` — so every value
is escaped by its own JavaScript type, and handles the empty set explicitly (`FALSE` for `in`,
`TRUE` for `not_in`) because `IN ()` is a syntax error.

## Scope

- `packages/core/src/modules/dashboards/lib/aggregations.ts` — the `in` / `not_in` branches of the
  shared `buildWhereClause`, used by both `buildAggregationQuery` and `buildGroupSourceRowsQuery`.
- Unit coverage in `lib/__tests__/aggregations.test.ts`.
- Integration coverage in `__integration__/TC-DASH-010-set-filter-operators.spec.ts`.

## Review follow-up — the `null` member (Major, review of 2026-08-03)

@MStaniaszek1998 found the one value shape the per-member fix mishandled: the request schema typed
`filters[].value` as `z.unknown().optional()`, so `{"value": null}` and `[null]` validated, and
`normalizeSetFilterValues` treated `null` as an ordinary member. The rendered predicate became
`column IN (NULL)` / `column NOT IN (…, NULL)`, which is SQL NULL for every row — the aggregation
returned **zero rows with no error**. On a reporting surface that is worse than the 500 the operators
raised before this PR: a silent zero reads like a real answer. It is also the likely shape rather
than a theoretical one, because `undefined` cannot be expressed in JSON, so `null` is how a JSON
caller says "no value".

Of the three remedies the review offered, the chosen one is **rejecting null at the request schema**
(its option 3): the failure stays loud and moves to the boundary, where the 400 names the offending
filter. Option 1 (partitioning nulls into `OR column IS NULL`) would have guessed at intent that
`is_null` / `is_not_null` already express explicitly, and option 2 (silently treating `null` as the
empty set) keeps the silent-zero failure mode this finding is about.

Scope of the follow-up:

- `api/widgets/data/schema.ts` — the filter object becomes a discriminated union on `operator`.
  Set operators take a bounded shape (array of non-null primitives, a bare primitive, or nothing);
  scalar and null-test operators keep their permissive `z.unknown().optional()` value, so no
  unrelated operator is tightened.
- `lib/aggregations.ts` — `normalizeSetFilterValues` throws on a null or undefined member instead of
  rendering it, as a second line of defense for in-process callers whose values are typed `unknown`.
- Unit coverage for `value: null` and `value: [null]` at the schema layer, at the builder layer, and
  at the route (400, service never invoked), plus a case pinning that falsy-but-not-null members
  (`''`, `0`, `false`) still pass.

## Non-goals

- No change to the operator union, or to any operator other than `in` / `not_in`.
- No upper bound on set-filter member count — that minor finding is tracked separately (#4852,
  carried forward on PR #4916).
- No change to how `organization_id = ANY(?::uuid[])` binds — that path already passes a PostgreSQL
  array literal with an explicit cast and works.

## Progress

- [x] Reproduce the defect at the driver layer (`PostgreSqlPlatform.formatQuery`) and against a live
      PostgreSQL 17 server.
- [x] Expand `in` / `not_in` into per-member placeholders with explicit empty-set handling.
- [x] Unit tests: generated SQL fragment, bound-parameter shape, single-member, scalar, empty set,
      and the encrypted group-source row query.
- [x] Unit test asserting the fully rendered SQL through the real `PostgreSqlPlatform.formatQuery`
      — the exact text the server receives — plus a regression record of the rejected old form.
- [x] Integration spec driving both operators through the widget-data route to PostgreSQL.
- [x] Validation gate.
- [x] PR opened, labels requested from a maintainer.
- [x] Review follow-up: reject `null` set-filter values and null members at the request schema,
      guard the SQL builder, and cover both shapes with unit, route and integration assertions.
- [x] Re-run the validation gate on top of the current `develop`.
- [ ] Re-review by @MStaniaszek1998.

## Verification notes

The jest layer cannot open a PostgreSQL connection, so unit coverage asserts on the output of the
same interpolation the runtime performs. Live-server confirmation comes from
`TC-DASH-010-set-filter-operators.spec.ts` and, during development, from executing the generated
SQL directly against PostgreSQL 17 (results in the table above).
