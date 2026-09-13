import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityPhdProgress } from '@/lib/ai/cos/cosUniversityPhdRuntime'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { listCosUniversityRegisteredAgents } from '@/lib/ai/cos/cosUniversityAgentRegistry'
import { rotatePhdAgents } from '@/lib/ai/cos/cosUniversityPhdAgentScope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (process.env.COS_UNIVERSITY_PHD_RUNTIME_ENABLED !== 'true') {
    await recordCosUniversityProductionPath({ path: 'phd_progress', invocationSucceeded: true, evidence: { enabled: false, awarded: false, semantics: 'phd_runtime_fail_closed' } })
    return NextResponse.json({ ok: true, enabled: false, awarded: false, semantics: 'phd_runtime_fail_closed' })
  }
  try {
    const now = new Date()
    const agents = rotatePhdAgents(await listCosUniversityRegisteredAgents(), now, 2)
    const selected = agents[0]
    if (!selected) throw new Error('no_registered_phd_agents')
    const result = await runCosUniversityPhdProgress(now, selected.agentId)
    const evidence = { agentId: selected.agentId, role: selected.role, ...result }
    await recordCosUniversityProductionPath({ path: 'phd_progress', invocationSucceeded: result.errors.length === 0, evidence })
    return NextResponse.json({ ok: result.errors.length === 0, enabled: true, ...evidence }, { status: result.errors.length ? 500 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, enabled: true, error: message }, { status: 500 })
  }
}
