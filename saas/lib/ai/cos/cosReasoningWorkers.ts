import { callCosReasoner, resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import type { LocalModelCallArgs } from '@/lib/ai/local-inference'
import {
  CosReasoningEngine,
  type CosReasoningRequest,
  type CosReasoningWorker,
  type CosReasoningWorkerRole,
} from '@/lib/ai/cos/cosReasoningControlPlane'

function toLocalModelCallArgs(request: CosReasoningRequest): LocalModelCallArgs {
  return {
    prompt: request.prompt,
    ...(request.systemPrompt === undefined ? {} : { systemPrompt: request.systemPrompt }),
    ...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
  }
}

/**
 * Adapter from the existing COS-owned reasoner seam into the control plane.
 *
 * DeepInfra/Qwen, self-hosted vLLM, Ollama, or another approved open-model runtime can all sit
 * behind callCosReasoner(). The control plane therefore depends on a worker contract, not a model
 * vendor. Closed-model escalation stays outside this default worker set.
 */
export function createPrimaryCosReasoningWorker(): CosReasoningWorker | null {
  const resolved = resolveCosReasoner()
  if (!resolved.config) return null
  const configured = resolved.config

  return {
    id: 'cos-primary-reasoner',
    role: 'primary',
    kind: 'cos-open-model',
    label: configured.label,
    priority: 100,
    async execute(request) {
      const reasoned = await callCosReasoner(toLocalModelCallArgs(request))
      if (!reasoned?.text) return null
      return {
        text: reasoned.text,
        turnId: reasoned.turnId,
        metadata: {
          reasonerKind: reasoned.reasoner.kind,
          reasonerLabel: reasoned.reasoner.label,
        },
      }
    },
  }
}

export function createDefaultCosReasoningEngine(): CosReasoningEngine {
  const primary = createPrimaryCosReasoningWorker()
  return new CosReasoningEngine(primary ? [primary] : [])
}

/**
 * Provider-neutral entrypoint for callers migrating away from direct model invocation.
 * Phase 1 intentionally has one primary worker, so existing behavior is preserved while the
 * ownership boundary moves to COS. Specialist workers can be registered later without changing
 * the planning contract or making any provider mandatory.
 */
export async function reasonThroughCosControlPlane(
  args: LocalModelCallArgs,
  options: {
    requestedRole?: CosReasoningWorkerRole
    allowExternalEscalation?: boolean
  } = {},
) {
  return createDefaultCosReasoningEngine().run({
    ...args,
    ...options,
  })
}
