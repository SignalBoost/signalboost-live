import { performance } from 'node:perf_hooks'
import { withPublicDeliveryScope } from '../../auth/publicDeliveryScope.ts'
import { getConciergeAnswer } from '../../platform/unifiedPlatform.ts'
import { tryCOSFirstAnswer } from './cosFirstAnswer.ts'
import {
  evaluateLanguageAcceptanceText,
  type ConciergeLanguageAcceptanceCase,
  type ConciergeLanguageAcceptanceExecution,
} from './conciergeLanguageAcceptance.ts'

export async function executeConciergeLanguageAcceptanceCase(test: ConciergeLanguageAcceptanceCase): Promise<ConciergeLanguageAcceptanceExecution> {
  const started = performance.now()
  let reply = ''
  let responseSource = ''
  let localModelInvoked = false
  let externalAiInvoked = false
  let handled = false
  let nativeReviewConfidence: number | null = null
  let nativeReviewerUsed = false

  if (test.mode === 'deterministic_fallback') {
    const fallback = getConciergeAnswer(test.prompt, test.language)
    reply = fallback.reply
    responseSource = `deterministic_concierge_${fallback.intent}`
    handled = Boolean(reply.trim())
  } else {
    const result = await withPublicDeliveryScope(() => tryCOSFirstAnswer({
      prompt: test.prompt,
      language: test.language,
      privileged: false,
      disableCache: true,
      previousAssistant: null,
      userId: null,
    }))
    const value = result as any
    handled = value.handled === true
    reply = String(value.reply || value.bestEffortReply || '')
    const provenance = (value.provenance || {}) as Record<string, any>
    responseSource = String(provenance.responseSource || provenance.response_source || '')
    localModelInvoked = provenance.localModelInvoked === true || provenance.local_model_invoked === true
    externalAiInvoked = Boolean(provenance.externalAiInvoked || provenance.external_ai_invoked)
    const review = provenance.nativeLanguageQuality
    if (review && typeof review === 'object') {
      nativeReviewerUsed = review.reviewed === true
      const score = Number(review.confidence)
      nativeReviewConfidence = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : null
    }
  }

  const latencyMs = Math.max(0, Math.round(performance.now() - started))
  const verdicts = evaluateLanguageAcceptanceText({
    test,
    reply,
    handled,
    responseSource,
    localModelInvoked,
    externalAiInvoked,
    latencyMs,
  })

  return {
    test,
    reply,
    responseSource,
    localModelInvoked,
    externalAiInvoked,
    latencyMs,
    nativeReviewConfidence,
    nativeReviewerUsed,
    verdicts,
    passed: Object.values(verdicts).every(Boolean),
  }
}
