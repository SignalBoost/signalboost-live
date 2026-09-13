// saas/app/api/cron/cos-university-learning/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityContinuousLearning } from '@/lib/ai/cos/cosUniversityContinuousLearning'
import { readCosUniversityUndergraduateAcademicLaneGate } from '@/lib/ai/cos/cosUniversityProgramRuntimeGate'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { readCosUniversityProductionVerification } from '@/lib/ai/cos/cosUniversityProductionVerification'
import { recordCosUniversityLaneFaults } from '@/lib/ai/cos/cosUniversityLaneFaultRecorder'

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
    // A lane the calendar expects to be running, that is not, leaves no trace anywhere else. Sweep
    // after the receipt is written so this tick's own receipt is part of what is judged. It never
    // affects this route's status: an audit failure must not fail continuous learning.
    const laneAudit = await sweepLaneFaults()
    return NextResponse.json({ ok: result.status !== 'error', ...result, laneAudit }, { status: result.status === 'error' ? 500 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('cron COS University continuous learning failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/**
 * Reads the production verification board and records any lane that should be running but is not.
 * Isolated and non-throwing by design: this is an observer, and an observer must never be able to
 * break the lane it rides on.
 */
async function sweepLaneFaults(): Promise<Record<string, unknown>> {
  try {
    const board = await readCosUniversityProductionVerification()
    if (!board.expectationContextAvailable) return { skipped: 'expectation_context_unavailable' }
    if (!board.faults.length) return { recorded: 0, faults: [] }
    return { ...(await recordCosUniversityLaneFaults({ faults: board.faults, agentId: 'cos' })) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('cron COS University lane audit failed:', message)
    return { error: message }
  }
}
