import { withScheduledProductionHarnessIngress } from '@/platform-harness/runtime/scheduled-ingress'
// saas/app/api/cron/cos-university-masters-exam/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { listCosUniversityRegisteredAgents } from '@/lib/ai/cos/cosUniversityAgentRegistry'
import { runCosUniversityMastersExam } from '@/lib/ai/cos/cosUniversityMastersExamRunner'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function GETInsideScheduledHarness(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Graduate work used to run for COS alone. Every registered agent now gets its own turn, one per
  // tick so a single invocation still performs one bounded exam, rotating by the hour so no learner
  // can monopolise the lane. An agent with no active Master's enrollment returns not_enrolled
  // cheaply, which is the normal case while only COS is enrolled.
  const agents = await listCosUniversityRegisteredAgents()
  const identities = agents.length ? agents.map(agent => agent.agentId) : ['cos']
  const agentId = identities[new Date().getUTCHours() % identities.length]

  const result = await runCosUniversityMastersExam({ agentId })
  await recordCosUniversityProductionPath({
    path: 'masters_exams',
    invocationSucceeded: result.status !== 'error',
    evidence: { ...result, agentId, rotation: { identities, selected: agentId } },
  })
  return NextResponse.json({ ok: result.status !== 'error', agentId, ...result }, { status: result.status === 'error' ? 500 : 200 })
}


// Platform Harness scheduled ingress: no background worker logic starts outside a bounded run.
export async function GET(...args: Parameters<typeof GETInsideScheduledHarness>) {
  return withScheduledProductionHarnessIngress({ routePath: '/api/cron/cos-university-masters-exam' }, async () => GETInsideScheduledHarness(...args))
}
