import { callRawCosReasoner, resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import type { LocalModelCallArgs } from '@/lib/ai/local-inference'
import { classifyProblemClass } from '@/lib/ai/cos/cosProblemClass'
import {
  CosReasoningEngine,
  type CosReasoningRequest,
  type CosReasoningWorker,
  type CosReasoningWorkerRole,
} from '@/lib/ai/cos/cosReasoningControlPlane'
import {
  boundedRoleMaxTokens,
  selectCosReasoningWorkerRole,
  type CosReasoningRoleDecision,
  type CosSpecialistRole,
} from '@/lib/ai/cos/cosReasoningRolePolicy'
import { learnedRoutingOverride } from '@/lib/ai/cos/reasoningOutcomeLearning'
import { recordReasoningWorkerMetric } from '@/lib/ai/cos/reasoningWorkerMetrics'
import { currentReasoningEvaluationContext } from '@/lib/ai/cos/reasoningEvaluationContext'
import { COS_GENERAL_REASONING_DISCIPLINE } from '@/lib/ai/cos/cosGeneralReasoningDiscipline'

const ROLE_GUIDANCE: Readonly<Record<Exclude<CosSpecialistRole, 'primary'>, string>> = {
  coder: [
    'COS SPECIALIST ROLE: CODER.',
    'Produce the final answer requested by the caller, not a meta-review of the task.',
    'Prioritize implementation correctness, interfaces, failure modes, tests, and minimal safe changes.',
    'Do not invent repository state, execution results, APIs, or dependencies that are not supplied.',
    'Preserve the caller\'s exact output contract, including strict JSON when required.',
  ].join(' '),
  critic: [
    'COS SPECIALIST ROLE: CRITIC.',
    'Produce the final answer requested by the caller, not a critique transcript.',
    'Stress-test causal reasoning, distinguish mechanism from symptom, rank plausible causes, and name observables or falsifiers when the task supports them.',
    'Do not manufacture telemetry or certainty.',
    'Preserve the caller\'s exact output contract, including strict JSON when required.',
  ].join(' '),
  verifier: [
    'COS SPECIALIST ROLE: VERIFIER.',
    'Produce the final answer requested by the caller using only evidence the parent prompt permits.',
    'Prefer refusal or low confidence over filling an evidence gap from memory when verification is required.',
    'Check internal consistency, dates, identities, quantities, and citation requirements before answering.',
    'Preserve the caller\'s exact output contract, including strict JSON when required.',
  ].join(' '),
  researcher: [
    'COS SPECIALIST ROLE: RESEARCHER.',
    'Produce the final answer requested by the caller, not a research diary.',
    'Synthesize the supplied evidence carefully, distinguish evidence from inference, and do not invent sources or unsupported facts.',
    'Prefer the strongest directly relevant evidence over broad but weak context.',
    'Preserve the caller\'s exact output contract, including strict JSON when required.',
  ].join(' '),
}

function roleSystemPrompt(request: CosReasoningRequest, role: CosSpecialistRole): string | undefined {
  const roleGuidance = role === 'primary' ? null : ROLE_GUIDANCE[role]
  return [request.systemPrompt, COS_GENERAL_REASONING_DISCIPLINE, roleGuidance].filter(Boolean).join('\n\n')
}

function toLocalModelCallArgs(request: CosReasoningRequest, role: CosSpecialistRole): LocalModelCallArgs {
  const systemPrompt = roleSystemPrompt(request, role)
  const maxTokens = boundedRoleMaxTokens(role, request.maxTokens)
  return {
    prompt: request.prompt,
    ...(systemPrompt === undefined ? {} : { systemPrompt }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
  }
}

function workerId(role: CosSpecialistRole): string {
  return role === 'primary' ? 'cos-primary-reasoner' : `cos-${role}-worker`
}

/**
 * One approved open-model runtime can expose several COS-owned capabilities. The role changes the
 * bounded reasoning contract, not the provider. This is intentionally different from pretending
 * that five prompts are five independent models: provenance keeps the same underlying model label.
 */
function createOpenModelWorker(role: CosSpecialistRole): CosReasoningWorker | null {
  const resolved = resolveCosReasoner()
  if (!resolved.config) return null
  const configured = resolved.config

  return {
    id: workerId(role),
    role,
    kind: 'cos-open-model',
    label: configured.label,
    priority: 100,
    async execute(request) {
      // Raw execution is intentionally below the control plane. Calling callCosReasoner() here
      // would recursively re-enter the planner.
      const effective = toLocalModelCallArgs(request, role)
      const startedAt = Date.now()
      const reasoned = await callRawCosReasoner(effective)
      if (!reasoned?.text) return null
      const objective = selectCosReasoningWorkerRole(request.prompt).objective
      recordReasoningWorkerMetric({
        turnId: reasoned.turnId,
        problemClass: classifyProblemClass(objective),
        workerRole: role,
        reasonerLabel: reasoned.reasoner.label,
        latencyMs: Date.now() - startedAt,
        prompt: request.prompt,
        systemPrompt: effective.systemPrompt,
        response: reasoned.text,
      })
      return {
        text: reasoned.text,
        turnId: reasoned.turnId,
        metadata: {
          reasonerKind: reasoned.reasoner.kind,
          reasonerLabel: reasoned.reasoner.label,
          workerRole: role,
          effectiveMaxTokens: effective.maxTokens ?? null,
        },
      }
    },
  }
}

export function createPrimaryCosReasoningWorker(): CosReasoningWorker | null {
  return createOpenModelWorker('primary')
}

export function createDefaultCosReasoningEngine(): CosReasoningEngine {
  const roles: CosSpecialistRole[] = ['primary', 'coder', 'critic', 'verifier', 'researcher']
  const workers = roles.map(createOpenModelWorker).filter(Boolean) as CosReasoningWorker[]
  return new CosReasoningEngine(workers)
}

async function routingDecision(args: LocalModelCallArgs, options: {
  requestedRole?: CosReasoningWorkerRole
  forcePrimary?: boolean
}): Promise<CosReasoningRoleDecision> {
  const evaluation = currentReasoningEvaluationContext()
  if (evaluation) {
    const objective = selectCosReasoningWorkerRole(args.prompt).objective
    return {
      role: evaluation.workerRole,
      reason: `controlled_comparison:${evaluation.candidateId}`,
      objective,
    }
  }
  if (options.forcePrimary === true) {
    return { role: 'primary', reason: 'explicit_primary_override', objective: args.prompt }
  }
  if (options.requestedRole && options.requestedRole !== 'primary') {
    return { role: options.requestedRole, reason: 'explicit_specialist_request', objective: args.prompt }
  }

  const deterministic = selectCosReasoningWorkerRole(args.prompt)
  const resolved = resolveCosReasoner()
  if (!resolved.config) return deterministic
  const learned = await learnedRoutingOverride({
    prompt: deterministic.objective,
    currentReasonerLabel: resolved.config.label,
    deterministicRole: deterministic.role,
  })
  if (!learned || learned.workerRole === deterministic.role) return deterministic

  return {
    role: learned.workerRole,
    reason: `outcome_learned:${deterministic.role}->${learned.workerRole}`,
    objective: deterministic.objective,
  }
}

/**
 * Provider-neutral entrypoint. `primary` at the compatibility boundary means COS owns routing and
 * may select a bounded specialist. Callers that truly require the primary worker can set
 * forcePrimary=true. Closed-model escalation remains separately controlled and defaults off.
 */
export async function reasonThroughCosControlPlane(
  args: LocalModelCallArgs,
  options: {
    requestedRole?: CosReasoningWorkerRole
    allowExternalEscalation?: boolean
    forcePrimary?: boolean
  } = {},
) {
  const decision = await routingDecision(args, options)
  const execution = await createDefaultCosReasoningEngine().run({
    ...args,
    requestedRole: decision.role,
    allowExternalEscalation: options.allowExternalEscalation,
  })
  if (!execution) return null
  const evaluation = currentReasoningEvaluationContext()
  const metadata: Record<string, unknown> = {
    ...(execution.result.metadata ?? {}),
    routingRole: decision.role,
    routingReason: decision.reason,
    routingObjective: decision.objective.slice(0, 500),
    ...(evaluation ? {
      controlledComparison: true,
      comparisonRunId: evaluation.runId,
      comparisonCandidateId: evaluation.candidateId,
    } : {}),
  }
  return {
    ...execution,
    result: {
      ...execution.result,
      metadata,
    },
  }
}
