// saas/lib/ai/tools/getAffiliateCount.ts
// Live affiliate/partner count for the AI personas.
// Queries the MARKETING-site Supabase project (separate from the SaaS project),
// where the `partners` table lives.
//
// Required env vars (Vercel > signalboost-live > Settings > Environment Variables):
//   MARKETING_SUPABASE_URL                e.g. https://vdtxulrusfvyxdtatryx.supabase.co
//   MARKETING_SUPABASE_SERVICE_ROLE_KEY   service/secret key of the marketing project

import { createClient } from '@supabase/supabase-js'

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

function marketingSupabase() {
  const url = process.env.MARKETING_SUPABASE_URL
  const key = process.env.MARKETING_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function getAffiliateCount(): Promise<AffiliateResult> {
  try {
    const db = marketingSupabase()
    if (!db) {
      return {
        ok: false,
        error: 'Marketing Supabase is not configured (MARKETING_SUPABASE_URL / MARKETING_SUPABASE_SERVICE_ROLE_KEY missing).',
      }
    }

    // ── Total count (cheap head request, no rows transferred) ─────────────
    const { count, error: countError } = await db
      .from('partners')
      .select('id', { count: 'exact', head: true })

    if (countError) {
      return { ok: false, error: `Partners count query failed: ${countError.message}` }
    }

    // ── Optional category breakdown — degrades gracefully if the column
    //    does not exist or the query fails ─────────────────────────────────
    const byCategory: Record<string, number> = {}
    try {
      const { data: rows, error: catError } = await db
        .from('partners')
        .select('category')
        .limit(2000)

      if (!catError && Array.isArray(rows)) {
        for (const row of rows) {
          const key = String((row as { category?: unknown }).category || 'uncategorized')
            .trim()
            .toLowerCase() || 'uncategorized'
          byCategory[key] = (byCategory[key] ?? 0) + 1
        }
      }
    } catch {
      // breakdown is optional — total count above is the authoritative number
    }

    return {
      ok: true,
      metrics: {
        totalAffiliates: count ?? 0,
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

  return `LIVE AFFILIATE COUNT (source: marketing Supabase "partners" table, as of ${new Date(metrics.generatedAt).toUTCString()}):

Total affiliates: ${metrics.totalAffiliates}
${categoryLines ? `\nBy category:\n${categoryLines}` : ''}
This number is live and authoritative — use it instead of any figure from memory.`
}
