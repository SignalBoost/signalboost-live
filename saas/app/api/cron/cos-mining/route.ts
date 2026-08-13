// saas/app/api/cron/cos-mining/route.ts
// Scheduled mining job, invoked by Vercel Cron (see saas/vercel.json). Secured with
// CRON_SECRET exactly like the other crons. ?job=daily (default) or ?job=weekly.

import { NextRequest, NextResponse } from 'next/server'
import { runDailyAutonomousLearning } from '@/lib/cos/dailyAutonomousLearning'
import { runMiningPipeline } from '@/lib/cos/mining/pipeline'
import { runCognitiveLearningCycle } from '@/lib/ai/cos/cognitiveActiveLearning'
import { runCognitiveConsolidationCycle } from '@/lib/ai/cos/cognitiveConsolidation'
import { touchRunpodActivityLease } from '@/lib/ai/cos/runpodActivityLease'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { queueStaleCorpusRecords, runCorpusRefreshBatch } from '@/lib/business-intelligence-corpus/refresh'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const jobParam = new URL(req.url).searchParams.get('job')
  const job = jobParam === 'weekly' ? 'weekly' : 'daily'

  const result = await runMiningPipeline({ job, actor: 'cron' })
  if (!result.ok || !result.summary) {
    console.error('cron cos-mining failed:', result.error)
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }

  let learning: Awaited<ReturnType<typeof runDailyAutonomousLearning>> | { status: 'error'; error: string } | null = null
  let cognitive: Awaited<ReturnType<typeof runCognitiveLearningCycle>> | { enabled: false; errors: string[] } | null = null
  let consolidation: Awaited<ReturnType<typeof runCognitiveConsolidationCycle>> | { enabled: false; errors: string[] } | null = null
  let corpus: unknown = null
  if (job === 'daily') {
    // Daily learning, transcript acquisition, skill practice, and consolidation are legitimate COS
    // local-compute work. Lease + pre-warm the dedicated runtime once at the start of that bounded
    // batch; the idle-stop cron releases the GPU again after the configured quiet period.
    await touchRunpodActivityLease('daily_learning_batch')
    try {
      await ensureLocalInferenceRuntimeReady()
    } catch (error) {
      console.warn('cron COS local runtime could not be pre-warmed; individual learning stages will fail closed or use their existing fallbacks:', error instanceof Error ? error.message : String(error))
    }

    try {
      learning = await runDailyAutonomousLearning({ miningSummary: result.summary })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Daily learning failed'
      console.error('cron cos daily learning failed:', message)
      learning = { status: 'error', error: message }
    }

    try {
      cognitive = await runCognitiveLearningCycle()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cognitive active learning failed'
      console.error('cron COS cognitive active learning failed:', message)
      cognitive = { enabled: false, errors: [message] }
    }

    // Consolidation shares the existing daily schedule. It re-tests retained skills after time,
    // weakens stale/repeatedly failing skills, and never counts a delayed replay as new holdout breadth.
    try {
      consolidation = await runCognitiveConsolidationCycle()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cognitive consolidation failed'
      console.error('cron COS cognitive consolidation failed:', message)
      consolidation = { enabled: false, errors: [message] }
    }

    try {
      const queued = await queueStaleCorpusRecords(250)
      const refreshed = process.env.PROSPECT_LIVE_PROVIDER_EXECUTION === '1'
        ? await runCorpusRefreshBatch(25)
        : { processed: 0, succeeded: 0, failed: 0, results: [], skipped: 'PROSPECT_LIVE_PROVIDER_EXECUTION_DISABLED' }
      corpus = { queued, refreshed }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Corpus maintenance failed'
      console.error('cron COS corpus maintenance failed:', message)
      corpus = { status: 'error', error: message }
    }
  }

  return NextResponse.json({ ok: true, summary: result.summary, learning, cognitive, consolidation, corpus })
}
