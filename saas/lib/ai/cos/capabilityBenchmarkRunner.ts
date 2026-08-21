import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswerEnterprise'
import { scoreCapabilityBenchmarkCase, type CapabilityBenchmarkCase } from '@/lib/ai/cos/capabilityBenchmark'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { generateLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'
import { flushCapturedEvidenceSourceUse } from '@/lib/ai/cos/evidenceSourceUseStore'
import { beginEvidenceSourceUseTurn, peekEvidenceSourceUseTurnId } from '@/lib/ai/cos/evidenceSourceUseTurnContext'
import { attachTurnOutcome } from '@/lib/ai/cos/turnExperienceStore'

export type PrivateBenchmarkCase = CapabilityBenchmarkCase & { id: string }

export async function runPrivateCapabilityCase(
  test: PrivateBenchmarkCase,
  options?: { outcomeSource?: string },
) {
  const started = Date.now()
  beginEvidenceSourceUseTurn()

  if (process.env.COS_LOCAL_FIRST_ENABLED !== 'false') {
    await ensureLocalInferenceRuntimeReady()
    await generateLocalEmbedding(test.prompt)
  }

  const result = await tryCOSFirstAnswer({ prompt: test.prompt, language: 'en', privileged: true, disableCache: true })
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
    await attachTurnOutcome(turnId, {
      verifiedSuccess: score.passed,
      repairNeeded: !score.passed,
      escalated: !result.handled,
      source: options?.outcomeSource || `capability_benchmark:${test.track}`,
    })
  }

  return {
    score,
    replyExcerpt: reply.slice(0, 12_000),
    latencyMs: Date.now() - started,
    provenance: result.provenance,
    turnId,
  }
}
