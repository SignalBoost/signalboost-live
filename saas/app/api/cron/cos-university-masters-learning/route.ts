import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityMastersLearning } from '@/lib/ai/cos/cosUniversityMastersLearningRunner'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { listCosUniversityRegisteredAgents } from '@/lib/ai/cos/cosUniversityAgentRegistry'
import { runOneMastersLearningAgent } from '@/lib/ai/cos/cosUniversityMastersAgentLearning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const now = new Date()
    const agents = await listCosUniversityRegisteredAgents()
    const batch = await runOneMastersLearningAgent(agents, now, agentId =>
      runCosUniversityMastersLearning({ now, agentId, maxStudyPlans: 2 }))
    const ok = !batch.checked.some(result => result.status === 'error')
    const evidence = batch.result
      ? { ...batch.result, checkedAgentIds: batch.checked.map(result => result.agentId) }
      : { skipped: true, acquisitionInvoked: false, agents: batch.checked }
    await recordCosUniversityProductionPath({ path: 'masters_learning', invocationSucceeded: ok, evidence })
    return NextResponse.json({ ok, ...evidence }, { status: ok ? 200 : 500 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('cron COS University Master’s learning failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
