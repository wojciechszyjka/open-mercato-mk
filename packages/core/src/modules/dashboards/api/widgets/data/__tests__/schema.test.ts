import { widgetDataRequestSchema } from '../schema'

const baseRequest = {
  entityType: 'sales:orders',
  metric: { field: 'grandTotalGrossAmount', aggregate: 'sum' },
}

function parseFilter(filter: unknown) {
  return widgetDataRequestSchema.safeParse({ ...baseRequest, filters: [filter] })
}

function issuePaths(result: ReturnType<typeof parseFilter>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
}

const setOperators = ['in', 'not_in'] as const

/**
 * A null member would render as `column IN (NULL)` / `column NOT IN (…, NULL)`, which is NULL for
 * every row rather than an error — an empty aggregation that reads like a legitimate zero on a
 * dashboard. `null` is also the only way a JSON caller can express "no value", so it must be
 * refused at the boundary instead of being reinterpreted by the SQL builder.
 */
describe('widgetDataRequestSchema — set filter members', () => {
  it.each(setOperators)('rejects a null value for %s and points at the offending filter', (operator) => {
    const result = parseFilter({ field: 'status', operator, value: null })
    expect(result.success).toBe(false)
    expect(issuePaths(result).some((path) => path.startsWith('filters.0.value'))).toBe(true)
  })

  it.each(setOperators)('rejects a null member inside the array for %s', (operator) => {
    const result = parseFilter({ field: 'status', operator, value: [null] })
    expect(result.success).toBe(false)
    expect(issuePaths(result).some((path) => path.startsWith('filters.0.value'))).toBe(true)
  })

  it('rejects a null member mixed in with valid ones, the classic NOT IN trap', () => {
    expect(parseFilter({ field: 'status', operator: 'not_in', value: ['cancelled', null, 'refunded'] }).success).toBe(
      false,
    )
  })

  it('rejects a non-primitive member that could never be compared as a literal', () => {
    expect(parseFilter({ field: 'status', operator: 'in', value: [{ status: 'completed' }] }).success).toBe(false)
  })

  it('accepts the shapes the aggregation builder documents', () => {
    expect(parseFilter({ field: 'status', operator: 'in', value: ['completed', 'shipped'] }).success).toBe(true)
    expect(parseFilter({ field: 'status', operator: 'not_in', value: 'cancelled' }).success).toBe(true)
    expect(parseFilter({ field: 'status', operator: 'in', value: [] }).success).toBe(true)
    expect(parseFilter({ field: 'status', operator: 'in' }).success).toBe(true)
  })

  it('accepts falsy members that are not null', () => {
    expect(parseFilter({ field: 'grandTotalGrossAmount', operator: 'in', value: [0, false, ''] }).success).toBe(true)
  })

  it('leaves the scalar and null-test operators as permissive as they were', () => {
    expect(parseFilter({ field: 'status', operator: 'eq', value: null }).success).toBe(true)
    expect(parseFilter({ field: 'status', operator: 'eq', value: 'completed' }).success).toBe(true)
    expect(parseFilter({ field: 'customerEntityId', operator: 'is_null' }).success).toBe(true)
    expect(parseFilter({ field: 'grandTotalGrossAmount', operator: 'gte', value: 100 }).success).toBe(true)
  })

  it('still rejects an unknown operator', () => {
    expect(parseFilter({ field: 'status', operator: 'contains', value: 'x' }).success).toBe(false)
  })
})
