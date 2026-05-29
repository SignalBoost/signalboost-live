import type { OrchestrationRequest, OrchestrationResult } from './types'
import { routeOrchestrationIntent } from './intent-router'
import { selectAIMode } from './mode-selector'
import { getOrchestrationMemory, rememberOrchestrationAction } from './memory-layer'
import { executeWorkflow } from './workflow-engine'
import { getOrchestrationTelemetry, logOrchestrationEvent } from './telemetry'

export async function orchestrate(request: OrchestrationRequest): Promise<OrchestrationResult> {
  const routed = routeOrchestrationIntent(request.input)
  const intent = { module: routed.module, href: routed.href, confidence: routed.confidence, reason: routed.reason }
  const mode = selectAIMode(routed.module, request.input)
  const memory = rememberOrchestrationAction({ ...request, language: request.language || routed.language }, `${intent.module}:${mode.mode}`)

  logOrchestrationEvent('intent_routed', { module: intent.module, confidence: intent.confidence, mode: mode.mode, language: memory.language })

  const workflow = await executeWorkflow({
    request,
    module: intent.module,
    mode: mode.mode,
    fallbackMode: mode.fallbackMode,
    memory,
  })

  logOrchestrationEvent('workflow_finished', { module: intent.module, mode: mode.mode, operatorRequired: workflow.fallback.required })

  return {
    intent,
    mode,
    memory,
    steps: workflow.steps,
    output: workflow.output,
    fallback: workflow.fallback,
    telemetry: getOrchestrationTelemetry().slice(-20),
  }
}

export { getOrchestrationMemory }
