// saas/app/api/admin/partner-performance/route.ts
// Live partner-performance feed for the admin Partners console.
//
// Source of truth is the SECOND (marketing) Supabase project — the same
// `affiliate_partners` catalog (140+ rows) that getAffiliateCount reads, NOT the
// SaaS project. The Partners page previously rendered a single hard-coded
// empty-state row with no data source, so the table could never populate. This
// route turns it into a live panel; when the catalog is unreachable or empty the
// page keeps its honest localized empty-state.
//
// Required env vars (Vercel > signalboost-live > Settings > Environment Variables):
//   SECONDARY_SUPABASE_URL                 e.g. https://<ref>.supabase.co
//   SECONDARY_SUPABASE_SERVICE_ROLE_KEY    the project's service_role (secret) key
//   (legacy MARKETING_SUPABASE_URL / _SERVICE_ROLE_KEY are honoured as fallback)

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

const AFFILIATES_TABLE = 'affiliate_partners'
const MAX_ROWS = 100

export type PartnerRow = {
  intent: string
  partner: string
  clicks: number | null
  status: string
}

function marketingSupabase() {
  const url = process.env.SECONDARY_SUPABASE_URL || process.env.MARKETING_SUPABASE_URL
  const key =
    process.env.SECONDARY_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.MARKETING_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url.replace(/\/rest\/v1\/?$/, ''), key)
}

// Pick the first present, non-empty string field from a row across a list of
// likely column names — the marketing schema isn't owned by this app, so we read
// defensively rather than assuming exact column names.
function pickString(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return ''
}

function pickNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() && !isNaN(Number(v))) return Number(v)
  }
  return null
}

function deriveStatus(row: Record<string, unknown>): string {
  const raw = pickString(row, ['status', 'state'])
  if (raw) return raw.charAt(0).toUpperCase() + raw.slice(1)
  // Boolean-style activity flags.
  for (const k of ['active', 'is_active', 'enabled']) {
    const v = row[k]
    if (typeof v === 'boolean') return v ? 'Active' : 'Paused'
  }
  // A catalog row with no explicit flag is a listed, live partner.
  return 'Active'
}

function titleCase(s: string): string {
  if (!s) return ''
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const db = marketingSupabase()
  if (!db) {
    // Not configured -> let the UI fall back to its honest empty-state.
    return NextResponse.json({ ok: true, rows: [], total: 0, configured: false })
  }

  try {
    const { count } = await db
      .from(AFFILIATES_TABLE)
      .select('*', { count: 'exact', head: true })

    const { data, error } = await db
      .from(AFFILIATES_TABLE)
      .select('*')
      .limit(MAX_ROWS)

    if (error || !Array.isArray(data)) {
      return NextResponse.json({ ok: true, rows: [], total: 0, configured: true })
    }

    const rows: PartnerRow[] = data.map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>
      const category = pickString(row, ['category', 'intent', 'type', 'vertical']) || 'uncategorized'
      const partner =
        pickString(row, ['name', 'partner_name', 'title', 'business_name', 'brand', 'company', 'display_name']) ||
        '—'
      return {
        intent: titleCase(category),
        partner,
        clicks: pickNumber(row, ['clicks', 'click_count', 'total_clicks', 'clicks_total']),
        status: deriveStatus(row),
      }
    })

    // Most-clicked first when click data exists; otherwise stable by intent+name.
    rows.sort((a, b) => {
      if (a.clicks != null && b.clicks != null && a.clicks !== b.clicks) return b.clicks - a.clicks
      if (a.intent !== b.intent) return a.intent.localeCompare(b.intent)
      return a.partner.localeCompare(b.partner)
    })

    return NextResponse.json({ ok: true, rows, total: count ?? rows.length, configured: true })
  } catch {
    // Any failure degrades to the empty-state; never a 500 for a read-only panel.
    return NextResponse.json({ ok: true, rows: [], total: 0, configured: true })
  }
}
