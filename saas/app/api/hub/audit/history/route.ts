// saas/app/api/hub/audit/history/route.ts
// Readiness run history — owner-gated.
//   GET  → recent snapshots (oldest-first, for trend charting)
//   POST → take a fresh readiness snapshot and persist it

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { createClient } from '@supabase/supabase-js'
import { collectSnapshot } from '@/lib/audit/collectors'
import { buildExecutiveSummary } from '@/lib/audit/execSummary'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const LIMIT = 60

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  // Untyped: audit_readiness_runs isn't in the generated Database types.
  return createClient(url, key, { auth: { persistSession: false } }) as any
}

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  try {
    const client = db()
    if (!client) return NextResponse.json({ ok: true, runs: [] })
    const { data, error } = await client
      .from('audit_readiness_runs')
      .select('id,score,critical,high,medium,low,info,evidence_required,total,created_at')
      .order('created_at', { ascending: true })
      .limit(LIMIT)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, runs: data || [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load history.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  const userId = (guard as any).ctx?.userId ?? (guard as any).ctx?.user?.id ?? null
  try {
    const snapshot = await collectSnapshot()
    const summary = buildExecutiveSummary(snapshot)
    const s = summary.score
    const client = db()
    if (!client) return NextResponse.json({ ok: false, error: 'Storage not configured.' }, { status: 500 })
    const { data, error } = await client
      .from('audit_readiness_runs')
      .insert({
        score: s.score, critical: s.critical, high: s.high, medium: s.medium,
        low: s.low, info: s.info, evidence_required: s.evidenceRequired, total: s.total,
        run_by: userId,
      })
      .select('id,score,critical,high,medium,low,info,evidence_required,total,created_at')
      .single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, run: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to take snapshot.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
