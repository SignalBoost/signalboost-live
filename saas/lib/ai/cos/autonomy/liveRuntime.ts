import { createCapabilityGuard } from './guard.ts'
import { CosLeaderRuntime, type CosLeadershipState, type CosLeadershipTickResult } from './leaderRuntime.ts'
import { createModelBackedAutonomyBrain } from './modelBrain.ts'
import { createModelMissionDirector, type CosMission } from './missionDirector.ts'
import { HttpUniversalPortableRuntime, type PortableHttpEndpointConfig } from './httpPortableRuntime.ts'

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
}

export interface CosLiveTickStateStore {
  load(missionId: string): Promise<CosLeadershipState | undefined>
  save(missionId: string, state: CosLeadershipState): Promise<void>
}

export class InMemoryCosLiveTickStateStore implements CosLiveTickStateStore {
  private readonly map = new Map<string, CosLeadershipState>()
  async load(missionId: string) { return this.map.get(missionId) }
  async save(missionId: string, state: CosLeadershipState) { this.map.set(missionId, state) }
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

export async function runCosLiveTick(input: {
  binding: CosLiveMissionBinding
  stateStore: CosLiveTickStateStore
  killSwitch?: () => Promise<boolean> | boolean
  modelPreference?: 'claude' | 'openai' | 'local'
}): Promise<CosLeadershipTickResult> {
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
  const previous = await input.stateStore.load(input.binding.mission.missionId)
  const result = await runtime.tick({
    mission: input.binding.mission,
    state: previous,
    runId: `cos-live-${input.binding.mission.missionId}-${Date.now()}`,
  })
  const recentDecisions = [...(previous?.recentDecisions ?? []), result.decision].slice(-20)
  await input.stateStore.save(input.binding.mission.missionId, {
    missionId: input.binding.mission.missionId,
    recentDecisions,
  })
  return result
}
