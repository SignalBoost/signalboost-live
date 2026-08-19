//
// "Is COS still learning?" answered on demand, owner-only, read-only.
//
// Sits alongside the other two halves of the same question and is not a substitute for either:
//   /api/admin/cos-learning/coverage   — did the DECLARED subjects arrive at all
//   /api/admin/cos-holdout-certification — can COS actually USE what it learned
// This one answers the third: is the pipeline still alive TODAY, or did it stop while every
// dashboard kept rendering the corpus it already had.

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { readLearningContinuity } from '@/lib/ai/cos/learningContinuityReport'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const result = await readLearningContinuity()
  // `in` rather than `!result.ok`: this repo compiles with "strict": false, and boolean-literal
  // discriminants do not narrow a union under it. Property-presence narrowing does.
  if ('error' in result) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })

  return NextResponse.json({
    ok: true,
    report: result.report,
    note: 'Continuity measures whether the learning cycle is still producing retained evidence. It does not measure answer quality (see cos-holdout-certification) or declared-curriculum coverage (see cos-learning/coverage). When status is red for staleness, GET /api/admin/cos-learning/run distinguishes a saturated cycle from a dead one.',
  })
}
