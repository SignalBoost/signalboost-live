// saas/lib/ai/tools/getAffiliateCount.ts
// Live affiliate/partner count for the AI personas.
//
// PORTABLE: the affiliate catalog is reached through an INJECTED store. The
// default adapter queries a SECOND Supabase project (separate from the SaaS
// project) — unchanged behavior for this deployment. A buyer of the
// Chief-of-Staff portable calls setAffiliateStore(...) once to point this at
// their own partner catalog.
//
// Default-adapter env vars (Vercel > signalboost-live > Settings > Environment Variables):
//   SECONDARY_SUPABASE_URL                 e.g. https://<ref>.supabase.co
//   SECONDARY_SUPABASE_SERVICE_ROLE_KEY    the project's service_role (secret) key
// Backward compatible: the older MARKETING_SUPABASE_URL / _SERVICE_ROLE_KEY names
// are still honoured as a fallback so existing installs keep working.

const AFFILIATES_TABLE = 'affiliate_partners'

export type AffiliateMetrics = {
  totalAffiliates: number
  byCategory: Record<string, number>
  generatedAt: string
}

export type AffiliateResult = {
  ok: boolean
  metrics?: AffiliateMetrics
  error?: string
}

export interface AffiliateStore {
  // Total number of affiliates/partners. Throws if the source is unavailable.
  count(): Promise<number>
  // Best-effort category breakdown; may return {} when unavailable.
  categoryCounts(): Promise<Record<string, number>>
}

// ── Default adapter: the marketing (secondary) Supabase (unchanged behavior) ──
let store: AffiliateStore | null = null

async function marketingSupabase() {
  const url = process.env.SECONDARY_SUPABASE_URL || process.env.MARKETING_SUPABASE_URL
  const key = process.env.SECONDARY_SUPABASE_SERVICE_ROLE_KEY || process.env.MARKETING_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(url.replace(/\/rest\/v1\/?$/, ''), key)
}

function defaultStore(): AffiliateStore {
  return {
    async count() {
      const db = await marketingSupabase()
      if (!db) {
        throw new Error('Secondary Supabase is not configured (SECONDARY_SUPABASE_URL / SECONDARY_SUPABASE_SERVICE_ROLE_KEY missing).')
      }
      // Cheap head request, no rows transferred.
      const { count, error } = await db
        .from(AFFILIATES_TABLE)
        .select('*', { count: 'exact', head: true })
      if (error) throw new Error(`Affiliate count query failed: ${error.message}`)
      return count ?? 0
    },
    async categoryCounts() {
      const db = await marketingSupabase()
      if (!db) return {}
      const byCategory: Record<string, number> = {}
      try {
        const { data: rows, error: catError } = await db
          .from(AFFILIATES_TABLE)
          .select('category')
          .limit(2000)
        if (!catError && Array.isArray(rows)) {
          for (const row of rows) {
            const value = String((row as unknown as Record<string, unknown>).category ?? 'uncategorized')
              .trim()
              .toLowerCase() || 'uncategorized'
            byCategory[value] = (byCategory[value] ?? 0) + 1
          }
        }
      } catch {
        // breakdown is optional — the total count is the authoritative number
      }
      return byCategory
    },
  }
}

export function setAffiliateStore(s: AffiliateStore): void { store = s }
export function getAffiliateStore(): AffiliateStore { return store ?? defaultStore() }

export async function getAffiliateCount(): Promise<AffiliateResult> {
  try {
    const s = getAffiliateStore()
    const totalAffiliates = await s.count()
    const byCategory = await s.categoryCounts()
    return {
      ok: true,
      metrics: {
        totalAffiliates,
        byCategory,
        generatedAt: new Date().toISOString(),
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error fetching affiliate count',
    }
  }
}

// Format for injection into the AI conversation as a tool result.
export function formatAffiliatesForAI(metrics: AffiliateMetrics): string {
  const categoryLines = Object.entries(metrics.byCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, n]) => ` - ${cat}: ${n}`)
    .join('\n')

  return `LIVE AFFILIATE COUNT (source: affiliate catalog "${AFFILIATES_TABLE}", as of ${new Date(metrics.generatedAt).toUTCString()}):

Total affiliates: ${metrics.totalAffiliates}
${categoryLines ? `\nBy category:\n${categoryLines}` : ''}
This number is live and authoritative — use it instead of any figure from memory.`
}
