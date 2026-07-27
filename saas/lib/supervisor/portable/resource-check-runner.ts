// saas/lib/supervisor/portable/resource-check-runner.ts
//
// READ-ONLY EXECUTION, WITHOUT HANDING AN ATTACKER A LEVER.
//
// The obvious way to execute a triage step is to take the resource named in the alert
// and go look at it. That is server-side request forgery with extra steps: an alert
// is attacker-influenced input, so a runner that dereferences whatever it names will
// happily fetch a cloud metadata endpoint, an internal admin API, or anything else
// reachable from the buyer's network — and it will do it with the buyer's own egress.
// An allowlist of URLs only narrows that; it does not remove it.
//
// So the incident NEVER supplies a target. The buyer REGISTERS checks up front, each
// with its own already-known target, and the resource named in an alert is used for
// exactly one thing: a lookup. An unrecognised resource finds no check and the step
// reports that it could not be checked. Attacker-supplied strings reach a map lookup
// and nothing else — there is no code path from incident text to a network address.
//
// The second rule, enforced rather than assumed: this can only READ. The executor
// below refuses any step that is not a read, even though the policy engine already
// gates mutations. Two independent refusals, because the cost of being wrong here is
// a repair tool that modifies a Fortune-500 buyer's production system.

import type { ExecutionResult, Executor } from '../execution-contracts.ts'
import type { SerializableValue } from '../incident-schema.ts'
import type { RepairStep } from '../repair-plan-schema.ts'

export const READ_ONLY_ACTIONS = Object.freeze(['read', 'verify', 'stop'] as const)

export const CHECK_DEFAULTS = Object.freeze({
  timeoutMs: 10_000,
  maxResponseBytes: 64 * 1024,
})

export interface CheckOutcome {
  ok: boolean
  summary: string
  data?: Record<string, SerializableValue>
}

export interface ResourceCheckContext {
  resource: string
  shape: string
  step: RepairStep
}

export interface ResourceCheck {
  readonly checkId: string
  // Given the resource named in an alert, does this check apply? A buyer writes this
  // as an exact match, a prefix, or a pattern over THEIR OWN resource naming.
  matches(resource: string): boolean
  run(context: ResourceCheckContext): Promise<CheckOutcome> | CheckOutcome
}

export class ResourceCheckConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'ResourceCheckConfigError' }
}

const resourceOf = (step: RepairStep): string => {
  const value = (step.parameters as Record<string, unknown>)?.target
  return typeof value === 'string' ? value : ''
}

const shapeOf = (step: RepairStep): string => {
  const value = (step.parameters as Record<string, unknown>)?.shape
  return typeof value === 'string' ? value : 'unclassified'
}

// ── The runner ───────────────────────────────────────────────────────────────
export interface ResourceCheckRunnerOptions {
  checks: ResourceCheck[]
  timeoutMs?: number
}

