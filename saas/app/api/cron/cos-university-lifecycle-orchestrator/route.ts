// saas/app/api/cron/cos-university-lifecycle-orchestrator/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  lifecycleDeadline,
  lifecyclePlan,
  shouldOrchestrate,
  stageChanged,
  type LifecycleArtifact,
} from '@/lib/ai/cos/cosUniversityLifecycleOrchestrator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ORCHESTRATED_STATUSES = ['evaluation_ready', 'evaluation_pending', 'quarantined', 'runtime_pending', 'active', 'retired']
const MAX_ARTIFACTS = 2500
const ACTION_TIMEOUT_MS = 45_000

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`)
}

function clean(value: unknown, max = 400): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

async function invokeWorker(req: NextRequest, path: string): Promise<{ ok: boolean; status: number; detail: string }> {
  const secret = process.env.CRON_SECRET
  if (!secret) return { ok: false, status: 500, detail: 'cron_secret_missing' }
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || req.nextUrl.host
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const url = `${protocol}://${host.replace(/^https?:\/\//, '')}${path}`
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${secret}`, 'x-cos-lifecycle-orchestrator': '1' },
      cache: 'no-store',
      signal: AbortSignal.timeout(ACTION_TIMEOUT_MS),
    })
    const body = clean(await response.text(), 600)
    return { ok: response.ok, status: response.status, detail: body }
  } catch (error) {
    const name = error instanceof Error ? error.name : 'unknown'
    // A timeout means the bounded trigger was delivered but the worker outlived this coordinator tick.
    // The worker's own durable authority/lease prevents duplicate consequential work; the next tick verifies movement.
    return { ok: name === 'TimeoutError' || name === 'AbortError', status: 202, detail: `worker_trigger_${name.toLowerCase()}` }
  }
}

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'service_database_unavailable' }, { status: 503 })

  const now = new Date()
  const source = await db.from('cos_local_distillation_artifacts')
    .select('candidate_id,subject_id,trained_artifact_hash,status,updated_at')
    .in('status', ORCHESTRATED_STATUSES)
    .order('updated_at', { ascending: true })
    .limit(MAX_ARTIFACTS)
  if (source.error) throw source.error

  const ids = (source.data || []).map((row: any) => String(row.candidate_id || '')).filter(Boolean)
  const existing = ids.length
    ? await db.from('cos_university_lifecycle_orchestration')
      .select('candidate_id,artifact_hash,stage,stage_entered_at,stage_deadline_at,last_action_at,orchestration_attempts,terminal')
      .in('candidate_id', ids)
    : { data: [], error: null }
  if (existing.error) throw existing.error
  const byId = new Map((existing.data || []).map((row: any) => [String(row.candidate_id), row]))

  let reconciled = 0
  let transitions = 0
  for (const raw of source.data || []) {
    const artifact: LifecycleArtifact = {
      candidateId: String(raw.candidate_id || ''),
      artifactHash: String(raw.trained_artifact_hash || ''),
      subjectId: String(raw.subject_id || ''),
      status: String(raw.status || ''),
      updatedAt: String(raw.updated_at || now.toISOString()),
    }
    if (!artifact.candidateId || !artifact.artifactHash) continue
    const plan = lifecyclePlan(artifact.status)
    if (!plan) continue
    const previous: any = byId.get(artifact.candidateId) || null
    const changed = stageChanged(previous, plan, artifact.artifactHash)
    const enteredAt = changed ? now : new Date(String(previous.stage_entered_at || now.toISOString()))
    const deadlineAt = plan.terminal ? now : lifecycleDeadline(enteredAt, plan)
    const row = {
      candidate_id: artifact.candidateId,
      artifact_hash: artifact.artifactHash,
      subject_id: artifact.subjectId || null,
      stage: plan.stage,
      source_status: artifact.status,
      stage_entered_at: enteredAt.toISOString(),
      stage_deadline_at: deadlineAt.toISOString(),
      last_observed_at: now.toISOString(),
      last_transition_at: changed ? now.toISOString() : String(previous.last_transition_at || enteredAt.toISOString()),
      orchestration_attempts: changed ? 0 : Number(previous.orchestration_attempts || 0),
      last_action_at: changed ? null : (previous.last_action_at || null),
      next_action: plan.nextAction,
      terminal: plan.terminal,
      last_error: changed ? null : undefined,
      updated_at: now.toISOString(),
    }
    const write = await db.from('cos_university_lifecycle_orchestration').upsert(row, { onConflict: 'candidate_id' })
    if (write.error) throw write.error
    reconciled += 1
    if (changed) transitions += 1
  }

  // Re-read after reconciliation. The oldest overdue obligation wins. This makes one controller own forward progress
  // without bypassing any worker's existing quality, spend, admission, or promotion authority.
  const due = await db.from('cos_university_lifecycle_orchestration')
    .select('candidate_id,artifact_hash,subject_id,stage,stage_deadline_at,last_action_at,orchestration_attempts,next_action,terminal')
    .eq('terminal', false)
    .lte('stage_deadline_at', now.toISOString())
    .order('stage_deadline_at', { ascending: true })
    .limit(25)
  if (due.error) throw due.error

  const selected = (due.data || []).find((row: any) => shouldOrchestrate({
    now,
    deadlineAt: String(row.stage_deadline_at),
    terminal: row.terminal === true,
    lastActionAt: row.last_action_at ? String(row.last_action_at) : null,
  })) || null

  let action: Record<string, unknown> = { dispatched: false, reason: 'no_overdue_lifecycle_obligation' }
  if (selected) {
    const plan = Object.values([
      lifecyclePlan('evaluation_ready'),
      lifecyclePlan('evaluation_pending'),
      lifecyclePlan('quarantined'),
      lifecyclePlan('runtime_pending'),
      lifecyclePlan('active'),
    ]).find(candidate => candidate?.stage === selected.stage) || null
    if (plan?.workerPath) {
      const claim = await db.from('cos_university_lifecycle_orchestration')
        .update({
          last_action_at: now.toISOString(),
          orchestration_attempts: Number(selected.orchestration_attempts || 0) + 1,
          updated_at: now.toISOString(),
        })
        .eq('candidate_id', selected.candidate_id)
        .eq('artifact_hash', selected.artifact_hash)
        .eq('stage', selected.stage)
        .eq('terminal', false)
        .select('candidate_id')
      if (claim.error) throw claim.error
      if ((claim.data || []).length === 1) {
        const result = await invokeWorker(req, plan.workerPath)
        if (!result.ok) {
          await db.from('cos_university_lifecycle_orchestration')
            .update({ last_error: clean(result.detail), updated_at: new Date().toISOString() })
            .eq('candidate_id', selected.candidate_id)
        }
        action = {
          dispatched: true,
          candidateId: selected.candidate_id,
          artifactHash: selected.artifact_hash,
          stage: selected.stage,
          nextAction: selected.next_action,
          workerPath: plan.workerPath,
          workerOk: result.ok,
          workerStatus: result.status,
          workerDetail: result.detail,
          authorityExpanded: false,
        }
      }
    }
  }

  const overdue = await db.from('cos_university_lifecycle_orchestration')
    .select('candidate_id,stage,stage_deadline_at,orchestration_attempts,next_action,last_error')
    .eq('terminal', false)
    .lte('stage_deadline_at', new Date().toISOString())
    .order('stage_deadline_at', { ascending: true })
    .limit(50)
  if (overdue.error) throw overdue.error

  return NextResponse.json({
    ok: true,
    schemaVersion: 'cos-university-lifecycle-orchestrator-v1',
    at: new Date().toISOString(),
    reconciled,
    transitions,
    overdue: overdue.data || [],
    action,
    invariant: 'every_nonterminal_artifact_has_a_named_next_action_and_deadline',
    automaticPromotionAuthorized: false,
    authorityExpanded: false,
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

export async function GET(req: NextRequest) {
  try { return await run(req) }
  catch (error) {
    const message = error instanceof Error ? clean(error.message) : clean(error)
    console.error('[cos-university-lifecycle-orchestrator]', JSON.stringify({ ok: false, error: message }))
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
export async function POST(req: NextRequest) { return GET(req) }
