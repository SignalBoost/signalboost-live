import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswerEnterprise'
import { scoreCapabilityBenchmarkCase, type CapabilityBenchmarkCase } from '@/lib/ai/cos/capabilityBenchmark'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { generateLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'
import { flushCapturedEvidenceSourceUse } from '@/lib/ai/cos/evidenceSourceUseStore'
import { beginEvidenceSourceUseTurn, peekEvidenceSourceUseTurnId } from '@/lib/ai/cos/evidenceSourceUseTurnContext'
import { attachTurnOutcome, recordTurnLearningEnrichment } from '@/lib/ai/cos/turnExperienceStore'
import { decideCosTurnExperience } from '@/lib/ai/cos/cognitiveTurnExperience'
import {
  withReasoningEvaluationContext,
  type CosReasoningEvaluationContext,
} from '@/lib/ai/cos/reasoningEvaluationContext'

export type PrivateBenchmarkCase = CapabilityBenchmarkCase & { id: string }

type RunPrivateCapabilityCaseOptions = {
  outcomeSource?: string
  /** Explicit bounded correction used only for a failure-autopsy shadow retest. */
  shadowGuidance?: string
  /** Controlled Phase 5 worker-role override. Never set by ordinary production traffic. */
  evaluation?: CosReasoningEvaluationContext
  /** Comparators attach verified outcomes only after confirming a valid local execution. */
  attachOutcome?: boolean
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function guidedPrompt(prompt: string, guidance?: string): string {
  const cleanGuidance = String(guidance ?? '').replace(/\s+/g, ' ').trim().slice(0, 2400)
  if (!cleanGuidance) return prompt
  return [
    prompt,
    '',
    'SHADOW FAILURE-AUTOPSY RETEST GUIDANCE — this is a bounded evaluation aid, not a live policy change:',
    cleanGuidance,
    '',
    'Do not mention this guidance in the answer. It never widens authorization, source trust, or external-action permission.',
  ].join('\n')
}

async function executePrivateCapabilityCase(
  test: PrivateBenchmarkCase,
  options?: RunPrivateCapabilityCaseOptions,
) {
  const started = Date.now()
  beginEvidenceSourceUseTurn()
  const executionPrompt = guidedPrompt(test.prompt, options?.shadowGuidance)

  if (process.env.COS_LOCAL_FIRST_ENABLED !== 'false') {
    await ensureLocalInferenceRuntimeReady()
    await generateLocalEmbedding(test.prompt)
  }

  const result = await tryCOSFirstAnswer({ prompt: executionPrompt, language: 'en', privileged: true, disableCache: true })
  const reply = result.handled ? result.reply : ('bestEffortReply' in result ? result.bestEffortReply ?? '' : '')
  const turnId = peekEvidenceSourceUseTurnId()
  const score = scoreCapabilityBenchmarkCase(test, {
    caseId: test.id,
    reply,
    provenance: {
      localReasoning: result.provenance.localModelInvoked,
      externalAi: result.provenance.externalAiInvoked,
      semanticCache: result.provenance.responseSource === 'semantic_cache' || result.provenance.responseSource === 'semantic_similarity',
    },
  })

  // Enterprise benchmark execution bypasses the outer ordinary-turn learning wrapper, so flush the
  // learned-source utilization envelope explicitly. This is still best-effort/post-response telemetry.
  flushCapturedEvidenceSourceUse()

  if (turnId) {
    const learningDecision = decideCosTurnExperience({
      prompt: test.prompt,
      handled: result.handled,
      confidence: result.confidence,
      provenance: result.provenance,
      failureReason: score.passed ? null : score.reasons.join('; '),
    })
    recordTurnLearningEnrichment({
      turnId,
      problemClass: learningDecision.subject,
      predictedConfidence: result.confidence,
      routeClass: learningDecision.routeClass,
      responseSource: String(learningDecision.evidence.responseSource || result.provenance.responseSource || 'unknown'),
      evidenceSummary: asRecord(learningDecision.evidence.utilization),
      failureReason: score.passed ? null : score.reasons.join('; ').slice(0, 1200),
    })

    if (options?.attachOutcome !== false) {
      await attachTurnOutcome(turnId, {
        verifiedSuccess: score.passed,
        repairNeeded: !score.passed,
        escalated: !result.handled,
        source: options?.outcomeSource || `capability_benchmark:${test.track}`,
      })
    }
  }

  return {
    score,
    replyExcerpt: reply.slice(0, 12_000),
    latencyMs: Date.now() - started,
    provenance: result.provenance,
    turnId,
    handled: result.handled,
    confidence: result.confidence,
  }
}

export async function runPrivateCapabilityCase(
  test: PrivateBenchmarkCase,
  options?: RunPrivateCapabilityCaseOptions,
) {
  if (!options?.evaluation) return executePrivateCapabilityCase(test, options)
  return withReasoningEvaluationContext(options.evaluation, () => executePrivateCapabilityCase(test, options))
}
