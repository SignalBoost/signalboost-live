// saas/lib/ai/cos/plannerSearchQueries.ts
//
// Pure (zero imports): the search queries the first-turn planner writes when it requests live_web,
// and their transport from the browser ingress to /api/cos-primary.
//
// Why this exists (production 2026-10-10): live search used a fixed template built from the user's raw
// sentence. "which political party will be the majority in the US?" retrieved a historical Senate table, a
// House page and an academic paper on polarization — none about 2026 control — so COS could only narrate what
// each source lacked. A follow-up ("whose is more likely to be the next Brazilian president?") cannot be
// searched from its own words at all. The planner already reads the request and the preceding turn; it now
// also writes the queries, resolving the follow-up into a self-contained search the way a person would.
//
// Queries are untrusted model output used only as search-engine input: they never reach the answer as
// evidence, and every retrieved page still passes the same security inspection and release gates.

export const PLANNER_SEARCH_QUERY_MAX_COUNT = 3
export const PLANNER_SEARCH_QUERY_MAX_CHARS = 200
export const PLANNER_SEARCH_QUERIES_HEADER = 'x-signalboost-agent-search-queries'

/** Normalizes model-written queries: strings only, control characters removed, bounded, de-duplicated. */
export function sanitizePlannerSearchQueries(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const query = item.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, PLANNER_SEARCH_QUERY_MAX_CHARS).trim()
    if (query.length < 3) continue
    const key = query.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(query)
    if (out.length >= PLANNER_SEARCH_QUERY_MAX_COUNT) break
  }
  return out
}

/** Reads `queries` from a native tool call's JSON arguments. Malformed arguments yield no queries. */
export function plannerSearchQueriesFromToolArguments(argumentsText: string): string[] {
  const text = String(argumentsText || '').trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? sanitizePlannerSearchQueries(parsed.queries) : []
  } catch {
    return []
  }
}

export function encodePlannerSearchQueriesHeader(queries: readonly string[]): string {
  const clean = sanitizePlannerSearchQueries([...queries])
  return clean.length ? encodeURIComponent(JSON.stringify(clean)) : ''
}

export function decodePlannerSearchQueriesHeader(raw: string | null | undefined): string[] {
  const text = String(raw || '').trim()
  if (!text) return []
  try {
    return sanitizePlannerSearchQueries(JSON.parse(decodeURIComponent(text)))
  } catch {
    return []
  }
}

/**
 * The searches for this turn. Planner queries lead; the host's template query is kept as one extra
 * search so a drifting planner query cannot leave the turn without a search on the user's own words.
 * With no planner queries the host's queries are used unchanged.
 */
export function liveSearchQueriesForTurn(plannerQueries: readonly string[], hostQueries: readonly string[]): string[] {
  const planned = sanitizePlannerSearchQueries([...plannerQueries])
  if (!planned.length) return [...hostQueries]
  const seen = new Set(planned.map(query => query.toLowerCase()))
  const extra = hostQueries.find(query => query && !seen.has(query.toLowerCase()))
  return extra ? [...planned, extra] : planned
}
