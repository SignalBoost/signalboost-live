export type AnalyticsFilters = {
  startDate?: string
  endDate?: string
  region?: string
  campaign?: string
}

export type AnalyticsRequestParseResult =
  | { ok: true; filters: AnalyticsFilters }
  | { ok: false; error: string }

const ALLOWED_PARAMETERS = new Set(['startDate', 'endDate', 'region', 'campaign'])
const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGE_DAYS = 90
const MAX_FILTER_LENGTH = 100

function parseDate(value: string): Date | null {
  if (!DATE.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date
}

export function parseAnalyticsRequest(url: string): AnalyticsRequestParseResult {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, error: 'Malformed request URL.' }
  }

  for (const key of parsed.searchParams.keys()) {
    if (!ALLOWED_PARAMETERS.has(key)) return { ok: false, error: `Unsupported query parameter: ${key}.` }
  }

  const filters: AnalyticsFilters = {}
  for (const key of ALLOWED_PARAMETERS) {
    const values = parsed.searchParams.getAll(key)
    if (values.length > 1) return { ok: false, error: `Query parameter must be supplied once: ${key}.` }
    const value = values[0]?.trim()
    if (!value) continue
    if ((key === 'region' || key === 'campaign') && value.length > MAX_FILTER_LENGTH) {
      return { ok: false, error: `Query parameter is too long: ${key}.` }
    }
    filters[key] = value
  }

  const start = filters.startDate ? parseDate(filters.startDate) : null
  const end = filters.endDate ? parseDate(filters.endDate) : null
  if (filters.startDate && !start) return { ok: false, error: 'startDate must use YYYY-MM-DD.' }
  if (filters.endDate && !end) return { ok: false, error: 'endDate must use YYYY-MM-DD.' }
  if (start && end) {
    if (start > end) return { ok: false, error: 'startDate must not be after endDate.' }
    if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
      return { ok: false, error: `Date range must not exceed ${MAX_RANGE_DAYS} days.` }
    }
  }

  return { ok: true, filters }
}
