import type {
  CosAutonomyBrain,
  CosAutonomyCycleRecord,
  CosAutonomyGuard,
  CosAutonomyPlan,
  CosAutonomyPolicy,
  CosAutonomyRunResult,
  CosProposedAction,
  PortableCapabilityDescriptor,
  PortableManifest,
  UniversalPortableRuntime,
} from './types.ts'

const DEFAULT_POLICY: CosAutonomyPolicy = {
  maxCycles: 8,
  maxConsecutiveFailures: 2,
  maxRepeatedState: 2,
  minimumPlanConfidence: 0.65,
  requireEvidence: true,
}

function now(): string { return new Date().toISOString() }

function capabilityMap(manifest: PortableManifest): Map<string, PortableCapabilityDescriptor> {
  return new Map(manifest.capabilities.map(capability => [capability.capabilityId, capability]))
}

function validateManifest(manifest: PortableManifest): void {
  if (!manifest.portableId?.trim()) throw new Error('portable_manifest_missing_id')
  if (!manifest.portableVersion?.trim()) throw new Error('portable_manifest_missing_version')
  const seen = new Set<string>()
  for (const capability of manifest.capabilities) {
    if (!capability.capabilityId?.trim()) throw new Error('portable_capability_missing_id')
    if (seen.has(capability.capabilityId)) throw new Error(`duplicate_portable_capability:${capability.capabilityId}`)
    seen.add(capability.capabilityId)
    if (capability.riskClass === 'forbidden' && !capability.requiresApproval) throw new Error(`forbidden_capability_must_be_gated:${capability.capabilityId}`)
    if (capability.readOnly && capability.reversible) throw new Error(`read_only_capability_cannot_be_reversible:${capability.capabilityId}`)
  }
}

function validatePlan(plan: CosAutonomyPlan, manifest: PortableManifest, policy: CosAutonomyPolicy): void {
  if (!plan.planId?.trim()) throw new Error('autonomy_plan_missing_id')
  if (!Number.isFinite(plan.confidence) || plan.confidence < 0 || plan.confidence > 1) throw new Error('autonomy_plan_invalid_confidence')
  if (plan.confidence < policy.minimumPlanConfidence) throw new Error('autonomy_plan_confidence_below_floor')
  if (!plan.actions.length) throw new Error('autonomy_plan_has_no_actions')
  const capabilities = capabilityMap(manifest)
  const actionIds = new Set<string>()
  for (const action of plan.actions) {
    if (!action.actionId?.trim()) throw new Error('autonomy_action_missing_id')
    if (actionIds.has(action.actionId)) throw new Error(`duplicate_autonomy_action:${action.actionId}`)
    actionIds.add(action.actionId)
    const capability = capabilities.get(action.capabilityId)
    if (!capability) throw new Error(`unknown_portable_capability:${action.capabilityId}`)
    if (capability.riskClass === 'forbidden') throw new Error(`forbidden_portable_capability:${action.capabilityId}`)
  }
}

function repeatedStateCount(cycles: readonly CosAutonomyCycleRecord[], fingerprint: string): number {
  return cycles.filter(cycle => cycle.observation.stateFingerprint === fingerprint).length
}

function summarizeStop(reason: CosAutonomyRunResult['stopReason'], detail: string): string {
  return `${reason}: ${detail}`
}

export class CosAutonomousRuntime {
  private readonly portable: UniversalPortableRuntime
  private readonly brain: CosAutonomyBrain
  private readonly guard: CosAutonomyGuard
  private readonly policy: CosAutonomyPolicy

  constructor(input: {
    portable: UniversalPortableRuntime
    brain: CosAutonomyBrain
    guard: CosAutonomyGuard
    policy?: Partial<CosAutonomyPolicy>
  }) {
    this.portable = input.portable
    this.brain = input.brain
    this.guard = input.guard
    this.policy = { ...DEFAULT_POLICY, ...(input.policy || {}) }
  }

