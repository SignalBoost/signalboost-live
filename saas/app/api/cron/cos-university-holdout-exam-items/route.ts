//
// Writes real Holdout exam questions (one question + short answer key per withheld teaching essay) for the
// artifacts the mass evaluation route has requested. A few artifacts per tick; each costs a handful of small
// teacher calls. The evaluation route only approves an artifact once its questions exist.
//
// This station is the HEAD OF THE LINE. Admission to `evaluation_pending` requires an exam set at `status = 'ready'`,
// so while this writer produces nothing, every trained artifact sits at `evaluation_ready` and the whole pipeline is
// stopped behind it - which is exactly the Production state on 2026-10-03: 237 waiting, zero admitted in 24 hours.
// So this route now reports the set population and any aborted precondition on every run, loudly, instead of
// returning a success that says only `ready: 0`.
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { fillRequestedHoldoutExamSets } from '@/lib/ai/cos/cosUniversityHoldoutExamItems'
import { describeExamSetPopulation } from '@/lib/ai/cos/cosUniversityHoldoutExamSetRecovery'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'service_database_unavailable' }, { status: 503 })
  try {
    // 975 exams requested against 157 ready: at 3 sets per tick the writer never catches up with training output, so
    // students keep arriving in a queue that grows faster than it drains. 10 is the function's own built-in ceiling
    // (Math.min(10, ...)), not a new maximum.
    const result = await fillRequestedHoldoutExamSets({ db, limit: 10 })
    const summary = result.population ? describeExamSetPopulation(result.population) : 'exam set population unreadable'
    if (result.errors.length || result.aborted) console.warn('[cos-holdout-exam-items]', JSON.stringify({ ...result, summary }))
    await recordCosUniversityProductionPath({
      path: 'holdout_exam_preparation',
      invocationSucceeded: !result.aborted,
      evidence: {
        runnerInvoked: true,
        processed: result.processed,
        ready: result.ready,
        failed: result.failed,
        itemsWritten: result.itemsWritten,
        itemsReused: result.itemsReused,
        // A precondition that stops the whole run, named. While this is set, no artifact anywhere can be admitted.
        aborted: result.aborted,
        // Exhausted sets given a fresh attempt budget this run, so a line restart is auditable.
        revived: result.revived,
        population: result.population,
        summary,
        authorityExpanded: false,
      },
    }).catch(() => null)

    // A global precondition means this station cannot work at all, and nothing downstream can move while it holds.
    // Answering 200/ok for that is how a line stop stays invisible for a day.
    if (result.aborted) {
      return NextResponse.json({ ok: false, error: result.aborted, ...result, summary, authorityExpanded: false }, { status: 503 })
    }
    return NextResponse.json({ ok: true, ...result, summary, authorityExpanded: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cos-holdout-exam-items] failed', message)
    await recordCosUniversityProductionPath({
      path: 'holdout_exam_preparation',
      invocationSucceeded: false,
      evidence: { runnerInvoked: true, error: message.slice(0, 300), authorityExpanded: false },
    }).catch(() => null)
    return NextResponse.json({ ok: false, error: message.slice(0, 300) }, { status: 500 })
  }
}
