import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { drainGraduateServingEvidence } from '@/lib/ai/cos/graduateServingAttempts'
import { runWorkforceApprenticeShadow } from '@/lib/ai/cos/cosReasoningWorkers'

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

  // Recovery must do work, not merely report it. Reuse recent genuine Production user demand as
  // advisory shadow work; the normal Workforce selector still enforces diploma, roster, role and
  // problem-scope gates. Replays never replace a user-visible answer or expand authority.
  const recoveryTargets = stranded.length + failing.length
  let recoveryAttempts = 0
  if (recoveryTargets > 0) {
    const demand = await db.from('assistant_messages')
      .select('id,content,created_at')
      .eq('role', 'user')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(24)
    if (!demand.error) {
      for (const row of demand.data || []) {
        if (recoveryAttempts >= Math.min(3, recoveryTargets)) break
        const objective = String(row.content || '').trim()
        if (!objective) continue
        await runWorkforceApprenticeShadow({
          prompt: objective,
          maxTokens: 512,
          timeoutMs: 45_000,
          usageContext: { feature: 'cos_workforce_recovery', purpose: 'genuine_production_replay', correlationId: `workforce-recovery:${row.id}` },
        }, objective)
        recoveryAttempts += 1
      }
    } else {
      console.warn('[cos-workforce] recovery demand read failed closed', demand.error)
    }
  }
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
      recoveryAttempts,
      strandedWorkers: stranded.map(row => ({ registryId: row.registry_id, aiId: row.ai_id, subjectId: row.subject_id })),
      repeatedlyFailingWorkers: failing.map(row => ({ registryId: row.registry_id, aiId: row.ai_id, subjectId: row.subject_id })),
      authorityExpanded: false,
    },
  })
}

export async function GET(req: NextRequest) { return run(req) }
export async function POST(req: NextRequest) { return run(req) }
