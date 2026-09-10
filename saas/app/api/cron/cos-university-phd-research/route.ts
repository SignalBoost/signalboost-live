import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityPhdResearchCycle } from '@/lib/ai/cos/cosUniversityPhdResearchRunner'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 240

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (process.env.COS_UNIVERSITY_PHD_RESEARCH_EXECUTION_ENABLED !== 'true') {
    await recordCosUniversityProductionPath({ path: 'phd_research', invocationSucceeded: true, evidence: { enabled: false, academicCredit: false, semantics: 'phd_research_execution_fail_closed' } })
    return NextResponse.json({ ok: true, enabled: false, academicCredit: false, semantics: 'phd_research_execution_fail_closed' })
  }
  try {
    const result = await runCosUniversityPhdResearchCycle(new Date())
    await recordCosUniversityProductionPath({ path: 'phd_research', invocationSucceeded: result.status !== 'error', evidence: result })
    return NextResponse.json({ ok: result.status !== 'error', ...result }, { status: result.status === 'error' ? 500 : 200 })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      enabled: true,
      academicCredit: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
