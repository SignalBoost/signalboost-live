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
  let failurePhase: 'registry' | 'scheduling' | 'assurance' = 'registry'
  let runnerInvoked = false
  try {
    const now = new Date()
    const agents = await listCosUniversityRegisteredAgents()
    failurePhase = 'scheduling'
    const batch = await runOneMastersLearningAgent(agents, now, agentId => {
      runnerInvoked = true
      return runCosUniversityMastersLearning({ now, agentId, maxStudyPlans: 2 })
    })
    const ok = !batch.checked.some(result => result.status === 'error')
    const evidence = batch.result
      ? { ...batch.result, checkedAgentIds: batch.checked.map(result => result.agentId) }
      : { skipped: true, acquisitionInvoked: false, agents: batch.checked }
    failurePhase = 'assurance'
    await recordCosUniversityProductionPath({ path: 'masters_learning', invocationSucceeded: ok, evidence })
    return NextResponse.json({ ok, ...evidence }, { status: ok ? 200 : 500 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('cron COS University Master’s learning failed:', message)
    // Only authenticated invocations reach this catch. A new failure must supersede any older
    // successful receipt when the ledger is writable; unknown partial acquisition is not guessed.
    try {
      await recordCosUniversityProductionPath({
        path: 'masters_learning', invocationSucceeded: false,
        evidence: { error: message, failurePhase, runnerInvoked },
      })
    } catch (receiptError) {
      // Do not mask the original failure, recursively retry, or repeat academic work.
      console.error('cron COS University Master’s failure receipt unavailable:', receiptError instanceof Error ? receiptError.message : String(receiptError))
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
