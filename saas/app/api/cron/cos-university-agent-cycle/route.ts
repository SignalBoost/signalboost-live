import { withScheduledProductionHarnessIngress } from '@/platform-harness/runtime/scheduled-ingress'
import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityAutonomousAgentCycle } from '@/lib/ai/cos/cosUniversityAutonomousAgentCycle'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function GETInsideScheduledHarness(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runCosUniversityAutonomousAgentCycle({ maxAgents: 25 })
    if (result.independentExamRuns > 0) {
      await recordCosUniversityProductionPath({
        path: 'independent_exams',
        invocationSucceeded: result.independentExamErrors === 0,
        evidence: {
          source: 'registered_agent_cycle',
          independentExamRuns: result.independentExamRuns,
          independentExamErrors: result.independentExamErrors,
          agents: result.agents.filter(agent => agent.nextAction === 'independent_exam'),
        },
      })
    }
    await recordCosUniversityProductionPath({ path: 'registered_agent_cycle', invocationSucceeded: result.errors.length === 0, evidence: result })
    return NextResponse.json({ ok: result.errors.length === 0, ...result }, { status: result.errors.length ? 500 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordCosUniversityProductionPath({ path: 'registered_agent_cycle', invocationSucceeded: false, evidence: { error: message } })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}


// Platform Harness scheduled ingress: no background worker logic starts outside a bounded run.
export async function GET(...args: Parameters<typeof GETInsideScheduledHarness>) {
  return withScheduledProductionHarnessIngress({ routePath: '/api/cron/cos-university-agent-cycle' }, async () => GETInsideScheduledHarness(...args))
}
