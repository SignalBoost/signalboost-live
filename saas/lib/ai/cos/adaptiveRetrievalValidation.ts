import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { COS_EVIDENCE_UTILIZATION_BENCHMARK, type EvidenceUtilizationBenchmarkCase } from '@/lib/ai/cos/evidenceUtilizationBenchmark'
import { runPrivateCapabilityCase } from '@/lib/ai/cos/capabilityBenchmarkRunner'
import {
  refreshAdaptiveRetrievalShadowCandidate,
  type AdaptiveRetrievalPolicyRow,
} from '@/lib/ai/cos/adaptiveRetrievalPolicy'

export type AdaptiveRetrievalValidationResult = {
  policyId: string
  caseId: string
  caseDomain: string
  verdict: 'passed' | 'failed' | 'inconclusive'
  reasons: string[]
  baseline: { turnId: string | null; passed: boolean; injected: number; latencyMs: number }
  candidate: { turnId: string | null; passed: boolean; injected: number; latencyMs: number }
  policyStatus: string
  validationPassed: number
  validationFailed: number
}

function candidateMaxInjected(policy: AdaptiveRetrievalPolicyRow): number {
  const raw = Number(policy.candidate_policy?.learnedCorpusMaxInjected)
  return Number.isFinite(raw) ? Math.max(0, Math.min(12, Math.floor(raw))) : 4
}

function trainingDomains(trainingCaseIds: readonly string[]): Set<string> {
  const byId = new Map(COS_EVIDENCE_UTILIZATION_BENCHMARK.map(test => [test.id, test.domain]))
  return new Set(trainingCaseIds.map(caseId => byId.get(caseId)).filter((value): value is string => Boolean(value)))
}

/**
 * Pick a controlled case that was not used to derive this policy. Prefer a domain absent from the
 * training cohort and then a domain not yet used by this policy's validation rows.
 */
export function selectAdaptiveRetrievalValidationCase(args: {
  trainingCaseIds: readonly string[]
  priorValidationCaseIds: readonly string[]
}): EvidenceUtilizationBenchmarkCase | null {
  const training = new Set(args.trainingCaseIds)
  const prior = new Set(args.priorValidationCaseIds)
  const trainedDomains = trainingDomains(args.trainingCaseIds)
  const priorDomains = new Set(
    COS_EVIDENCE_UTILIZATION_BENCHMARK
      .filter(test => prior.has(test.id))
      .map(test => test.domain),
  )
  const available = COS_EVIDENCE_UTILIZATION_BENCHMARK.filter(test => !training.has(test.id) && !prior.has(test.id))
  return available.find(test => !trainedDomains.has(test.domain) && !priorDomains.has(test.domain))
    ?? available.find(test => !priorDomains.has(test.domain))
    ?? available[0]
    ?? null
}

function learnedInjected(result: Awaited<ReturnType<typeof runPrivateCapabilityCase>>): number {
  return Math.max(0, Number(result.provenance?.evidenceFunnel?.learnedCorpus?.injected) || 0)
}

export async function runNextAdaptiveRetrievalValidation(): Promise<AdaptiveRetrievalValidationResult | null> {
  const refreshed = await refreshAdaptiveRetrievalShadowCandidate()
  const policy = refreshed.policy
  if (!policy || policy.status === 'rejected' || policy.status === 'validated_shadow') return null
  const db = cosServiceDb()
  if (!db) return null

  const priorResult = await db.from('cos_adaptive_retrieval_validations')
    .select('case_id').eq('policy_id', policy.id).order('created_at', { ascending: true })
  if (priorResult.error) throw priorResult.error
  const priorCaseIds = (priorResult.data ?? []).map(row => String(row.case_id || '')).filter(Boolean)
  const test = selectAdaptiveRetrievalValidationCase({
    trainingCaseIds: policy.training_case_ids ?? [],
    priorValidationCaseIds: priorCaseIds,
  })
  if (!test) return null

  const sourcePrefix = `adaptive_retrieval_validation:${policy.id}:${test.id}`
  const baseline = await runPrivateCapabilityCase(test, {
    outcomeSource: `${sourcePrefix}:baseline`,
  })
  const candidate = await runPrivateCapabilityCase(test, {
    outcomeSource: `${sourcePrefix}:candidate`,
    adaptiveRetrievalPolicy: {
      policyId: policy.id,
      mode: 'shadow_validation',
      learnedCorpusMaxInjected: candidateMaxInjected(policy),
      learnedCorpusMinSimilarity: Number(policy.candidate_policy?.learnedCorpusMinSimilarity) || null,
    },
  })

  const baselineInjected = learnedInjected(baseline)
  const candidateInjected = learnedInjected(candidate)
  const reasons: string[] = []
  let verdict: AdaptiveRetrievalValidationResult['verdict']
  if (!baseline.score.passed) {
    verdict = 'inconclusive'
    reasons.push('baseline_failed_controlled_case')
  } else if (!candidate.score.passed) {
    verdict = 'failed'
    reasons.push('candidate_quality_regression')
    reasons.push(...candidate.score.reasons.slice(0, 4))
  } else if (candidateInjected >= baselineInjected) {
    verdict = 'inconclusive'
    reasons.push('candidate_did_not_reduce_injected_context_on_this_case')
  } else {
    verdict = 'passed'
    reasons.push(`quality_preserved_with_${baselineInjected - candidateInjected}_fewer_injected_items`)
  }

  const inserted = await db.from('cos_adaptive_retrieval_validations').insert({
    policy_id: policy.id,
    case_id: test.id,
    case_domain: test.domain,
    baseline_turn_id: baseline.turnId,
    candidate_turn_id: candidate.turnId,
    baseline_passed: baseline.score.passed,
    candidate_passed: candidate.score.passed,
    baseline_injected: baselineInjected,
    candidate_injected: candidateInjected,
    baseline_latency_ms: baseline.latencyMs,
    candidate_latency_ms: candidate.latencyMs,
    verdict,
    reasons,
  })
  if (inserted.error) throw inserted.error

  const counts = await db.from('cos_adaptive_retrieval_validations')
    .select('verdict').eq('policy_id', policy.id)
  if (counts.error) throw counts.error
  const validationPassed = (counts.data ?? []).filter(row => row.verdict === 'passed').length
  const validationFailed = (counts.data ?? []).filter(row => row.verdict === 'failed').length
  const required = Math.max(1, Number(policy.validation_required) || 2)
  const policyStatus = validationFailed > 0
    ? 'rejected'
    : validationPassed >= required
      ? 'validated_shadow'
      : 'validation_pending'
  const updated = await db.from('cos_adaptive_retrieval_policies').update({
    status: policyStatus,
    validation_passed: validationPassed,
    validation_failed: validationFailed,
    updated_at: new Date().toISOString(),
  }).eq('id', policy.id)
  if (updated.error) throw updated.error

  return {
    policyId: policy.id,
    caseId: test.id,
    caseDomain: test.domain,
    verdict,
    reasons,
    baseline: {
      turnId: baseline.turnId,
      passed: baseline.score.passed,
      injected: baselineInjected,
      latencyMs: baseline.latencyMs,
    },
    candidate: {
      turnId: candidate.turnId,
      passed: candidate.score.passed,
      injected: candidateInjected,
      latencyMs: candidate.latencyMs,
    },
    policyStatus,
    validationPassed,
    validationFailed,
  }
}
