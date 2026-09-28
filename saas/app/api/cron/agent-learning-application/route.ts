// Continuously turns retained software learning into governed, independently evaluated
// procedural skills so COS/Builder and other consumers of cognitive-skill retrieval do not
// wait for the once-daily mining lane. This route never grants authority or promotes by assertion.
import { NextRequest, NextResponse } from 'next/server'
import { backfillDirectedSoftwareApplications } from '@/lib/ai/cos/directedStudyStore'
import { runGovernedCognitiveLearningCycle } from '@/lib/ai/cos/cognitiveLearningOrchestrator'
import { runCognitiveCertificationCycle } from '@/lib/ai/cos/cognitiveCertification'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { touchRunpodActivityLease } from '@/lib/ai/cos/runpodActivityLease'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  await touchRunpodActivityLease('agent_learning_application')
  try {
    await ensureLocalInferenceRuntimeReady()
  } catch (error) {
    console.warn('[agent-learning-application] runtime prewarm failed:', error instanceof Error ? error.message : String(error))
  }

  const errors: string[] = []
  let backfill: Awaited<ReturnType<typeof backfillDirectedSoftwareApplications>> | null = null
  let cognitive: Awaited<ReturnType<typeof runGovernedCognitiveLearningCycle>> | null = null
  let certification: Awaited<ReturnType<typeof runCognitiveCertificationCycle>> | null = null

  try {
    backfill = await backfillDirectedSoftwareApplications(200)
  } catch (error) {
    errors.push(`backfill:${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    // Keep each five-minute tick bounded: one general candidate plus one directed-software
    // candidate. The existing lifecycle/evaluator gates remain unchanged.
    cognitive = await runGovernedCognitiveLearningCycle({
      lessonLimit: 1,
      directedSoftwareLimit: 1,
      practiceLimit: 1,
    })
    errors.push(...cognitive.errors)
  } catch (error) {
    errors.push(`cognitive:${error instanceof Error ? error.message : String(error)}`)
  }

  // Leave cleanup headroom rather than starting an independent certification call too late.
  if (Date.now() - startedAt < 190_000) {
    try {
      certification = await runCognitiveCertificationCycle({
        deadlineAt: startedAt + 275_000,
        maxModelCalls: 1,
      })
      errors.push(...certification.errors)
    } catch (error) {
      errors.push(`certification:${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const progressed = Boolean(
    (backfill && ((backfill as any).queued > 0 || (backfill as any).reinforced > 0))
    || cognitive?.lessons.length
    || cognitive?.practice.length
    || certification?.candidate
  )

  return NextResponse.json({
    ok: errors.length === 0,
    status: progressed ? 'progressed' : 'idle',
    elapsedMs: Date.now() - startedAt,
    backfill,
    cognitive,
    certification,
    errors: [...new Set(errors)].slice(0, 12),
    semantics: 'learning_context_only_no_authority_grant',
  }, { status: errors.length ? 503 : 200 })
}
