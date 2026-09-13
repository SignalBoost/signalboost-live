import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityPhdMethodologyExam } from '@/lib/ai/cos/cosUniversityPhdMethodologyExamRunner'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { listCosUniversityRegisteredAgents } from '@/lib/ai/cos/cosUniversityAgentRegistry'
import { rotatePhdAgents } from '@/lib/ai/cos/cosUniversityPhdAgentScope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (process.env.COS_UNIVERSITY_PHD_METHODOLOGY_EXAMS_ENABLED !== 'true') {
    await recordCosUniversityProductionPath({ path: 'phd_methodology_exams', invocationSucceeded: true, evidence: { enabled: false, evidenceRecorded: false, semantics: 'phd_methodology_exam_fail_closed' } })
    return NextResponse.json({
      ok: true,
      enabled: false,
      evidenceRecorded: false,
      semantics: 'phd_methodology_exam_fail_closed',
    })
  }
  try {
    const now = new Date()
    const agents = rotatePhdAgents(await listCosUniversityRegisteredAgents(), now, 3)
    const selected = agents[0]
    if (!selected) throw new Error('no_registered_phd_agents')
    const result = await runCosUniversityPhdMethodologyExam({ now, agentId: selected.agentId })
    const evidence = { agentId: selected.agentId, role: selected.role, ...result }
    await recordCosUniversityProductionPath({ path: 'phd_methodology_exams', invocationSucceeded: result.status !== 'error', evidence })
    return NextResponse.json({ ok: result.status !== 'error', ...evidence }, { status: result.status === 'error' ? 500 : 200 })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      enabled: true,
      evidenceRecorded: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
