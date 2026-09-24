// saas/app/api/admin/cos-university-telemetry/route.ts
import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { universityTeacherPoolStatus } from '@/lib/ai/cos/cosUniversityTeacherPool'
import { selectWorkingCosBalancedBundleFromVault } from '@/lib/ai/cos/cosWorkingDistillationBundle'
import { configuredRunpodPodId } from '@/lib/ai/cos/runpodConfig'
import { runpodPrimaryConfig, runpodPrimaryEnabled, runpodPrimaryModel } from '@/lib/ai/cos/runpodPrimaryInference'
import { queryWorkingCosRuntimeIdentity, workingCosRuntimeBindingFromEnv } from '@/lib/ai/cos/cosWorkingRuntimeBinding'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }
const RUNS = 'cos_university_mass_distillation_batch_runs'
const CAMPAIGNS = 'cos_university_mass_distillation_campaigns'
const TEACHERS = 'cos_university_mass_hosted_teacher_rows'
const PROVIDER_JOBS = 'cos_university_mass_distillation_provider_jobs'
const ARTIFACTS = 'cos_local_distillation_artifacts'
const EVALUATIONS = 'cos_university_distilled_evaluation_runs'
const GRADUATES = 'cos_university_graduate_model_registry'
const LEARNING = 'cos_continuous_learning'
const WINDOW_HOURS = 24
const TELEMETRY_PAGE_SIZE = 1000
const MAX_TELEMETRY_PAGES = 100

async function collectPages<T>(load: (from: number, to: number) => any): Promise<T[]> {
  const rows: T[] = []
  for (let page = 0; page < MAX_TELEMETRY_PAGES; page += 1) {
    const from = page * TELEMETRY_PAGE_SIZE
    const result = await load(from, from + TELEMETRY_PAGE_SIZE - 1)
    if (result.error) throw result.error
    const batch = (result.data || []) as T[]
    rows.push(...batch)
    if (batch.length < TELEMETRY_PAGE_SIZE) return rows
  }
  throw new Error('university_telemetry_window_exceeds_safe_pagination_limit')
}

const OPEN_SOURCE_CATALOG = Object.freeze([
  { id: 'openalex', name: 'OpenAlex', integration: 'implemented', vectorSpace: 'openalex_gte_large_en_v1', mode: 'remote_semantic_index' },
  { id: 'semantic_scholar', name: 'Semantic Scholar / S2ORC', integration: 'implemented', vectorSpace: 'semantic_scholar_specter2_proximity_v2', mode: 'precomputed_document_vector' },
  { id: 'huggingface_open_datasets', name: 'Hugging Face open datasets', integration: 'implemented', vectorSpace: null, mode: 'allowlisted_cc0_corpora_source_vectors_plus_internal_reembedding' },
  { id: 'wikimedia', name: 'Wikipedia / Wikimedia', integration: 'implemented', vectorSpace: null, mode: 'open_reference_corpus' },
] as const)

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
  const provider = text(row?.provider, 80).toLowerCase()
  if (teacher) {
    // Avoid redundant UI names such as "deepseek-api" when the declared provider is "deepseek".
    // This affects telemetry identity only; provider routing continues to use the exact teacher id.
    if (teacher.endsWith('-api') && provider === teacher.slice(0, -4)) return provider
    return teacher
  }
  if (provider === 'anthropic') return 'claude'
  if (provider === 'xai') return 'grok'
  return provider || 'unknown'
}

function configuredTeacherModel(row: any): string {
  const modelEnv = text(row?.modelEnv, 120)
  if (modelEnv) return text(process.env[modelEnv], 240)
  const model = text(row?.model, 240)
  return model === 'buyer-configured' ? '' : model
}

function stageBucket(stage: unknown): 'complete' | 'failed' | 'in_flight' {
  const value = text(stage, 80).toLowerCase()
  if (value === 'complete') return 'complete'
  if (value === 'failed') return 'failed'
  return 'in_flight'
}

