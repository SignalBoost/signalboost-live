import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswerEnterprise'
import { scoreCapabilityBenchmarkCase, type CapabilityBenchmarkCase } from '@/lib/ai/cos/capabilityBenchmark'

export type PrivateBenchmarkCase = CapabilityBenchmarkCase & { id: string }

export async function runPrivateCapabilityCase(test: PrivateBenchmarkCase) {
  const started = Date.now()
  const result = await tryCOSFirstAnswer({ prompt: test.prompt, language: 'en', privileged: true, disableCache: true })
  const reply = result.handled ? result.reply : ('bestEffortReply' in result ? result.bestEffortReply ?? '' : '')
  const score = scoreCapabilityBenchmarkCase(test, {
    caseId: test.id,
    reply,
    provenance: {
      localReasoning: result.provenance.localModelInvoked,
      externalAi: result.provenance.externalAiInvoked,
      semanticCache: result.provenance.responseSource === 'semantic_cache' || result.provenance.responseSource === 'semantic_similarity',
    },
  })
  return { score, latencyMs: Date.now() - started, provenance: result.provenance }
}
