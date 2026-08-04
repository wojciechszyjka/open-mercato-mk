import { z } from 'zod'

export const aggregateFunctionSchema = z.enum(['count', 'sum', 'avg', 'min', 'max'])
export const dateGranularitySchema = z.enum(['day', 'week', 'month', 'quarter', 'year'])
export const dateRangePresetSchema = z.enum([
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'this_year',
  'last_year',
  'last_7_days',
  'last_30_days',
  'last_90_days',
])

const comparisonFilterOperators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const
const setFilterOperators = ['in', 'not_in'] as const
const nullFilterOperators = ['is_null', 'is_not_null'] as const
const scalarFilterOperators = [...comparisonFilterOperators, ...nullFilterOperators] as const

export const filterOperatorSchema = z.enum([
  ...comparisonFilterOperators,
  ...setFilterOperators,
  ...nullFilterOperators,
])

/**
 * A member of an `in` / `not_in` set filter must be a non-null literal.
 *
 * `IN` and `NOT IN` compare against literals, and SQL comparison with NULL yields NULL rather
 * than TRUE: `column IN (NULL)` matches no row, and `column NOT IN ('a', NULL)` is NULL for
 * every row, so a single null member silently turns the aggregation into a zero instead of
 * raising anything. On a reporting surface that zero is indistinguishable from a real answer,
 * which is why the null shapes are refused here at the request boundary — with a 400 that names
 * the offending filter — rather than reinterpreted deeper in the SQL builder.
 *
 * `null` is the shape a JSON caller reaches for when it means "no value": `undefined` cannot be
 * expressed in JSON, so omitting the `value` key is the only way to ask for the empty set, and
 * `{"value": null}` would otherwise land on an undocumented path. Filtering on nullness is what
 * the dedicated `is_null` / `is_not_null` operators are for.
 */
const setFilterMemberSchema = z.union([z.string(), z.number(), z.boolean()])

/**
 * A set filter accepts a list of members, a bare member (a single-member set), or nothing at all
 * (the empty set — see `normalizeSetFilterValues` in `lib/aggregations.ts`). What it does not
 * accept is `null`, in either position.
 */
const setFilterValueSchema = z
  .union([z.array(setFilterMemberSchema), setFilterMemberSchema])
  .optional()

/**
 * Only the set operators constrain their value; the scalar and null-test operators keep the
 * permissive shape they have always had, so this tightening cannot regress them.
 */
const widgetDataFilterSchema = z.discriminatedUnion('operator', [
  z.object({
    field: z.string().min(1),
    operator: z.enum(setFilterOperators),
    value: setFilterValueSchema,
  }),
  z.object({
    field: z.string().min(1),
    operator: z.enum(scalarFilterOperators),
    value: z.unknown().optional(),
  }),
])

export const widgetDataRequestSchema = z.object({
  entityType: z.string().min(1),
  metric: z.object({
    field: z.string().min(1),
    aggregate: aggregateFunctionSchema,
  }),
  groupBy: z
    .object({
      field: z.string().min(1),
      granularity: dateGranularitySchema.optional(),
      limit: z.number().int().min(1).max(100).optional(),
      resolveLabels: z.boolean().optional(),
    })
    .optional(),
  filters: z.array(widgetDataFilterSchema).optional(),
  dateRange: z
    .object({
      field: z.string().min(1),
      preset: dateRangePresetSchema,
    })
    .optional(),
  comparison: z
    .object({
      type: z.enum(['previous_period', 'previous_year']),
    })
    .optional(),
})

export const widgetDataItemSchema = z.object({
  groupKey: z.unknown(),
  groupLabel: z.string().optional(),
  value: z.number().nullable(),
})

export const widgetDataResponseSchema = z.object({
  value: z.number().nullable(),
  data: z.array(widgetDataItemSchema),
  comparison: z
    .object({
      value: z.number().nullable(),
      change: z.number(),
      direction: z.enum(['up', 'down', 'unchanged']),
    })
    .optional(),
  metadata: z.object({
    fetchedAt: z.string(),
    recordCount: z.number(),
    currency: z.string().nullable().optional(),
  }),
})
