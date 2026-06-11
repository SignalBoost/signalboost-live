// saas/lib/ai/tools/getAffiliateCount.ts
// Live affiliate/partner count for the AI personas.
// Queries the MARKETING-site Supabase project (separate from the SaaS project).
// The affiliate catalog lives in the `affiliate_partners` table (140+ rows);
// the older `partners` table exists but is empty.
//
// Required env vars (Vercel > signalboost-live > Settings > Environment Variables):
//   MARKETING_SUPABASE_URL                e.g. https://vdtxulrusfvyxdtatryx.supabase.co
//   MARKETING_SUPABASE_SERVICE_ROLE_KEY   secret key of the marketing project

import { createClient } from '@supabase/supabase-js'

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

function marketingSupabase() {
  const url = process.env.MARKETING_SUPABASE_URL
  const key = process.env.MARKETING_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url.replace(/\/rest\/v1\/?$/, ''), key)
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
      .from(AFFILIATES_TABLE)
      .select('*', { count: 'exact', head: true })

    if (countError) {
      return { ok: false, error: `Affiliate count query failed: ${countError.message}` }
    }

    // ── Category breakdown from the "category" column (confirmed in schema);
    //    degrades gracefully if the query fails ─────────────────────────────
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

  return `LIVE AFFILIATE COUNT (source: marketing Supabase "${AFFILIATES_TABLE}" table, as of ${new Date(metrics.generatedAt).toUTCString()}):

Total affiliates: ${metrics.totalAffiliates}
${categoryLines ? `\nBy category:\n${categoryLines}` : ''}
This number is live and authoritative — use it instead of any figure from memory.`
}
