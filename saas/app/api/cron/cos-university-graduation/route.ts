import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityGeneralistGraduationGate } from '@/lib/ai/cos/cosUniversityGraduationRunner'
import { runCosUniversityAdmission } from '@/lib/ai/cos/cosUniversityAdmissionRunner'
import { listCosUniversityRegisteredAgents } from '@/lib/ai/cos/cosUniversityAgentRegistry'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { readCosUniversityDailyLaneCadence } from '@/lib/ai/cos/cosUniversityDailyLaneCadence'

import { cosUniversityGraduationAdmissionBlocker, rotateCosUniversityGraduationAgents } from '@/lib/ai/cos/cosUniversityGraduationRuntimePolicy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Every registered University agent graduates through the same host gate against its OWN enrollment,
// minimum residence, deadline, evidence and capstone. Each hourly tick runs at most ONE agent's daily
// batch with a rotating starting agent, so failures cannot monopolize the duration envelope.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const registeredAgents = await listCosUniversityRegisteredAgents()
    const agents = rotateCosUniversityGraduationAgents(registeredAgents, now)
    const notDue: Array<Record<string, unknown>> = []
    for (const agent of agents) {
      const cadence = await readCosUniversityDailyLaneCadence('graduation', now, agent.agentId)
      if (!cadence.due) {
        notDue.push({ agentId: agent.agentId, cadence })
        continue
      }
      const result = await runCosUniversityGeneralistGraduationGate({ now, agentId: agent.agentId })
      // Preserve same-tick COS admission, but never enroll a specialist into COS-only Master's workers.
      // Disabled or failed graduation also cannot trigger a program transition.
      const admissionBlocker = cosUniversityGraduationAdmissionBlocker({
        agentId: agent.agentId, enabled: result.enabled, errors: result.errors, capstoneState: result.capstoneRun.state,
      })
      const admission = admissionBlocker
        ? { enabled: false, skipped: true, reasons: [admissionBlocker], errors: [] as string[] }
        : await runCosUniversityAdmission({ now, agentId: agent.agentId, role: agent.role })
      const errors = [...result.errors, ...admission.errors]
      await recordCosUniversityProductionPath({ path: 'graduation', invocationSucceeded: errors.length === 0, evidence: { ...result, admission, agentId: agent.agentId } })
      return NextResponse.json({ ok: errors.length === 0, agentId: agent.agentId, ...result, admission }, { status: errors.length ? 500 : 200 })
    }
    const cadence = { agents: notDue }
    await recordCosUniversityProductionPath({ path: 'graduation', invocationSucceeded: true, evidence: { dailyCadence: 'not_due', runnerInvoked: false, cadence } })
    return NextResponse.json({ ok: true, skipped: true, cadence })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('cron COS University generalist graduation failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
