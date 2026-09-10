import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityContinuousLearning } from '@/lib/ai/cos/cosUniversityContinuousLearning'
import { readCosUniversityUndergraduateAcademicLaneGate } from '@/lib/ai/cos/cosUniversityProgramRuntimeGate'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const programGate = await readCosUniversityUndergraduateAcademicLaneGate()
    if (!programGate.allowed) {
      const unavailable = programGate.reason === 'service_database_unavailable'
      await recordCosUniversityProductionPath({ path: 'continuous_learning', invocationSucceeded: !unavailable, evidence: { skipped: true, programGate } })
      return NextResponse.json({ ok: !unavailable, skipped: true, programGate }, { status: unavailable ? 503 : 200 })
    }
    const result = await runCosUniversityContinuousLearning()
    await recordCosUniversityProductionPath({ path: 'continuous_learning', invocationSucceeded: result.status !== 'error', evidence: result })
    return NextResponse.json({ ok: result.status !== 'error', ...result }, { status: result.status === 'error' ? 500 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('cron COS University continuous learning failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
