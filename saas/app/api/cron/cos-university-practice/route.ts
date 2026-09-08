import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityDeliberatePractice } from '@/lib/ai/cos/cosUniversityDeliberatePracticeRunner'
import { reopenCosUniversityStudyAfterFailedPractice } from '@/lib/ai/cos/cosUniversityPracticeFailureRemediation'
import { disciplineCosUniversityPracticeQueue } from '@/lib/ai/cos/cosUniversityPracticeQueueDiscipline'
import { readCosUniversityPracticeStudyGate } from '@/lib/ai/cos/cosUniversityPracticeStudyGate'
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

    // A counter alone never proves learning. Before mutating or executing the practice queue, require
    // host-written accepted-study proof for the exact current attempt. A terminal failed practice
    // round that has reopened study remains blocked until a later accepted study attempt supersedes it.
    const studyGate = await readCosUniversityPracticeStudyGate()
    if (!studyGate.allowed || !studyGate.planId || !studyGate.studyAttempt) {
      const unavailable = studyGate.reason === 'service_database_unavailable'
      return NextResponse.json({ ok: !unavailable, skipped: true, programGate, studyGate }, { status: unavailable ? 503 : 200 })
    }

    // Carry the exact plan/attempt fence through queue discipline and execution. The runner revalidates
    // the durable proof/remediation state after claiming each row, so stale recovered work cannot cross
    // the gate merely because it was queued before a failure or deployment boundary.
    const queueDiscipline = await disciplineCosUniversityPracticeQueue({
      maxActivePlans: 1,
      requiredPlanId: studyGate.planId,
      requiredPracticeRound: studyGate.studyAttempt,
    })
    const result = await runCosUniversityDeliberatePractice({
      maxPlans: 1,
      maxExercises: 2,
      requiredPlanId: studyGate.planId,
      requiredPracticeRound: studyGate.studyAttempt,
    })
    // Reconcile from durable queue/plan state after every practice sweep. result.runs is only a hint;
    // failures split across cron invocations are still discovered from persisted practice evidence.
    const practiceRemediation = await reopenCosUniversityStudyAfterFailedPractice(result.runs)
    return NextResponse.json({
      ok: result.errors.length === 0,
      programGate,
      studyGate,
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
