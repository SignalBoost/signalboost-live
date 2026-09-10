import { readCosUniversityAgentAcademicRecord } from './cosUniversityAgentAcademicRecordRuntime.ts'
import { runCosUniversityAdmission } from './cosUniversityAdmissionRunner.ts'
import { listCosUniversityRegisteredAgents } from './cosUniversityAgentRegistry.ts'
import { runCosUniversityIndependentExamBatch } from './cosUniversityIndependentExamRunner.ts'
import { runCosUniversityContinuousLearning } from './cosUniversityContinuousLearning.ts'
import { runCosUniversityDeliberatePractice } from './cosUniversityDeliberatePracticeRunner.ts'
import { decideCosUniversityNextAcademicAction, type CosUniversityNextAcademicAction } from './cosUniversityAgentAcademicProgression.ts'

export type CosUniversityAutonomousAgentCycleSummary = Readonly<{
  enabled: boolean
  registered: number
  processed: number
  agents: readonly Readonly<{ agentId: string; role: string; admitted: boolean; nextAction: CosUniversityNextAcademicAction | 'error'; completionRatio: number | null; error: string | null }>[]
  errors: readonly string[]
  semantics: 'registered_agents_are_automatically_enrolled_and_academically_routed'
}>

/** Bounded host cycle. It enrolls every registered identity and routes its next academic action. */
export async function runCosUniversityAutonomousAgentCycle(options: { now?: Date; maxAgents?: number } = {}): Promise<CosUniversityAutonomousAgentCycleSummary> {
  if (process.env.COS_UNIVERSITY_AUTONOMOUS_AGENT_CYCLE_ENABLED !== 'true') {
    return { enabled: false, registered: 0, processed: 0, agents: [], errors: [], semantics: 'registered_agents_are_automatically_enrolled_and_academically_routed' }
  }
  const now = options.now instanceof Date ? options.now : new Date()
  const registered = await listCosUniversityRegisteredAgents(options.maxAgents ?? 25)
  const agents: Array<CosUniversityAutonomousAgentCycleSummary['agents'][number]> = []
  const errors: string[] = []
  for (const agent of registered) {
    try {
      const admission = await runCosUniversityAdmission({ now, agentId: agent.agentId, role: agent.role })
      if (admission.errors.length) throw new Error(admission.errors.join('; '))
      const record = await readCosUniversityAgentAcademicRecord(agent.agentId)
      const nextAction = decideCosUniversityNextAcademicAction(record)
      if (nextAction === 'independent_exam') {
        const exam = await runCosUniversityIndependentExamBatch({ now, agentId: agent.agentId, maxExams: 2 })
        if (exam.errors.length) throw new Error(exam.errors.join('; '))
      } else if (nextAction === 'study' || nextAction === 'remediate') {
        const learning = await runCosUniversityContinuousLearning({ now, agentId: agent.agentId, maxStudyPlans: 4 })
        if (learning.status === 'error') throw new Error(learning.errors.join('; ') || 'continuous_learning_failed')
        // The learning slot is agent-scoped, but an already-accepted study proof can predate this
        // invocation. Practice eligibility belongs to that durable proof, not to whether this tick
        // happened to acquire another document.
        const practice = await runCosUniversityDeliberatePractice({ agentId: agent.agentId, maxPlans: 1, maxExercises: 2 })
        if (practice.errors.length) throw new Error(practice.errors.join('; '))
      }
      agents.push({ agentId: agent.agentId, role: agent.role, admitted: admission.admitted, nextAction, completionRatio: record.completionRatio, error: null })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${agent.agentId}:${message}`)
      agents.push({ agentId: agent.agentId, role: agent.role, admitted: false, nextAction: 'error', completionRatio: null, error: message })
    }
  }
  return { enabled: true, registered: registered.length, processed: agents.length, agents, errors, semantics: 'registered_agents_are_automatically_enrolled_and_academically_routed' }
}
