import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { COS_EVIDENCE_UTILIZATION_BENCHMARK, type EvidenceUtilizationBenchmarkCase } from '@/lib/ai/cos/evidenceUtilizationBenchmark'
import { runPrivateCapabilityCase } from '@/lib/ai/cos/capabilityBenchmarkRunner'
import { generateLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'
import { queryNearestLearnedCorpus, learnedCorpusEmbeddingText } from '@/lib/ai/cos/learnedCorpusSemantic'
import { domainCompatibleContext } from '@/lib/ai/cos/contextRelevance'
import {
  refreshAdaptiveRetrievalShadowCandidate,
  type AdaptiveRetrievalPolicyRow,
} from '@/lib/ai/cos/adaptiveRetrievalPolicy'
import {
  adaptiveRetrievalCaseCanExerciseCap,
  selectAdaptiveRetrievalValidationCase,
} from '@/lib/ai/cos/adaptiveRetrievalPolicyLogic'

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

const PREFLIGHT_SCAN_LIMIT = 16

function candidateMaxInjected(policy: AdaptiveRetrievalPolicyRow): number {
  const raw = Number(policy.candidate_policy?.learnedCorpusMaxInjected)
  return Number.isFinite(raw) ? Math.max(0, Math.min(12, Math.floor(raw))) : 4
}

function currentSimilarityThreshold(policy: AdaptiveRetrievalPolicyRow): number {
  const raw = Number(policy.current_policy?.learnedCorpusMinSimilarity)
  return Number.isFinite(raw) ? Math.max(0.20, Math.min(0.95, raw)) : 0.45
}

function learnedInjected(result: Awaited<ReturnType<typeof runPrivateCapabilityCase>>): number {
  return Math.max(0, Number(result.provenance?.evidenceFunnel?.learnedCorpus?.injected) || 0)
}

/**
 * Cheap retrieval-only estimate using the same vector store, similarity threshold and domain gate as
 * the live learned-corpus path. It does not call the reasoning model or create outcome evidence.
 */
async function estimateLiveLearnedCorpusCapacity(
  test: EvidenceUtilizationBenchmarkCase,
  similarityThreshold: number,
): Promise<number | null> {
  try {
    const vector = await generateLocalEmbedding(test.prompt)
    const rows = await queryNearestLearnedCorpus(vector, { matchCount: 40, minSimilarity: 0 })
    const relevant = rows.filter(row =>
      Number(row.similarity || 0) >= similarityThreshold
      && domainCompatibleContext(test.prompt, learnedCorpusEmbeddingText(row)),
    )
    return Math.min(6, relevant.length)
  } catch (error) {
    console.warn('[cos-adaptive-retrieval] retrieval-only preflight unavailable; falling back to controlled pair',
      error instanceof Error ? error.message : String(error))
    return null
  }
}

async function selectValidationCaseWithCoverage(args: {
  policy: AdaptiveRetrievalPolicyRow
  priorCaseIds: string[]
}): Promise<EvidenceUtilizationBenchmarkCase | null> {
  const skipped: string[] = []
  const candidateCap = candidateMaxInjected(args.policy)
  const threshold = currentSimilarityThreshold(args.policy)

  for (let attempt = 0; attempt < PREFLIGHT_SCAN_LIMIT; attempt += 1) {
    const test = selectAdaptiveRetrievalValidationCase({
      cases: COS_EVIDENCE_UTILIZATION_BENCHMARK,
      trainingCaseIds: args.policy.training_case_ids ?? [],
      priorValidationCaseIds: [...args.priorCaseIds, ...skipped],
    })
    if (!test) return null

    const estimated = await estimateLiveLearnedCorpusCapacity(test, threshold)
    // If preflight itself is unavailable, preserve the prior behavior rather than blocking validation.
    if (estimated == null || adaptiveRetrievalCaseCanExerciseCap(estimated, candidateCap)) return test
    skipped.push(test.id)
  }

  console.info('[cos-adaptive-retrieval] no reducible controlled case found inside preflight scan', {
    policyId: args.policy.id,
    skipped: skipped.length,
    candidateCap,
  })
  return null
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
  const test = await selectValidationCaseWithCoverage({ policy, priorCaseIds })
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
