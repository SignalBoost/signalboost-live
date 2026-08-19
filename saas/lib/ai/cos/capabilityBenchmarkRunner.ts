import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswerEnterprise'
import { scoreCapabilityBenchmarkCase, type CapabilityBenchmarkCase } from '@/lib/ai/cos/capabilityBenchmark'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { generateLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'

export type PrivateBenchmarkCase = CapabilityBenchmarkCase & { id: string }

export async function runPrivateCapabilityCase(test: PrivateBenchmarkCase) {
  const started = Date.now()

  // Benchmark execution intentionally bypasses answer caches, but it must not bypass the
  // local-inference lifecycle. Normal COS turns preflight/wake RunPod before enterprise
  // retrieval begins; do the same here so held-out evaluation measures COS capability rather
  // than whether a cold reasoner happened to be awake already.
  if (process.env.COS_LOCAL_FIRST_ENABLED !== 'false') {
    await ensureLocalInferenceRuntimeReady()
    await generateLocalEmbedding(test.prompt)
  }

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
  // Kept only in the owner-only benchmark evidence table; never returned by the dashboard API.
  // A bounded excerpt is enough to diagnose a rubric failure without retaining unbounded output.
  return { score, replyExcerpt: reply.slice(0, 12_000), latencyMs: Date.now() - started, provenance: result.provenance }
}
