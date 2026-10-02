//
// Writes real Holdout exam questions (one question + short answer key per withheld teaching essay) for the
// artifacts the mass evaluation route has requested. A few artifacts per tick; each costs a handful of small
// teacher calls. The evaluation route only approves an artifact once its questions exist.
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { fillRequestedHoldoutExamSets } from '@/lib/ai/cos/cosUniversityHoldoutExamItems'
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
    if (result.errors.length) console.warn('[cos-holdout-exam-items]', JSON.stringify(result))
    await recordCosUniversityProductionPath({
      path: 'holdout_exam_preparation',
      invocationSucceeded: true,
      evidence: {
        runnerInvoked: true,
        processed: result.processed,
        ready: result.ready,
        failed: result.failed,
        itemsWritten: result.itemsWritten,
        itemsReused: result.itemsReused,
        authorityExpanded: false,
      },
    }).catch(() => null)
    return NextResponse.json({ ok: true, ...result, authorityExpanded: false })
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