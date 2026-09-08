import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityDeliberatePractice } from '@/lib/ai/cos/cosUniversityDeliberatePracticeRunner'
import { reopenCosUniversityStudyAfterFailedPractice } from '@/lib/ai/cos/cosUniversityPracticeFailureRemediation'
import { disciplineCosUniversityPracticeQueue } from '@/lib/ai/cos/cosUniversityPracticeQueueDiscipline'
import { readCosUniversityUndergraduateAcademicLaneGate } from '@/lib/ai/cos/cosUniversityProgramRuntimeGate'

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
      return NextResponse.json({ ok: !unavailable, skipped: true, programGate }, { status: unavailable ? 503 : 200 })
    }

    // One active plan produces exactly two current-round variants, matching the default two-exercise
    // execution budget. Queue discipline preserves audit evidence, discards superseded rounds, and
    // defers lower-priority current work so a fresh academic failure cannot sit behind old backlog.
    const queueDiscipline = await disciplineCosUniversityPracticeQueue({ maxActivePlans: 1 })
    const result = await runCosUniversityDeliberatePractice({ maxPlans: 1, maxExercises: 2 })
    const practiceRemediation = await reopenCosUniversityStudyAfterFailedPractice(result.runs)
    return NextResponse.json({
      ok: result.errors.length === 0,
      queueDiscipline,
      practiceRemediation,
      ...result,
    }, { status: result.errors.length ? 500 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('cron COS University deliberate practice failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
