import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  FINE_TUNE_EVIDENCE_PROFILE,
  type FineTuneRevision,
} from './cosUniversityFineTuneEvidence.ts'
import {
  COS_UNIVERSITY_INDEPENDENT_EVALUATOR_PROFILE,
  independentEvaluatorConfigFromEnv,
  signIndependentEvaluatorPayload,
  type IndependentEvaluatorClaim,
} from './cosUniversityIndependentEvaluator.ts'
import { COS_MASS_DISTILLED_EVALUATOR_VERSION } from './cosUniversityMassDistilledArtifactEvaluation.ts'

const APPROVAL_PROFILE = 'cos_distilled_independent_evaluation_authorization_v1'
const HEX64 = /^[a-f0-9]{64}$/i
const MASS_CANDIDATE = /^mass:([0-9a-f-]{36}):([a-f0-9]{16})$/i

function clean(value: unknown, max = 2000): string {
  return String(value ?? '').trim().slice(0, max)
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function exactDeploymentOrigin(env: Record<string, string | undefined> = process.env): string | null {
  const exact = clean(env.VERCEL_URL, 1000)
  const explicit = clean(env.ITMOUNTS_PUBLIC_ORIGIN || env.NEXT_PUBLIC_APP_URL, 2000)
  const candidate = exact ? `https://${exact}` : explicit
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) return null
    return url.origin
  } catch {
    return null
  }
}

async function submit(input: {
  claim: IndependentEvaluatorClaim
  candidateId: string
  revision: FineTuneRevision
  artifactId: string
  artifactHash: string
  evaluatorId: string
  suiteHash: string
  evidenceRef: string
  baselineScore?: number
  trainedArtifactScore?: number
}) {
  const config = independentEvaluatorConfigFromEnv()
  if (!config) throw new Error('independent_evaluator_not_configured')
  const origin = exactDeploymentOrigin()
  if (!origin) throw new Error('independent_evaluator_origin_unavailable')
  const payload = {
    candidateId: input.candidateId,
    claim: input.claim,
    revision: input.revision,
    trainedArtifactId: input.artifactId,
    artifactHash: input.artifactHash,
    evaluatorId: input.evaluatorId,
    evaluationSuiteHash: input.suiteHash,
    evidenceRef: input.evidenceRef,
    verifiedSourceAttribution: true,
    authorityExpanded: false,
    ...(input.claim === 'independent_evaluation' ? {
      baselineScore: input.baselineScore,
      trainedArtifactScore: input.trainedArtifactScore,
      holdoutManifestHash: input.revision.holdoutManifestHash,
    } : {}),
  }
  const rawBody = JSON.stringify(payload)
  const timestamp = new Date().toISOString()
  const idempotencyKey = sha256([COS_MASS_DISTILLED_EVALUATOR_VERSION, input.claim, input.artifactHash, input.suiteHash])
  const signature = signIndependentEvaluatorPayload({ secret: config.secret, timestamp, idempotencyKey, rawBody })
  const response = await fetch(new URL('/api/internal/cos/university-independent-evaluator/evidence', origin), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-itmounts-evaluator-profile': COS_UNIVERSITY_INDEPENDENT_EVALUATOR_PROFILE,
      'x-itmounts-evaluator-timestamp': timestamp,
      'x-itmounts-evaluator-idempotency-key': idempotencyKey,
      'x-itmounts-evaluator-signature': signature,
    },
    body: rawBody,
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`independent_evaluator_evidence_http_${response.status}`)
}

function expectedClaims(row: any): IndependentEvaluatorClaim[] {
  const claims: IndependentEvaluatorClaim[] = ['independent_evaluation']
  if (row.safety_passed === true) claims.push('safety_regression_passed')
  if (row.unseen_transfer_passed === true) claims.push('unseen_transfer_passed')
  if (row.delayed_retention_passed === true) claims.push('delayed_retention_passed')
  return claims
}

