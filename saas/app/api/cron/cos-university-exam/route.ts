import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityIndependentExamBatch } from '@/lib/ai/cos/cosUniversityIndependentExamRunner'
import { readCosUniversityUndergraduateAcademicLaneGate } from '@/lib/ai/cos/cosUniversityProgramRuntimeGate'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { readCosUniversityDailyLaneCadence } from '@/lib/ai/cos/cosUniversityDailyLaneCadence'

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
      await recordCosUniversityProductionPath({ path: 'independent_exams', invocationSucceeded: !unavailable, evidence: { skipped: true, programGate } })
      return NextResponse.json({ ok: !unavailable, skipped: true, programGate }, { status: unavailable ? 503 : 200 })
    }
    const cadence = await readCosUniversityDailyLaneCadence('independent_exams')
    if (!cadence.due) {
      await recordCosUniversityProductionPath({ path: 'independent_exams', invocationSucceeded: true, evidence: { dailyCadence: 'not_due', runnerInvoked: false, cadence } })
      return NextResponse.json({ ok: true, skipped: true, cadence })
    }
    const result = await runCosUniversityIndependentExamBatch({ maxExams: 2 })
    await recordCosUniversityProductionPath({ path: 'independent_exams', invocationSucceeded: result.errors.length === 0, evidence: result })
    return NextResponse.json({
      ok: result.errors.length === 0,
      enabled: result.enabled,
      attempted: result.attempted,
      passed: result.passed,
      failed: result.failed,
      assessmentRowsWritten: result.assessmentRowsWritten,
      runs: result.runs.map(run => ({
        runId: run.runId,
        target: run.target,
        status: run.status,
        passed: run.passed,
        assessmentRecorded: run.assessmentRecorded,
        manifestHash: run.manifestHash,
        reasons: run.reasons,
        latencyMs: run.latencyMs,
      })),
      errors: result.errors,
      semantics: result.semantics,
    }, { status: result.errors.length ? 500 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('cron COS University exam failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
