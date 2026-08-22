import { callRawCosReasoner, resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import type { LocalModelCallArgs } from '@/lib/ai/local-inference'
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
  if (role === 'primary') return request.systemPrompt
  return [request.systemPrompt, ROLE_GUIDANCE[role]].filter(Boolean).join('\n\n')
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
      const reasoned = await callRawCosReasoner(effective)
      if (!reasoned?.text) return null
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

function routingDecision(args: LocalModelCallArgs, options: {
  requestedRole?: CosReasoningWorkerRole
  forcePrimary?: boolean
}): CosReasoningRoleDecision {
  if (options.forcePrimary === true) {
    return { role: 'primary', reason: 'explicit_primary_override', objective: args.prompt }
  }
  if (options.requestedRole && options.requestedRole !== 'primary') {
    return { role: options.requestedRole, reason: 'explicit_specialist_request', objective: args.prompt }
  }
  return selectCosReasoningWorkerRole(args.prompt)
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
  const decision = routingDecision(args, options)
  const execution = await createDefaultCosReasoningEngine().run({
    ...args,
    requestedRole: decision.role,
    allowExternalEscalation: options.allowExternalEscalation,
  })
  if (!execution) return null
  const metadata: Record<string, unknown> = {
    ...(execution.result.metadata ?? {}),
    routingRole: decision.role,
    routingReason: decision.reason,
    routingObjective: decision.objective.slice(0, 500),
  }
  return {
    ...execution,
    result: {
      ...execution.result,
      metadata,
    },
  }
}
