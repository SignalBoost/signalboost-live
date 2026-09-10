import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityPhdProgress } from '@/lib/ai/cos/cosUniversityPhdRuntime'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'

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
    const result = await runCosUniversityPhdProgress(new Date())
    await recordCosUniversityProductionPath({ path: 'phd_progress', invocationSucceeded: result.errors.length === 0, evidence: result })
    return NextResponse.json({ ok: result.errors.length === 0, enabled: true, ...result }, { status: result.errors.length ? 500 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, enabled: true, error: message }, { status: 500 })
  }
}