export async function reconcileMassDistilledEvaluationClaims(now = new Date()) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  if (!independentEvaluatorConfigFromEnv()) {
    return { ok: false as const, skipped: true as const, reason: 'independent_evaluator_not_configured' as const }
  }

  const runs = await db.from('cos_university_distilled_evaluation_runs')
    .select('*')
    .eq('evaluator_version', COS_MASS_DISTILLED_EVALUATOR_VERSION)
    .like('candidate_id', 'mass:%')
    .order('created_at', { ascending: true })
    .limit(50)
  if (runs.error) throw runs.error

  for (const row of runs.data || []) {
    const candidateId = clean((row as any).candidate_id, 140)
    const artifactHash = clean((row as any).trained_artifact_hash, 64).toLowerCase()
    const artifactId = clean((row as any).trained_artifact_id, 500)
    if (!MASS_CANDIDATE.test(candidateId) || !HEX64.test(artifactHash) || !artifactId) continue

    const events = await db.from('cos_university_learning_assurance_events')
      .select('evidence,verifier,observed_at,expires_at')
      .eq('event_type', 'fine_tune')
      .eq('candidate_id', candidateId)
      .order('observed_at', { ascending: false })
      .limit(300)
    if (events.error) throw events.error

    const recorded = new Set((events.data || [])
      .filter(item => item.verifier === 'independent_scorer'
        && (item.evidence as any)?.profile === FINE_TUNE_EVIDENCE_PROFILE
        && clean((item.evidence as any)?.artifactHash, 64).toLowerCase() === artifactHash)
      .map(item => clean((item.evidence as any)?.claim, 80)))
    const missing = expectedClaims(row).filter(claim => !recorded.has(claim))
    if (!missing.length) continue

    const createdAt = Date.parse(String((row as any).created_at || ''))
    const approval = (events.data || []).find(item => {
      const evidence: any = item.evidence
      const observed = Date.parse(String(item.observed_at || ''))
      const expires = Date.parse(String(item.expires_at || ''))
      return item.verifier === 'host_controller'
        && evidence?.profile === APPROVAL_PROFILE
        && evidence?.claim === 'distilled_independent_evaluation_approved'
        && evidence?.candidateId === candidateId
        && clean(evidence?.artifactHash, 64).toLowerCase() === artifactHash
        && evidence?.evaluationAuthorized === true
        && evidence?.productionTrafficAuthorized === false
        && evidence?.authorityExpanded === false
        && Number.isFinite(createdAt)
        && Number.isFinite(observed) && observed <= createdAt
        && Number.isFinite(expires) && expires >= createdAt
    })
    if (!approval) throw new Error('mass_distilled_claim_repair_original_approval_missing')

    const massRun = await db.from('cos_university_mass_distillation_batch_runs')
      .select('student_model_id,dataset_hash,training_manifest_hash,holdout_manifest_hash')
      .eq('candidate_id', candidateId)
      .eq('stage', 'complete')
      .maybeSingle()
    if (massRun.error) throw massRun.error
    if (!massRun.data) throw new Error('mass_distilled_claim_repair_training_run_missing')
    const revision: FineTuneRevision = {
      baseModel: clean((massRun.data as any).student_model_id, 500),
      datasetHash: clean((massRun.data as any).dataset_hash, 64).toLowerCase(),
      trainingManifestHash: clean((massRun.data as any).training_manifest_hash, 64).toLowerCase(),
      holdoutManifestHash: clean((massRun.data as any).holdout_manifest_hash, 64).toLowerCase(),
    }
    if (!revision.baseModel || !HEX64.test(revision.datasetHash) || !HEX64.test(revision.trainingManifestHash) || !HEX64.test(revision.holdoutManifestHash)) {
      throw new Error('mass_distilled_claim_repair_revision_invalid')
    }

    const evidenceRef = `db://cos_university_distilled_evaluation_runs/${clean((row as any).run_key, 64)}`
    const evaluatorId = clean((row as any).evaluator_id, 240)
    for (const claim of missing) {
      const suiteHash = claim === 'independent_evaluation'
        ? clean((row as any).holdout_suite_hash, 64)
        : claim === 'safety_regression_passed'
          ? clean((row as any).safety_suite_hash, 64)
          : claim === 'unseen_transfer_passed'
            ? clean((row as any).transfer_suite_hash, 64)
            : clean((row as any).retention_suite_hash, 64)
      await submit({
        claim,
        candidateId,
        revision,
        artifactId,
        artifactHash,
        evaluatorId,
        suiteHash,
        evidenceRef,
        ...(claim === 'independent_evaluation' ? {
          baselineScore: Number((row as any).baseline_score),
          trainedArtifactScore: Number((row as any).trained_artifact_score),
        } : {}),
      })
    }
    return Object.freeze({
      ok: true as const,
      repaired: true as const,
      candidateId,
      artifactHash,
      claims: Object.freeze(missing),
      providerCalls: 0,
      judgeCalls: 0,
      datasetFetches: 0,
      productionTrafficAuthorized: false,
      authorityExpanded: false,
      observedAt: now.toISOString(),
    })
  }

  return { ok: true as const, skipped: true as const, reason: 'no_missing_mass_distilled_scorer_claims' as const, repaired: false as const }
}
