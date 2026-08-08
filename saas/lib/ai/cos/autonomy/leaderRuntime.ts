import { CosAutonomousRuntime } from './runtime.ts'
import type { CosAutonomyBrain, CosAutonomyGuard, CosAutonomyPolicy, CosAutonomyRunResult, PortableObservation, UniversalPortableRuntime } from './types.ts'
import type { CosMission, CosMissionDecision, CosMissionDirector } from './missionDirector.ts'

export interface CosLeadershipState {
  missionId: string
  recentDecisions: readonly CosMissionDecision[]
}

export interface CosLeadershipTickResult {
  missionId: string
  portableId: string
  observed: PortableObservation
  decision: CosMissionDecision
  actionRun?: CosAutonomyRunResult
  status: 'monitoring' | 'acted' | 'stopped'
  summary: string
}

/**
 * COS leadership is intentionally tick-based. A Vercel cron/event can call tick(), while
 * a physical portable can call it from a resident service loop. The intelligence and
 * governance are identical in both deployment models.
 */
export class CosLeaderRuntime {
  private readonly portable: UniversalPortableRuntime
  private readonly director: CosMissionDirector
  private readonly brain: CosAutonomyBrain
  private readonly guard: CosAutonomyGuard
  private readonly autonomyPolicy?: Partial<CosAutonomyPolicy>

  constructor(input: {
    portable: UniversalPortableRuntime
    director: CosMissionDirector
    brain: CosAutonomyBrain
    guard: CosAutonomyGuard
    autonomyPolicy?: Partial<CosAutonomyPolicy>
  }) {
    this.portable = input.portable
    this.director = input.director
    this.brain = input.brain
    this.guard = input.guard
    this.autonomyPolicy = input.autonomyPolicy
  }

  async tick(input: { mission: CosMission; state?: CosLeadershipState; runId: string }): Promise<CosLeadershipTickResult> {
    const manifest = await this.portable.getManifest()
    if (await this.guard.isKillSwitchEngaged()) {
      const observed = await this.portable.observe({ objective: input.mission.purpose })
      const decision: CosMissionDecision = {
        decisionId: `kill-switch-${Date.now()}`,
        objective: '',
        priority: 'critical',
        rationale: 'Autonomous execution is disabled by the kill switch.',
        evidenceIds: observed.evidenceIds,
        shouldAct: false,
        confidence: 1,
      }
      return { missionId: input.mission.missionId, portableId: manifest.portableId, observed, decision, status: 'stopped', summary: decision.rationale }
    }

    const observed = await this.portable.observe({ objective: input.mission.purpose })
    const recentDecisions = input.state?.missionId === input.mission.missionId ? input.state.recentDecisions : []
    const decision = await this.director.decide({ mission: input.mission, manifest, observation: observed, recentDecisions })

    if (!decision.shouldAct) {
      return {
        missionId: input.mission.missionId,
        portableId: manifest.portableId,
        observed,
        decision,
        status: 'monitoring',
        summary: decision.rationale || 'COS assessed the mission and found no justified action for this tick.',
      }
    }

    const runtime = new CosAutonomousRuntime({ portable: this.portable, brain: this.brain, guard: this.guard, policy: this.autonomyPolicy })
    const actionRun = await runtime.run({ runId: input.runId, objective: decision.objective })
    return {
      missionId: input.mission.missionId,
      portableId: manifest.portableId,
      observed,
      decision,
      actionRun,
      status: actionRun.status === 'completed' ? 'acted' : 'stopped',
      summary: actionRun.summary,
    }
  }
}