export function createResourceCheckRunner(options: ResourceCheckRunnerOptions) {
  const checks = Array.isArray(options.checks) ? [...options.checks] : []
  const seen = new Set<string>()
  for (const check of checks) {
    if (!check?.checkId?.trim()) throw new ResourceCheckConfigError('every check needs a checkId')
    if (typeof check.matches !== 'function' || typeof check.run !== 'function') throw new ResourceCheckConfigError(`${check.checkId}: matches and run are required`)
    if (seen.has(check.checkId)) throw new ResourceCheckConfigError(`duplicate checkId: ${check.checkId}`)
    seen.add(check.checkId)
  }
  const timeoutMs = options.timeoutMs ?? CHECK_DEFAULTS.timeoutMs

  return async (step: RepairStep): Promise<CheckOutcome> => {
    const resource = resourceOf(step)
    if (!resource) return { ok: false, summary: 'the step named no resource, so no check could be selected' }

    const check = checks.find(candidate => {
      // A check whose matcher throws must not take the whole run down, and must not
      // be treated as a match either.
      try { return candidate.matches(resource) } catch { return false }
    })
    // The load-bearing branch. No registered check means we do not know how to look at
    // this thing — NOT that we should go and find out.
    if (!check) return { ok: false, summary: `no check is registered for ${resource}` }

    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        Promise.resolve().then(() => check.run({ resource, shape: shapeOf(step), step })),
        new Promise<CheckOutcome>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`check ${check.checkId} timed out after ${timeoutMs}ms`)), timeoutMs) }),
      ])
    } catch (error) {
      return { ok: false, summary: error instanceof Error ? error.message : `check ${check.checkId} failed` }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

// ── A reference HTTP check ───────────────────────────────────────────────────
// The URL is a CONSTRUCTOR argument. It comes from the buyer's configuration and
// never from an incident, which is the whole point — this factory is the only place a
// network address enters the system, and an alert cannot reach it.
export interface HttpResourceCheckOptions {
  checkId: string
  url: string
  matches: (resource: string) => boolean
  headers?: Record<string, string>
  expectStatus?: number[]
  maxResponseBytes?: number
  fetchImpl?: typeof fetch
}

export function createHttpResourceCheck(options: HttpResourceCheckOptions): ResourceCheck {
  if (!options.checkId?.trim()) throw new ResourceCheckConfigError('checkId is required')
  if (typeof options.matches !== 'function') throw new ResourceCheckConfigError(`${options.checkId}: matches is required`)
  let parsed: URL
  try { parsed = new URL(options.url) } catch { throw new ResourceCheckConfigError(`${options.checkId}: url must be absolute`) }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new ResourceCheckConfigError(`${options.checkId}: only http and https are supported`)

  const expectStatus = options.expectStatus ?? [200, 204]
  const maxResponseBytes = options.maxResponseBytes ?? CHECK_DEFAULTS.maxResponseBytes

  return {
    checkId: options.checkId,
    matches: options.matches,
    async run() {
      const doFetch = options.fetchImpl ?? fetch
      const response = await doFetch(parsed.toString(), {
        method: 'GET',
        headers: options.headers ?? {},
        // Never follow redirects. A configured URL that redirects is a way back to
        // an address the operator did not choose, and a 3xx is itself an observation
        // worth reporting rather than chasing.
        redirect: 'manual',
      })

      const status = response.status
      const body = await response.text().catch(() => '')
      const truncated = body.length > maxResponseBytes
      const excerpt = truncated ? `${body.slice(0, maxResponseBytes)}…` : body

      return {
        ok: expectStatus.includes(status),
        summary: `${parsed.host} responded ${status}`,
        data: { status, bodyExcerpt: excerpt, truncated },
      }
    },
  }
}

// ── The executor ─────────────────────────────────────────────────────────────
// The orchestrator has always required an Executor and there was no implementation
// anywhere — the same gap the Verifier had. This one executes only reads.
export interface ReadOnlyExecutorOptions {
  runner: (step: RepairStep) => Promise<CheckOutcome> | CheckOutcome
  now?: () => Date
}

export function createReadOnlyExecutor(options: ReadOnlyExecutorOptions): Executor {
  if (typeof options.runner !== 'function') throw new ResourceCheckConfigError('a runner is required')
  const now = options.now ?? (() => new Date())

  return {
    async execute({ plan, approvedStepIds }): Promise<ExecutionResult> {
      const startedAt = now().toISOString()
      const approved = new Set(approvedStepIds)
      const steps = plan.steps.filter(step => approved.has(step.stepId))

      // Defence in depth. Policy already refuses to approve a mutation, but this
      // executor is the thing holding real access, so it refuses independently. If
      // these two ever disagree, the safe one wins.
      const mutating = steps.filter(step => !(READ_ONLY_ACTIONS as readonly string[]).includes(step.action))
      if (mutating.length > 0) {
        return {
          status: 'failed',
          executedStepIds: [],
          startedAt,
          finishedAt: now().toISOString(),
          summary: `refused: this executor runs read-only steps and the approved scope contained ${mutating.map(step => `${step.stepId}(${step.action})`).join(', ')}`,
        }
      }

      const executedStepIds: string[] = []
      const summaries: string[] = []
      let anyFailed = false

      for (const step of steps) {
        if (step.action === 'stop') { summaries.push(`${step.stepId}: stop`); executedStepIds.push(step.stepId); continue }
        let outcome: CheckOutcome
        try { outcome = await options.runner(step) } catch (error) { outcome = { ok: false, summary: error instanceof Error ? error.message : 'check threw' } }
        // A step that ran and reported a problem is still a step that RAN — the
        // observation is the point. Only the summary records whether it looked healthy.
        executedStepIds.push(step.stepId)
        summaries.push(`${step.stepId}: ${outcome.summary}`)
        if (!outcome.ok) anyFailed = true
      }

      return {
        status: executedStepIds.length === 0 ? 'failed' : 'completed',
        executedStepIds,
        startedAt,
        finishedAt: now().toISOString(),
        summary: executedStepIds.length === 0 ? 'no approved steps to execute' : summaries.join(' | '),
        metadata: { observationsGathered: executedStepIds.length, anyObservationUnhealthy: anyFailed },
      }
    },
  }
}