  async run(input: { runId: string; objective: string }): Promise<CosAutonomyRunResult> {
    const objective = input.objective?.trim()
    if (!objective) throw new Error('autonomy_objective_required')

    const manifest = await this.portable.getManifest()
    validateManifest(manifest)

    const cycles: CosAutonomyCycleRecord[] = []
    let consecutiveFailures = 0

    for (let cycle = 1; cycle <= this.policy.maxCycles; cycle += 1) {
      const startedAt = now()
      if (await this.guard.isKillSwitchEngaged()) {
        return { runId: input.runId, portableId: manifest.portableId, objective, status: 'stopped', stopReason: 'kill_switch', summary: summarizeStop('kill_switch', 'Autonomous execution is disabled.'), cycles }
      }

      let observation
      try {
        observation = await this.portable.observe({ objective })
      } catch (error) {
        return { runId: input.runId, portableId: manifest.portableId, objective, status: 'stopped', stopReason: 'adapter_failure', summary: summarizeStop('adapter_failure', error instanceof Error ? error.message : 'Observation failed.'), cycles }
      }

      if (this.policy.requireEvidence && observation.evidenceIds.length === 0) {
        return { runId: input.runId, portableId: manifest.portableId, objective, status: 'stopped', stopReason: 'blocked', summary: summarizeStop('blocked', 'Portable returned no evidence for an evidence-required autonomous run.'), cycles }
      }

      if (repeatedStateCount(cycles, observation.stateFingerprint) >= this.policy.maxRepeatedState) {
        return { runId: input.runId, portableId: manifest.portableId, objective, status: 'stopped', stopReason: 'no_progress', summary: summarizeStop('no_progress', 'The portable state repeated without verified progress.'), cycles }
      }

      let plan: CosAutonomyPlan
      try {
        plan = await this.brain.plan({ objective, manifest, observation, cycle, previousCycles: cycles })
        validatePlan(plan, manifest, this.policy)
      } catch (error) {
        cycles.push({ cycle, observation, startedAt, finishedAt: now() })
        return { runId: input.runId, portableId: manifest.portableId, objective, status: 'stopped', stopReason: 'blocked', summary: summarizeStop('blocked', error instanceof Error ? error.message : 'Planning failed closed.'), cycles }
      }

      const results = []
      for (const action of plan.actions) {
        if (await this.guard.isKillSwitchEngaged()) {
          cycles.push({ cycle, observation, plan, results, startedAt, finishedAt: now() })
          return { runId: input.runId, portableId: manifest.portableId, objective, status: 'stopped', stopReason: 'kill_switch', summary: summarizeStop('kill_switch', 'Kill switch engaged before the next action.'), cycles }
        }

        const admission = await this.guard.authorize({ manifest, action })
        if (admission.outcome === 'blocked') {
          cycles.push({ cycle, observation, plan, results, startedAt, finishedAt: now() })
          return { runId: input.runId, portableId: manifest.portableId, objective, status: 'stopped', stopReason: 'blocked', summary: summarizeStop('blocked', admission.reason), cycles }
        }
        if (admission.outcome === 'approval_required') {
          cycles.push({ cycle, observation, plan, results, startedAt, finishedAt: now() })
          return { runId: input.runId, portableId: manifest.portableId, objective, status: 'stopped', stopReason: 'approval_required', summary: summarizeStop('approval_required', admission.reason), cycles }
        }

        const result = await this.portable.invoke({ objective, action })
        results.push(result)
        if (result.status === 'approval_required') {
          cycles.push({ cycle, observation, plan, results, startedAt, finishedAt: now() })
          return { runId: input.runId, portableId: manifest.portableId, objective, status: 'stopped', stopReason: 'approval_required', summary: summarizeStop('approval_required', result.summary), cycles }
        }
        if (result.status === 'blocked') {
          cycles.push({ cycle, observation, plan, results, startedAt, finishedAt: now() })
          return { runId: input.runId, portableId: manifest.portableId, objective, status: 'stopped', stopReason: 'blocked', summary: summarizeStop('blocked', result.summary), cycles }
        }
        if (result.status === 'failed') break
      }

      const verification = await this.portable.verify({ objective, observation, plan, results })
      if (verification.status === 'verified' && verification.goalSatisfied) {
        cycles.push({ cycle, observation, plan, results, verification, startedAt, finishedAt: now() })
        return { runId: input.runId, portableId: manifest.portableId, objective, status: 'completed', stopReason: 'goal_satisfied', summary: verification.summary, cycles }
      }

      consecutiveFailures += 1
      let recovery
      if (this.portable.recover) {
        recovery = await this.portable.recover({ objective, observation, plan, results, verification })
      }
      cycles.push({ cycle, observation, plan, results, verification, recovery, startedAt, finishedAt: now() })

      if (recovery?.status === 'failed') consecutiveFailures += 1
      if (consecutiveFailures >= this.policy.maxConsecutiveFailures) {
        return { runId: input.runId, portableId: manifest.portableId, objective, status: 'stopped', stopReason: 'max_failures', summary: summarizeStop('max_failures', verification.summary), cycles }
      }
    }

    return { runId: input.runId, portableId: manifest.portableId, objective, status: 'stopped', stopReason: 'max_cycles', summary: summarizeStop('max_cycles', 'Cycle budget exhausted without verified goal completion.'), cycles }
  }
}

export function actionCapability(manifest: PortableManifest, action: CosProposedAction): PortableCapabilityDescriptor {
  const capability = capabilityMap(manifest).get(action.capabilityId)
  if (!capability) throw new Error(`unknown_portable_capability:${action.capabilityId}`)
  return capability
}
