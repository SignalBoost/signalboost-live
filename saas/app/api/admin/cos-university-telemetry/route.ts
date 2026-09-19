// saas/app/api/admin/cos-university-telemetry/route.ts
import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }
const RUNS = 'cos_university_mass_distillation_batch_runs'
const CAMPAIGNS = 'cos_university_mass_distillation_campaigns'
const TEACHERS = 'cos_university_mass_hosted_teacher_rows'
const PROVIDER_JOBS = 'cos_university_mass_distillation_provider_jobs'
const WINDOW_HOURS = 24

function n(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function text(value: unknown, max = 300): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function iso(value: unknown): string | null {
  const raw = text(value, 80)
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function providerName(row: any): string {
  const teacher = text(row?.teacher_id, 80).toLowerCase()
  if (teacher) return teacher
  const provider = text(row?.provider, 80).toLowerCase()
  if (provider === 'anthropic') return 'claude'
  if (provider === 'xai') return 'grok'
  return provider || 'unknown'
}

function stageBucket(stage: unknown): 'complete' | 'failed' | 'in_flight' {
  const value = text(stage, 80).toLowerCase()
  if (value === 'complete') return 'complete'
  if (value === 'failed') return 'failed'
  return 'in_flight'
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) {
    return NextResponse.json(
      { ok: false, error: guard.error, authRequired: true },
      { status: guard.status, headers: NO_STORE },
    )
  }

  try {
    const db = getAdminSupabase()
    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString()

    const [runsResult, campaignsResult] = await Promise.all([
      db.from(RUNS)
        .select('id,campaign_id,subject_id,stage,failure_reason,teacher_model_id,teacher_source_ref,teacher_output_hashes,preparation_job_id,preparation_job_url,training_job_id,training_job_url,trained_artifact_id,created_at,updated_at,completed_at')
        .order('updated_at', { ascending: false })
        .limit(40),
      db.from(CAMPAIGNS)
        .select('id,status,batch_count,max_total_cost_usd,committed_cost_usd,authorized_at,expires_at,completed_at,created_at,updated_at')
        .order('updated_at', { ascending: false })
        .limit(12),
    ])
    if (runsResult.error) throw runsResult.error
    if (campaignsResult.error) throw campaignsResult.error

    const runs = runsResult.data || []
    const runIds = runs.map((row: any) => text(row.id, 80)).filter(Boolean)

    const [runTeachersResult, recentTeachersResult, runJobsResult, recentJobsResult] = await Promise.all([
      runIds.length
        ? db.from(TEACHERS)
          .select('run_id,teacher_id,provider,model,input_tokens,output_tokens,created_at')
          .in('run_id', runIds)
          .order('created_at', { ascending: false })
          .limit(1500)
        : Promise.resolve({ data: [], error: null } as any),
      db.from(TEACHERS)
        .select('run_id,teacher_id,provider,model,input_tokens,output_tokens,created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5000),
      runIds.length
        ? db.from(PROVIDER_JOBS)
          .select('run_id,operation,job_id,job_url,provider_stage,observed_cost_usd,reserved_cost_usd,hourly_cost_usd,failure_reason,dispatched_at,settled_at,updated_at')
          .in('run_id', runIds)
          .order('updated_at', { ascending: false })
          .limit(1000)
        : Promise.resolve({ data: [], error: null } as any),
      db.from(PROVIDER_JOBS)
        .select('run_id,operation,provider_stage,observed_cost_usd,reserved_cost_usd,dispatched_at,settled_at')
        .gte('dispatched_at', since)
        .order('dispatched_at', { ascending: false })
        .limit(3000),
    ])
    for (const result of [runTeachersResult, recentTeachersResult, runJobsResult, recentJobsResult]) {
      if (result.error) throw result.error
    }

    const runTeachers = runTeachersResult.data || []
    const recentTeachers = recentTeachersResult.data || []
    const runJobs = runJobsResult.data || []
    const recentJobs = recentJobsResult.data || []

    const providers = new Map<string, {
      id: string
      provider: string
      model: string
      calls: number
      inputTokens: number
      outputTokens: number
      latestAt: string | null
    }>()
    for (const row of recentTeachers) {
      const id = providerName(row)
      const current = providers.get(id) || {
        id,
        provider: text(row.provider, 80),
        model: text(row.model, 240),
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        latestAt: null,
      }
      current.calls += 1
      current.inputTokens += n(row.input_tokens)
      current.outputTokens += n(row.output_tokens)
      const at = iso(row.created_at)
      if (at && (!current.latestAt || at > current.latestAt)) current.latestAt = at
      if (!current.model) current.model = text(row.model, 240)
      if (!current.provider) current.provider = text(row.provider, 80)
      providers.set(id, current)
    }

    const teachersByRun = new Map<string, any[]>()
    for (const row of runTeachers) {
      const runId = text(row.run_id, 80)
      if (!teachersByRun.has(runId)) teachersByRun.set(runId, [])
      teachersByRun.get(runId)!.push(row)
    }
    const jobsByRun = new Map<string, any[]>()
    for (const row of runJobs) {
      const runId = text(row.run_id, 80)
      if (!jobsByRun.has(runId)) jobsByRun.set(runId, [])
      jobsByRun.get(runId)!.push(row)
    }

    const campaigns = new Map((campaignsResult.data || []).map((row: any) => [text(row.id, 80), row]))
    const recentRuns = runs.map((run: any) => {
      const runId = text(run.id, 80)
      const teacherRows = teachersByRun.get(runId) || []
      const providerMix: Record<string, number> = {}
      for (const row of teacherRows) {
        const id = providerName(row)
        providerMix[id] = (providerMix[id] || 0) + 1
      }
      const jobs = jobsByRun.get(runId) || []
      const campaign = campaigns.get(text(run.campaign_id, 80)) as any
      const preparation = jobs.find((job: any) => text(job.operation, 60) === 'preparation') || null
      const training = jobs.find((job: any) => text(job.operation, 60) === 'training') || null
      return {
        runId,
        campaignId: text(run.campaign_id, 80),
        subject: text(run.subject_id, 240),
        stage: text(run.stage, 80),
        stageBucket: stageBucket(run.stage),
        failureReason: text(run.failure_reason, 300) || null,
        teacherOutputs: teacherRows.length || (Array.isArray(run.teacher_output_hashes) ? run.teacher_output_hashes.length : 0),
        providerMix,
        teacherModelId: text(run.teacher_model_id, 240) || null,
        preparation: preparation ? {
          jobId: text(preparation.job_id, 240),
          jobUrl: text(preparation.job_url, 1000) || null,
          stage: text(preparation.provider_stage, 80),
          observedCostUsd: n(preparation.observed_cost_usd),
        } : run.preparation_job_id ? {
          jobId: text(run.preparation_job_id, 240),
          jobUrl: text(run.preparation_job_url, 1000) || null,
          stage: null,
          observedCostUsd: 0,
        } : null,
        training: training ? {
          jobId: text(training.job_id, 240),
          jobUrl: text(training.job_url, 1000) || null,
          stage: text(training.provider_stage, 80),
          observedCostUsd: n(training.observed_cost_usd),
        } : run.training_job_id ? {
          jobId: text(run.training_job_id, 240),
          jobUrl: text(run.training_job_url, 1000) || null,
          stage: null,
          observedCostUsd: 0,
        } : null,
        trainedArtifactId: text(run.trained_artifact_id, 240) || null,
        campaignStatus: campaign ? text(campaign.status, 80) : null,
        campaignCommittedCostUsd: campaign ? n(campaign.committed_cost_usd) : 0,
        campaignMaxCostUsd: campaign ? n(campaign.max_total_cost_usd) : 0,
        createdAt: iso(run.created_at),
        updatedAt: iso(run.updated_at),
        completedAt: iso(run.completed_at),
      }
    })

    const recentRunRows = runs.filter((row: any) => {
      const at = Date.parse(text(row.updated_at, 80))
      return Number.isFinite(at) && at >= Date.parse(since)
    })
    const buckets = recentRunRows.reduce((acc: Record<string, number>, row: any) => {
      const bucket = stageBucket(row.stage)
      acc[bucket] = (acc[bucket] || 0) + 1
      return acc
    }, {})

    const hfObservedCostUsd24h = recentJobs.reduce(
      (total: number, job: any) => total + n(job.observed_cost_usd),
      0,
    )

    return NextResponse.json({
      ok: true,
      readOnly: true,
      generatedAt: new Date().toISOString(),
      windowHours: WINDOW_HOURS,
      summary: {
        teacherOutputs24h: recentTeachers.length,
        completedRuns24h: buckets.complete || 0,
        failedRuns24h: buckets.failed || 0,
        inFlightRuns24h: buckets.in_flight || 0,
        hfObservedCostUsd24h: Number(hfObservedCostUsd24h.toFixed(6)),
      },
      providers: Array.from(providers.values())
        .sort((a, b) => b.calls - a.calls || a.id.localeCompare(b.id)),
      runs: recentRuns,
      campaigns: (campaignsResult.data || []).map((campaign: any) => ({
        id: text(campaign.id, 80),
        status: text(campaign.status, 80),
        batchCount: n(campaign.batch_count),
        committedCostUsd: n(campaign.committed_cost_usd),
        maxTotalCostUsd: n(campaign.max_total_cost_usd),
        authorizedAt: iso(campaign.authorized_at),
        expiresAt: iso(campaign.expires_at),
        completedAt: iso(campaign.completed_at),
        updatedAt: iso(campaign.updated_at),
      })),
    }, { headers: NO_STORE })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: NO_STORE },
    )
  }
}
