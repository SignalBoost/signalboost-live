// saas/app/api/cron/cos-university-language-a-range/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityLanguageARangeBatch } from '@/lib/ai/cos/cosUniversityLanguageARangeRunner'
import { listCosUniversityRegisteredAgents } from '@/lib/ai/cos/cosUniversityAgentRegistry'
import { readCosUniversityUndergraduateAcademicLaneGate } from '@/lib/ai/cos/cosUniversityProgramRuntimeGate'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { readCosUniversityDailyLaneCadence } from '@/lib/ai/cos/cosUniversityDailyLaneCadence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Every registered University agent (COS and each specialist) earns its own five-language transfer and capstone
// evidence. Each hourly tick runs at most ONE agent's daily batch, in stable agent order, so the
// function keeps the original single-batch duration envelope and each agent keeps once-per-UTC-day.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const agents = await listCosUniversityRegisteredAgents()
    const gated: Array<Record<string, unknown>> = []
    const notDue: Array<Record<string, unknown>> = []
    for (const agent of agents) {
      const programGate = await readCosUniversityUndergraduateAcademicLaneGate(now, agent.agentId)
      if (!programGate.allowed) {
        if (programGate.reason === 'service_database_unavailable') {
          await recordCosUniversityProductionPath({ path: 'language_a_range_evidence', invocationSucceeded: false, evidence: { skipped: true, agentId: agent.agentId, programGate } })
          return NextResponse.json({ ok: false, skipped: true, agentId: agent.agentId, programGate }, { status: 503 })
        }
        gated.push({ agentId: agent.agentId, programGate })
        continue
      }
      const cadence = await readCosUniversityDailyLaneCadence('language_a_range_evidence', now, agent.agentId)
      if (!cadence.due) {
        notDue.push({ agentId: agent.agentId, cadence })
        continue
      }
      const result = await runCosUniversityLanguageARangeBatch({ now, agentId: agent.agentId })
      await recordCosUniversityProductionPath({ path: 'language_a_range_evidence', invocationSucceeded: result.errors.length === 0, evidence: { ...result, agentId: agent.agentId, programGate } })
      return NextResponse.json({ ok: result.errors.length === 0, agentId: agent.agentId, ...result }, { status: result.errors.length ? 500 : 200 })
    }

    if (!notDue.length) {
      // No registered agent has an active academic program: the same fail-closed skip as before.
      await recordCosUniversityProductionPath({ path: 'language_a_range_evidence', invocationSucceeded: true, evidence: { skipped: true, agents: gated } })
      return NextResponse.json({ ok: true, skipped: true, agents: gated })
    }
    const cadence = { agents: notDue, gated }
    await recordCosUniversityProductionPath({ path: 'language_a_range_evidence', invocationSucceeded: true, evidence: { dailyCadence: 'not_due', runnerInvoked: false, cadence } })
    return NextResponse.json({ ok: true, skipped: true, cadence })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('cron COS University language A-range failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
