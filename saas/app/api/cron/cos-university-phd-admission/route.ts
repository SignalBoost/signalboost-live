import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityPhdAdmissionForAgent } from '@/lib/ai/cos/cosUniversityPhdAgentRunner'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { readCosUniversityDailyLaneCadence } from '@/lib/ai/cos/cosUniversityDailyLaneCadence'
import { listCosUniversityRegisteredAgents } from '@/lib/ai/cos/cosUniversityAgentRegistry'
import { rotatePhdAgents } from '@/lib/ai/cos/cosUniversityPhdAgentScope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (process.env.COS_UNIVERSITY_PHD_RUNTIME_ENABLED !== 'true') {
    await recordCosUniversityProductionPath({ path: 'phd_runtime', invocationSucceeded: true, evidence: { enabled: false, semantics: 'phd_runtime_fail_closed' } })
    await recordCosUniversityProductionPath({ path: 'phd_admission', invocationSucceeded: true, evidence: { enabled: false, admitted: false, semantics: 'phd_runtime_fail_closed' } })
    return NextResponse.json({ ok: true, enabled: false, admitted: false, semantics: 'phd_runtime_fail_closed' })
  }
  try {
    const now = new Date()
    const agents = rotatePhdAgents(await listCosUniversityRegisteredAgents(), now, 1)
    if (!agents.length) throw new Error('no_registered_phd_agents')

    const notDue: Array<Record<string, unknown>> = []
    for (const agent of agents) {
      const cadence = await readCosUniversityDailyLaneCadence('phd_admission', now, agent.agentId)
      if (!cadence.due) {
        notDue.push({ agentId: agent.agentId, role: agent.role, cadence })
        continue
      }

      const result = await runCosUniversityPhdAdmissionForAgent(now, agent.agentId)
      const evidence = { agentId: agent.agentId, role: agent.role, cadence, ...result }
      await recordCosUniversityProductionPath({ path: 'phd_runtime', invocationSucceeded: result.errors.length === 0, evidence })
      await recordCosUniversityProductionPath({ path: 'phd_admission', invocationSucceeded: result.errors.length === 0, evidence })
      return NextResponse.json({ ok: result.errors.length === 0, enabled: true, ...evidence }, { status: result.errors.length ? 500 : 200 })
    }

    await recordCosUniversityProductionPath({ path: 'phd_admission', invocationSucceeded: true, evidence: { dailyCadence: 'not_due', runnerInvoked: false, agents: notDue } })
    await recordCosUniversityProductionPath({ path: 'phd_runtime', invocationSucceeded: true, evidence: { dailyCadence: 'not_due', runnerInvoked: false, agents: notDue } })
    return NextResponse.json({ ok: true, skipped: true, dailyCadence: 'not_due', runnerInvoked: false, agents: notDue })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, enabled: true, error: message }, { status: 500 })
  }
}
