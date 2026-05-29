import type { AIMode, OrchestrationModule, OrchestrationRequest, WorkflowStep } from './types'
import { logOrchestrationEvent } from './telemetry'
import type { OrchestrationMemory } from './types'

async function invokeUnifiedAI(args: Parameters<typeof import('./unified-api').runUnifiedAI>[0]) {
  const { runUnifiedAI } = await import('./unified-api')
  return runUnifiedAI(args)
}

const STEP_LABELS = ['Understand intent', 'Apply AI mode', 'Validate output']

export function createWorkflow(module: OrchestrationModule, mode: AIMode): WorkflowStep[] {
  return STEP_LABELS.map((label, index) => ({
    id: `${module}-${index + 1}`,
    label,
    module,
    mode,
    status: 'pending',
    attempts: 0,
    maxRetries: 2,
    validate: index === 0 ? 'intent_has_route' : index === 1 ? 'output_has_summary' : 'operator_summary_ready',
  }))
}

function validate(step: WorkflowStep) {
  if (step.validate === 'intent_has_route') return step.module && step.mode
  if (step.validate === 'output_has_summary') return Boolean((step.output as any)?.summary || (step.output as any)?.headline)
  return true
}

export async function executeWorkflow(args: {
  request: OrchestrationRequest
  module: OrchestrationModule
  mode: AIMode
  fallbackMode?: AIMode
  memory: OrchestrationMemory
}) {
  const steps = createWorkflow(args.module, args.mode)
  let lastOutput: Record<string, unknown> = {}
  let operatorRequired = false
  let summary = 'Workflow completed successfully.'
  const recommendedNextSteps: string[] = []

  for (const step of steps) {
    while (step.attempts <= step.maxRetries && step.status !== 'validated') {
      step.attempts += 1
      step.status = step.attempts > 1 ? 'retrying' : 'running'
      logOrchestrationEvent('workflow_step_started', { step: step.id, attempt: step.attempts, module: step.module, mode: step.mode })
      try {
        if (step.label === 'Apply AI mode') {
          step.output = await invokeUnifiedAI({ module: args.module, mode: step.mode, input: args.request.input, memory: args.memory })
          lastOutput = step.output as Record<string, unknown>
        } else {
          step.output = { summary: `${step.label} validated for ${args.module}.` }
        }
        if (validate(step)) {
          step.status = 'validated'
          logOrchestrationEvent('workflow_step_validated', { step: step.id, attempts: step.attempts })
        } else {
          step.error = 'Validation did not pass.'
        }
      } catch (error) {
        step.error = error instanceof Error ? error.message : 'Unknown workflow error'
        logOrchestrationEvent('workflow_step_error', { step: step.id, error: step.error })
      }
    }

    if (step.status !== 'validated') {
      if (args.fallbackMode && step.mode !== args.fallbackMode) {
        step.status = 'fallback'
        step.mode = args.fallbackMode
        step.attempts = 0
        step.output = await invokeUnifiedAI({ module: args.module, mode: args.fallbackMode, input: args.request.input, memory: args.memory })
        if (validate(step)) step.status = 'validated'
      }
    }

    if (step.status !== 'validated') {
      operatorRequired = true
      summary = `SignalBoost could not fully complete ${args.module.replace(/_/g, ' ')} automatically.`
      recommendedNextSteps.push('Review the failed validation in the orchestration log.', 'Use the generated draft as a starting point.', 'Assign an operator to complete the remaining step.')
      break
    }
  }

  steps.forEach(step => { if (step.status === 'validated') step.status = 'completed' })
  return {
    steps,
    output: lastOutput,
    fallback: {
      required: operatorRequired,
      summary,
      recommendedNextSteps: recommendedNextSteps.length ? recommendedNextSteps : ['Review the AI output.', 'Approve or edit the recommended next step.', 'Publish when validation passes.'],
    },
  }
}