function openSourceId(row: any): string | null {
  const evidence = Array.isArray(row?.evidence)
    ? row.evidence.map((value: unknown) => text(value, 1000)).join(' ')
    : text(row?.evidence, 3000)
  const haystack = [
    text(row?.source_kind, 120),
    text(row?.source_uri, 1200),
    text(row?.license, 1200),
    evidence,
  ].join(' ').toLowerCase()

  if (haystack.includes('openalex_gte_large_en_v1') || haystack.includes('openalex')) return 'openalex'
  if (haystack.includes('semantic_scholar_specter2_proximity_v2')
    || haystack.includes('semantic scholar')
    || haystack.includes('semanticscholar.org')) return 'semantic_scholar'
  if (haystack.includes('huggingface.co/datasets')
    || haystack.includes('hf://datasets/')
    || haystack.includes('huggingface_dataset:')
    || haystack.includes('hugging face open dataset')
    || haystack.includes('huggingface dataset')) return 'huggingface_open_datasets'
  if (haystack.includes('wikipedia.org')
    || haystack.includes('wikimedia.org')
    || haystack.includes('wikipedia / wikimedia')) return 'wikimedia'
  return null
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

    const [
      runsResult,
      totalRunCountResult,
      completedRunCountResult,
      failedRunCountResult,
      campaignsResult,
      artifactsResult,
      evaluationsResult,
      graduatesResult,
      openLearningRows,
      workingCosBundle,
    ] = await Promise.all([
      db.from(RUNS)
        .select('id,campaign_id,subject_id,stage,failure_reason,teacher_model_id,teacher_source_ref,teacher_output_hashes,preparation_job_id,preparation_job_url,training_job_id,training_job_url,trained_artifact_id,created_at,updated_at,completed_at')
        .order('updated_at', { ascending: false })
        .limit(40),
      db.from(RUNS)
        .select('id', { count: 'exact', head: true })
        .gte('updated_at', since),
      db.from(RUNS)
        .select('id', { count: 'exact', head: true })
        .gte('updated_at', since)
        .eq('stage', 'complete'),
      db.from(RUNS)
        .select('id', { count: 'exact', head: true })
        .gte('updated_at', since)
        .eq('stage', 'failed'),
      db.from(CAMPAIGNS)
        .select('id,status,batch_count,max_total_cost_usd,committed_cost_usd,authorized_at,expires_at,completed_at,created_at,updated_at')
        .order('updated_at', { ascending: false })
        .limit(12),
      db.from(ARTIFACTS)
        .select('candidate_id,subject_id,status,trained_artifact_id,trained_artifact_hash,revision_key,created_at,updated_at')
        .order('updated_at', { ascending: false })
        .limit(100),
      db.from(EVALUATIONS)
        .select('candidate_id,trained_artifact_hash,artifact_age_seconds,baseline_score,trained_artifact_score,holdout_improved,safety_passed,unseen_transfer_passed,delayed_retention_passed,created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      db.from(GRADUATES)
        .select('candidate_id,trained_artifact_hash,status,runtime_provider,runtime_model_id,promoted_at,activated_at,updated_at')
        .order('updated_at', { ascending: false })
        .limit(100),
      collectPages<any>((from, to) => db.from(LEARNING)
        .select('content_hash,source_kind,source_uri,license,evidence,embedding_model,observed_at')
        .gte('observed_at', since)
        .order('observed_at', { ascending: false })
        .range(from, to)),
      selectWorkingCosBalancedBundleFromVault({}, db),
    ])
    for (const result of [
      runsResult,
      totalRunCountResult,
      completedRunCountResult,
      failedRunCountResult,
      campaignsResult,
      artifactsResult,
      evaluationsResult,
      graduatesResult,
    ]) {
      if (result.error) throw result.error
    }

    const openSources = new Map<string, {
      id: string
      name: string
      integration: 'implemented' | 'candidate'
      vectorSpace: string | null
      mode: string
      items24h: number
      embedded24h: number
      latestAt: string | null
    }>()
    for (const source of OPEN_SOURCE_CATALOG) {
      openSources.set(source.id, {
        id: source.id,
        name: source.name,
        integration: source.integration,
        vectorSpace: source.vectorSpace,
        mode: source.mode,
        items24h: 0,
        embedded24h: 0,
        latestAt: null,
      })
    }
    for (const row of openLearningRows) {
      const id = openSourceId(row)
      if (!id) continue
      const current = openSources.get(id)
      if (!current) continue
      current.items24h += 1
      if (text(row.embedding_model, 240)) current.embedded24h += 1
      const at = iso(row.observed_at)
      if (at && (!current.latestAt || at > current.latestAt)) current.latestAt = at
    }

    const runs = runsResult.data || []
    const runIds = runs.map((row: any) => text(row.id, 80)).filter(Boolean)

    const [runTeachersResult, runJobsResult, recentTeachers, recentJobs] = await Promise.all([
      runIds.length
        ? db.from(TEACHERS)
          .select('run_id,teacher_id,provider,model,input_tokens,output_tokens,created_at')
          .in('run_id', runIds)
          .order('created_at', { ascending: false })
          .limit(1500)
        : Promise.resolve({ data: [], error: null } as any),
      runIds.length
        ? db.from(PROVIDER_JOBS)
          .select('run_id,operation,job_id,job_url,provider_stage,observed_cost_usd,reserved_cost_usd,hourly_cost_usd,failure_reason,dispatched_at,settled_at,updated_at')
          .in('run_id', runIds)
          .order('updated_at', { ascending: false })
          .limit(1000)
        : Promise.resolve({ data: [], error: null } as any),
      collectPages<any>((from, to) => db.from(TEACHERS)
        .select('run_id,teacher_id,provider,model,input_tokens,output_tokens,created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .range(from, to)),
      collectPages<any>((from, to) => db.from(PROVIDER_JOBS)
        .select('run_id,operation,provider_stage,observed_cost_usd,reserved_cost_usd,dispatched_at,settled_at')
        .gte('dispatched_at', since)
        .order('dispatched_at', { ascending: false })
        .range(from, to)),
    ])
    for (const result of [runTeachersResult, runJobsResult]) {
      if (result.error) throw result.error
    }

    const runTeachers = runTeachersResult.data || []
    const runJobs = runJobsResult.data || []

    const providers = new Map<string, {
      id: string
      provider: string
      model: string
      calls: number
      inputTokens: number
      outputTokens: number
      latestAt: string | null
    }>()

    // Seed every currently active hosted mass-distillation teacher before applying the 24-hour
    // observations. A newly enabled provider therefore appears immediately with zero calls instead
    // of being invisible until its first successful teacher row is persisted.
    const teacherPool = universityTeacherPoolStatus(process.env)
    for (const teacher of teacherPool.activeProviders) {
      if (teacher.transport === 'huggingface_job' || teacher.massDistillationEligible !== true) continue
      const id = providerName({ teacher_id: teacher.id, provider: teacher.provider })
      providers.set(id, {
        id,
        provider: text(teacher.provider, 80),
        model: configuredTeacherModel(teacher),
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        latestAt: null,
      })
    }

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

    const totalRuns24h = n(totalRunCountResult.count)
    const completedRuns24h = n(completedRunCountResult.count)
    const failedRuns24h = n(failedRunCountResult.count)
    const inFlightRuns24h = Math.max(0, totalRuns24h - completedRuns24h - failedRuns24h)

    const artifactCandidates = (artifactsResult.data || []).map((row: any) => text(row.candidate_id, 240)).filter(Boolean)
    const assuranceResult = artifactCandidates.length
      ? await db.from('cos_university_learning_assurance_events')
        .select('candidate_id,observed_at,expires_at,verifier,evidence')
        .eq('event_type', 'fine_tune')
        .in('candidate_id', artifactCandidates)
        .order('observed_at', { ascending: false })
        .limit(5000)
      : { data: [], error: null } as any
    if (assuranceResult.error) throw assuranceResult.error
    const assuranceByCandidate = new Map<string, any[]>()
    for (const row of assuranceResult.data || []) {
      const candidateId = text(row.candidate_id, 240)
      if (!assuranceByCandidate.has(candidateId)) assuranceByCandidate.set(candidateId, [])
      assuranceByCandidate.get(candidateId)!.push(row)
    }

    const latestEvaluationByArtifact = new Map<string, any>()
    for (const row of evaluationsResult.data || []) {
      const key = text(row.candidate_id, 240) + ':' + text(row.trained_artifact_hash, 80)
      if (!latestEvaluationByArtifact.has(key)) latestEvaluationByArtifact.set(key, row)
    }
    const graduateByArtifact = new Map<string, any>()
    for (const row of graduatesResult.data || []) {
      const key = text(row.candidate_id, 240) + ':' + text(row.trained_artifact_hash, 80)
      if (!graduateByArtifact.has(key)) graduateByArtifact.set(key, row)
    }
    const artifacts = (artifactsResult.data || []).map((artifact: any) => {
      const candidateId = text(artifact.candidate_id, 240)
      const artifactHash = text(artifact.trained_artifact_hash, 80)
      const evaluation = latestEvaluationByArtifact.get(candidateId + ':' + artifactHash) || null
      const graduate = graduateByArtifact.get(candidateId + ':' + artifactHash) || null
      const createdAt = iso(artifact.created_at)
      const events = assuranceByCandidate.get(candidateId) || []
      const nowMs = Date.now()
      const eligibleAtMs = createdAt ? Date.parse(createdAt) + 12 * 60 * 60 * 1000 : Number.POSITIVE_INFINITY
      const approval = events.find((row: any) => row.verifier === 'host_controller'
        && row.evidence?.profile === 'cos_distilled_independent_evaluation_authorization_v1'
        && row.evidence?.artifactHash === artifactHash
        && ['distilled_independent_evaluation_approved', 'distilled_independent_evaluation_suspended'].includes(row.evidence?.claim))
      const canary = events.find((row: any) => row.verifier === 'host_production_verifier'
        && row.evidence?.profile === 'cos_university_fine_tune_evidence_v1'
        && row.evidence?.claim === 'production_canary_healthy'
        && row.evidence?.artifactHash === artifactHash
        && row.evidence?.trainedArtifactId === artifact.trained_artifact_id
        && row.evidence?.revisionKey === artifact.revision_key
        && row.evidence?.exactArtifact === true
        && row.evidence?.internalVllmReady === true
        && row.evidence?.productionTrafficAuthorized === false
        && row.evidence?.authorityExpanded === false
        && text(row.evidence?.endpointId, 120))
      const started = events.find((row: any) => row.evidence?.profile === 'cos_mass_distilled_independent_evaluation_runtime_v1'
        && row.evidence?.claim === 'mass_distilled_independent_evaluation_started'
        && row.evidence?.artifactHash === artifactHash)
      const terminal = events.find((row: any) => row.evidence?.profile === 'cos_mass_distilled_independent_evaluation_runtime_v1'
        && ['mass_distilled_independent_evaluation_completed', 'mass_distilled_independent_evaluation_failed'].includes(row.evidence?.claim)
        && row.evidence?.artifactHash === artifactHash
        && (!started || Date.parse(String(row.observed_at || '')) >= Date.parse(String(started.observed_at || ''))))
      const approvalExpiresMs = approval?.expires_at ? Date.parse(String(approval.expires_at)) : 0
      let claimability = 'not_evaluation_pending'
      if (artifact.status === 'evaluation_pending') {
        if (nowMs < eligibleAtMs) claimability = 'waiting_12h'
        // Rolling authority deliberately refuses to mint an evaluation approval until the exact-artifact
        // Production canary exists. Report that upstream prerequisite first; otherwise every canary-less
        // artifact is misleadingly labelled "missing approval" even though approval issuance is correctly blocked.
        else if (!canary) claimability = 'missing_exact_canary'
        else if (!approval) claimability = 'missing_approval'
        else if (approval.evidence?.claim !== 'distilled_independent_evaluation_approved') claimability = 'approval_suspended'
        else if (!approvalExpiresMs || approvalExpiresMs <= nowMs) claimability = 'approval_expired'
        else if (started && !terminal && Date.parse(String(started.observed_at || '')) > nowMs - 12 * 60 * 1000) claimability = 'active_reservation'
        else if (terminal?.evidence?.claim === 'mass_distilled_independent_evaluation_failed') claimability = 'evaluator_failed'
        else claimability = 'claimable'
      }
      const ageSeconds = createdAt ? Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 1000)) : null
      return {
        candidateId,
        subject: text(artifact.subject_id, 240),
        status: text(artifact.status, 80),
        artifactId: text(artifact.trained_artifact_id, 240) || null,
        artifactHash: artifactHash || null,
        revisionKey: text(artifact.revision_key, 240) || null,
        ageSeconds,
        retentionEligibleAt: createdAt ? new Date(Date.parse(createdAt) + 12 * 60 * 60 * 1000).toISOString() : null,
        claimability,
        evaluation: evaluation ? {
          evaluatedAt: iso(evaluation.created_at),
          artifactAgeSeconds: n(evaluation.artifact_age_seconds),
          baselineScore: n(evaluation.baseline_score),
          artifactScore: n(evaluation.trained_artifact_score),
          holdoutImproved: evaluation.holdout_improved === true,
          safetyPassed: evaluation.safety_passed === true,
          unseenTransferPassed: evaluation.unseen_transfer_passed === true,
          delayedRetentionPassed: evaluation.delayed_retention_passed === true,
        } : null,
        graduate: graduate ? {
          status: text(graduate.status, 80),
          runtimeProvider: text(graduate.runtime_provider, 120) || null,
          runtimeModelId: text(graduate.runtime_model_id, 240) || null,
          promotedAt: iso(graduate.promoted_at),
          activatedAt: iso(graduate.activated_at),
          updatedAt: iso(graduate.updated_at),
        } : null,
        updatedAt: iso(artifact.updated_at),
      }
    })

    let workingCosRuntimeBinding: ReturnType<typeof workingCosRuntimeBindingFromEnv> | null = null
    if (workingCosBundle.eligible && runpodPrimaryEnabled()) {
      const podId = configuredRunpodPodId()
      if (podId) {
        try {
          const configuredModel = runpodPrimaryModel('reasoner')
          const runtimeIdentity = await queryWorkingCosRuntimeIdentity(
            runpodPrimaryConfig('reasoner', podId),
          )
          workingCosRuntimeBinding = workingCosRuntimeBindingFromEnv(
            runtimeIdentity,
            podId,
            configuredModel,
          )
        } catch {
          // Telemetry remains read-only and must not turn a transient runtime probe into a 500.
          workingCosRuntimeBinding = null
        }
      }
    }

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
        completedRuns24h,
        failedRuns24h,
        inFlightRuns24h,
        hfObservedCostUsd24h: Number(hfObservedCostUsd24h.toFixed(6)),
        openSourceItems24h: Array.from(openSources.values()).reduce((total, source) => total + source.items24h, 0),
      },
      openSources: Array.from(openSources.values()).map(source => ({
        ...source,
        status: source.items24h > 0 ? 'observed' : source.integration,
        sourceAccessCostUsd24h: 0,
      })),
      workingCos: {
        bundleReady: workingCosBundle.eligible,
        bundleKey: workingCosBundle.bundleKey,
        portableManifestHash: workingCosBundle.combinedPortableManifestHash,
        itemCount: workingCosBundle.itemCount,
        subjectCount: workingCosBundle.subjectCount,
        subjectIds: workingCosBundle.subjectIds,
        blockers: [
          ...workingCosBundle.blockers,
          ...(workingCosBundle.eligible && !workingCosRuntimeBinding?.eligible
            ? ['runtime_binding']
            : []),
        ],
        runtimeBindingEligible: workingCosRuntimeBinding?.eligible === true,
        runtimeBindingBlockers: workingCosRuntimeBinding?.blockers || [],
        runtimeBindingSource: workingCosRuntimeBinding?.bindingSource || null,
        automaticTrainingAuthorized: false,
        productionTrafficAuthorized: false,
        nextGate: !workingCosBundle.eligible
          ? 'balanced_bundle_supply'
          : workingCosRuntimeBinding?.eligible
            ? workingCosRuntimeBinding.nextGate
            : 'runtime_binding',
      },
      providers: Array.from(providers.values())
        .sort((a, b) => b.calls - a.calls || a.id.localeCompare(b.id)),
      runs: recentRuns,
      artifacts,
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
