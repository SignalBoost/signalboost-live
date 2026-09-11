// saas/app/api/cron/cos-university-retention/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { listCosUniversityRegisteredAgents } from '@/lib/ai/cos/cosUniversityAgentRegistry'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { readCosUniversityDailyLaneCadence } from '@/lib/ai/cos/cosUniversityDailyLaneCadence'
import { runCosUniversityRetention } from '@/lib/ai/cos/cosUniversityRetentionRunner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Every registered University agent proves delayed retention of its OWN passed transfer work. Each
// hourly tick runs at most ONE agent's daily retention batch, in stable agent order, so the function
// keeps the original single-batch duration envelope and each agent keeps once-per-UTC-day.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let currentAgentId: string | null = null
  try {
    const now = new Date()
    const agents = await listCosUniversityRegisteredAgents()
    const notDue: Array<Record<string, unknown>> = []
    for (const agent of agents) {
      currentAgentId = agent.agentId
      const cadence = await readCosUniversityDailyLaneCadence('delayed_retention', now, agent.agentId)
      if (!cadence.due) {
        notDue.push({ agentId: agent.agentId, cadence })
        continue
      }
      const result = await runCosUniversityRetention({ now, agentId: agent.agentId })
      const errors = Array.isArray(result.errors) ? result.errors : []
      await recordCosUniversityProductionPath({ path: 'delayed_retention', invocationSucceeded: errors.length === 0, evidence: { ...result, agentId: agent.agentId } })
      return NextResponse.json({ ok: errors.length === 0, ...result, agentId: agent.agentId }, { status: errors.length ? 500 : 200 })
    }
    currentAgentId = null
    const cadence = { agents: notDue }
    await recordCosUniversityProductionPath({ path: 'delayed_retention', invocationSucceeded: true, evidence: { dailyCadence: 'not_due', runnerInvoked: false, cadence } })
    return NextResponse.json({ ok: true, skipped: true, cadence })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('cron COS University retention failed:', message)
    await recordCosUniversityProductionPath({ path: 'delayed_retention', invocationSucceeded: false, evidence: { error: message, agentId: currentAgentId } })
    return NextResponse.json({ ok: false, error: message, agentId: currentAgentId }, { status: 500 })
  }
}
