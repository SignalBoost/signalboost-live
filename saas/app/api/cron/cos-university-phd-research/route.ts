import { withScheduledProductionHarnessIngress } from '@/platform-harness/runtime/scheduled-ingress'
import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityPhdResearchCycle } from '@/lib/ai/cos/cosUniversityPhdResearchRunner'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { listCosUniversityRegisteredAgents } from '@/lib/ai/cos/cosUniversityAgentRegistry'
import { rotatePhdAgents } from '@/lib/ai/cos/cosUniversityPhdAgentScope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 240

async function GETInsideScheduledHarness(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (process.env.COS_UNIVERSITY_PHD_RESEARCH_EXECUTION_ENABLED !== 'true') {
    await recordCosUniversityProductionPath({ path: 'phd_research', invocationSucceeded: true, evidence: { enabled: false, academicCredit: false, semantics: 'phd_research_execution_fail_closed' } })
    return NextResponse.json({ ok: true, enabled: false, academicCredit: false, semantics: 'phd_research_execution_fail_closed' })
  }
  try {
    const now = new Date()
    const agents = rotatePhdAgents(await listCosUniversityRegisteredAgents(), now, 4)
    const selected = agents[0]
    if (!selected) throw new Error('no_registered_phd_agents')
    const result = await runCosUniversityPhdResearchCycle(now, selected.agentId)
    const evidence = { agentId: selected.agentId, role: selected.role, ...result }
    await recordCosUniversityProductionPath({ path: 'phd_research', invocationSucceeded: result.status !== 'error', evidence })
    return NextResponse.json({ ok: result.status !== 'error', ...evidence }, { status: result.status === 'error' ? 500 : 200 })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      enabled: true,
      academicCredit: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}


// Platform Harness scheduled ingress: no background worker logic starts outside a bounded run.
export async function GET(...args: Parameters<typeof GETInsideScheduledHarness>) {
  return withScheduledProductionHarnessIngress({ routePath: '/api/cron/cos-university-phd-research' }, async () => GETInsideScheduledHarness(...args))
}
