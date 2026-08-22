import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { buildRemediationMemoryReport } from '@/lib/supervisor/remediation-memory-report'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })
  const result = await db.from('cos_remediation_memory').select('incident_key,remedy_id,verified_successes,verified_failures,consecutive_failures,recommendation_eligible,updated_at').order('recommendation_eligible', { ascending: false }).order('updated_at', { ascending: false }).limit(500)
  if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 500 })
  const report = buildRemediationMemoryReport((result.data ?? []).map(row => ({ incidentKey: String(row.incident_key), remedyId: String(row.remedy_id), verifiedSuccesses: Number(row.verified_successes), verifiedFailures: Number(row.verified_failures), consecutiveFailures: Number(row.consecutive_failures), recommendationEligible: Boolean(row.recommendation_eligible), updatedAt: Date.parse(String(row.updated_at)) })))
  return NextResponse.json({ ok: true, report })
}
