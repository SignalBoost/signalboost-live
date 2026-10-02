import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { drainGraduateServingEvidence } from '@/lib/ai/cos/graduateServingAttempts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`)
}

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'cos_service_db_unavailable' }, { status: 503 })

  const evidence = await drainGraduateServingEvidence(200)
  const pipeline = await db.from('cos_workforce_post_graduation_pipeline')
    .select('registry_id,ai_id,subject_id,graduated_at,activated_at,hired_at,workforce_status,first_attempt_at,last_attempt_at,serving_attempts,successful_attempts,failed_attempts,fallback_attempts,verified_outcomes,remediation_events,pipeline_stage')
    .eq('workforce_status', 'on_call')
    .order('graduated_at', { ascending: true })
    .limit(100)
  if (pipeline.error) throw pipeline.error

  const now = Date.now()
  const workers = (pipeline.data || []).map(row => {
    const anchor = Date.parse(String(row.hired_at || row.activated_at || row.graduated_at || ''))
    const idleHours = Number.isFinite(anchor) && !row.first_attempt_at ? (now - anchor) / 3_600_000 : 0
    const repeatedFailure = Number(row.successful_attempts || 0) === 0
      && (Number(row.failed_attempts || 0) >= 3 || Number(row.fallback_attempts || 0) >= 3)
    return { ...row, stranded: idleHours >= 6, repeatedFailure }
  })

  const stranded = workers.filter(row => row.stranded)
  const failing = workers.filter(row => row.repeatedFailure)
  return NextResponse.json({
    ok: evidence.blocked === 0,
    at: new Date().toISOString(),
    workforce: workers.length,
    stages: workers.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.pipeline_stage || 'unknown')
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {}),
    selfHealing: {
      evidenceDelivered: evidence.delivered,
      evidenceBlocked: evidence.blocked,
      strandedWorkers: stranded.map(row => ({ registryId: row.registry_id, aiId: row.ai_id, subjectId: row.subject_id })),
      repeatedlyFailingWorkers: failing.map(row => ({ registryId: row.registry_id, aiId: row.ai_id, subjectId: row.subject_id })),
      authorityExpanded: false,
    },
  })
}

export async function GET(req: NextRequest) { return run(req) }
export async function POST(req: NextRequest) { return run(req) }
