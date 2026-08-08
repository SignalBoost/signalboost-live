import { createCapabilityGuard } from './guard.ts'
import { CosLeaderRuntime, type CosLeadershipState, type CosLeadershipTickResult } from './leaderRuntime.ts'
import { createModelBackedAutonomyBrain } from './modelBrain.ts'
import { createModelMissionDirector, type CosMission } from './missionDirector.ts'
import { HttpUniversalPortableRuntime, type PortableHttpEndpointConfig } from './httpPortableRuntime.ts'
import {
  applyMissionTick,
  createMissionLifecycleState,
  isTerminalMissionStatus,
  type CosMissionCompletionPolicy,
  type CosMissionLifecycleState,
} from './missionLifecycle.ts'

export interface CosLiveMissionBinding {
  portable: PortableHttpEndpointConfig
  mission: CosMission
  autonomy?: {
    maxCycles?: number
    maxConsecutiveFailures?: number
    maxRepeatedState?: number
    minimumPlanConfidence?: number
    requireEvidence?: boolean
    allowLowRiskReversibleWithoutApproval?: boolean
  }
  lifecycle?: {
    maxIterations?: number
    maxConsecutiveFailures?: number
    completionPolicy?: CosMissionCompletionPolicy
  }
}

export interface CosLivePersistentState extends CosLeadershipState {
  lifecycle: CosMissionLifecycleState
}

export interface CosLiveTickStateStore {
  load(missionId: string): Promise<CosLivePersistentState | undefined>
  save(missionId: string, state: CosLivePersistentState): Promise<void>
}

export class InMemoryCosLiveTickStateStore implements CosLiveTickStateStore {
  private readonly map = new Map<string, CosLivePersistentState>()
  async load(missionId: string) { return this.map.get(missionId) }
  async save(missionId: string, state: CosLivePersistentState) { this.map.set(missionId, state) }
}

function parseJsonEnv<T>(name: string): T | undefined {
  const raw = process.env[name]?.trim()
  if (!raw) return undefined
  try { return JSON.parse(raw) as T } catch { throw new Error(`${name}_invalid_json`) }
}

export function loadCosLiveMissionBindings(): CosLiveMissionBinding[] {
  const bindings = parseJsonEnv<CosLiveMissionBinding[]>('COS_AUTONOMY_MISSIONS') ?? []
  if (!Array.isArray(bindings)) throw new Error('COS_AUTONOMY_MISSIONS_must_be_array')
  const ids = new Set<string>()
  for (const binding of bindings) {
    if (!binding?.mission?.missionId || !binding?.mission?.purpose) throw new Error('cos_autonomy_mission_invalid')
    if (ids.has(binding.mission.missionId)) throw new Error(`cos_autonomy_duplicate_mission:${binding.mission.missionId}`)
    ids.add(binding.mission.missionId)
    if (!binding.portable?.portableId || !binding.portable?.baseUrl) throw new Error(`cos_autonomy_portable_binding_invalid:${binding.mission.missionId}`)
  }
  return bindings
}

export interface CosLiveTickResult extends CosLeadershipTickResult {
  lifecycle: CosMissionLifecycleState
  shouldContinue: boolean
}

/**
 * Re-entrant COS mission tick. HTTP/serverless lifetime is deliberately irrelevant:
 * every invocation loads durable state, advances one bounded unit of work, persists the
 * new mission state, and tells the scheduler whether another tick is required.
 */
export async function runCosLiveTick(input: {
  binding: CosLiveMissionBinding
  stateStore: CosLiveTickStateStore
  killSwitch?: () => Promise<boolean> | boolean
  modelPreference?: 'claude' | 'openai' | 'local'
}): Promise<CosLiveTickResult> {
  const previous = await input.stateStore.load(input.binding.mission.missionId)
  const lifecycle = previous?.lifecycle ?? createMissionLifecycleState(input.binding.mission, input.binding.lifecycle)

  // Terminal missions are idempotent. A scheduler may safely call again; COS does no work.
  if (isTerminalMissionStatus(lifecycle.status)) {
    const terminalDecision = previous?.recentDecisions?.at(-1)
    if (!terminalDecision) throw new Error(`cos_terminal_mission_missing_decision:${input.binding.mission.missionId}`)
    return {
      missionId: input.binding.mission.missionId,
      portableId: input.binding.portable.portableId,
      observed: {
        observedAt: lifecycle.updatedAt,
        summary: lifecycle.lastSummary,
        facts: { lifecycleStatus: lifecycle.status },
        evidenceIds: lifecycle.evidenceIds,
        stateFingerprint: `terminal:${lifecycle.status}:${lifecycle.updatedAt}`,
      },
      decision: terminalDecision,
      status: 'stopped',
      summary: lifecycle.lastSummary,
      lifecycle,
      shouldContinue: false,
    }
  }

  const portable = new HttpUniversalPortableRuntime(input.binding.portable)
  const director = createModelMissionDirector({ modelPreference: input.modelPreference })
  const brain = createModelBackedAutonomyBrain({ modelPreference: input.modelPreference })
  const guard = createCapabilityGuard({
    killSwitch: input.killSwitch,
    allowLowRiskReversibleWithoutApproval: input.binding.autonomy?.allowLowRiskReversibleWithoutApproval === true,
  })
  const runtime = new CosLeaderRuntime({
    portable,
    director,
    brain,
    guard,
    autonomyPolicy: input.binding.autonomy,
  })

  const result = await runtime.tick({
    mission: input.binding.mission,
    state: previous,
    runId: `cos-live-${input.binding.mission.missionId}-${Date.now()}`,
  })
  const nextLifecycle = applyMissionTick(lifecycle, result)
  const recentDecisions = [...(previous?.recentDecisions ?? []), result.decision].slice(-20)
  await input.stateStore.save(input.binding.mission.missionId, {
    missionId: input.binding.mission.missionId,
    recentDecisions,
    lifecycle: nextLifecycle,
  })

  const shouldContinue = !isTerminalMissionStatus(nextLifecycle.status)
    && nextLifecycle.status !== 'WAITING_FOR_APPROVAL'

  return { ...result, lifecycle: nextLifecycle, shouldContinue }
}
