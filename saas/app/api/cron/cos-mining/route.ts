// saas/app/api/cron/cos-mining/route.ts
// Scheduled mining job, invoked by Vercel Cron (see saas/vercel.json). Secured with
// CRON_SECRET exactly like the other crons. ?job=daily (default) or ?job=weekly.

import { NextRequest, NextResponse } from 'next/server'
import { runDailyAutonomousLearning } from '@/lib/cos/dailyAutonomousLearning'
import { runMiningPipeline } from '@/lib/cos/mining/pipeline'
import { runGovernedCognitiveLearningCycle } from '@/lib/ai/cos/cognitiveLearningOrchestrator'
import { runCognitiveCertificationCycle } from '@/lib/ai/cos/cognitiveCertification'
import { runCognitiveCompositionCycle } from '@/lib/ai/cos/cognitiveSkillComposition'
import { runCognitiveConsolidationCycle } from '@/lib/ai/cos/cognitiveConsolidation'
import { runFactConsolidationCycle } from '@/lib/ai/cos/cognitiveFactConsolidation'
import { runProbationaryPromotionCycle } from '@/lib/ai/cos/cognitiveProbationaryPromotion'
import { refreshMetacognitiveCapabilityMap } from '@/lib/ai/cos/cognitiveMetacognition'
import { recordCognitiveSkillPipelineHealth } from '@/lib/ai/cos/cognitiveSkillPipelineHealth'
import { runKnowledgeApplicationScan } from '@/lib/ai/cos/knowledgeApplicationStore'
import { runEvidenceTriggeredRetest } from '@/lib/ai/cos/evidenceTriggeredRetestStore'
import { recordAutonomousLearningRun } from '@/lib/ai/cos/autonomousLearningHealth.ts'
import { operationalSystemsCurriculumSignals } from '@/lib/ai/cos/operationalSystemsLearning'
import { touchRunpodActivityLease } from '@/lib/ai/cos/runpodActivityLease'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { queueStaleCorpusRecords, runCorpusRefreshBatch } from '@/lib/business-intelligence-corpus/refresh'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CERTIFICATION_ROUTE_DEADLINE_MS = 210_000

export async function GET(req: NextRequest) {
  const routeStartedAt = Date.now()
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const jobParam = new URL(req.url).searchParams.get('job')
  const job = jobParam === 'weekly' ? 'weekly' : 'daily'
  const dailyStartedAt = new Date().toISOString()

  const result = await runMiningPipeline({ job, actor: 'cron' })
  if (!result.ok || !result.summary) {
    console.error('cron cos-mining failed:', result.error)
    if (job === 'daily') {
      await recordAutonomousLearningRun({
        mode: 'daily', status: 'error', succeeded: false, startedAt: dailyStartedAt,
        skipReason: `mining_prerequisite_failed:${String(result.error || 'unknown').slice(0, 400)}`,
      })
    }
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }

  let learning: Awaited<ReturnType<typeof runDailyAutonomousLearning>> | { status: 'error'; error: string } | null = null
  let cognitive: Awaited<ReturnType<typeof runGovernedCognitiveLearningCycle>> | { enabled: false; errors: string[] } | null = null
  let certification: Awaited<ReturnType<typeof runCognitiveCertificationCycle>> | { enabled: false; errors: string[] } | null = null
  let composition: Awaited<ReturnType<typeof runCognitiveCompositionCycle>> | { enabled: false; errors: string[] } | null = null
  let consolidation: Awaited<ReturnType<typeof runCognitiveConsolidationCycle>> | { enabled: false; errors: string[] } | null = null
  let factConsolidation: Awaited<ReturnType<typeof runFactConsolidationCycle>> | { enabled: false; errors: string[] } | null = null
  let probationaryPromotion: Awaited<ReturnType<typeof runProbationaryPromotionCycle>> | { enabled: false; errors: string[] } | null = null
  let knowledgeApplication: Awaited<ReturnType<typeof runKnowledgeApplicationScan>> | { enabled: false; errors: string[] } | null = null
  let evidenceRetest: Awaited<ReturnType<typeof runEvidenceTriggeredRetest>> | { enabled: false; errors: string[] } | null = null
  let metacognition: Awaited<ReturnType<typeof refreshMetacognitiveCapabilityMap>> | { status: 'error'; error: string } | null = null
  let cognitiveSkillHealth: Awaited<ReturnType<typeof recordCognitiveSkillPipelineHealth>> | null = null
  let corpus: unknown = null
  let automaticLearningHealthRecorded: boolean | null = null

  if (job === 'daily') {
    await touchRunpodActivityLease('daily_learning_batch')
    try {
      await ensureLocalInferenceRuntimeReady()
    } catch (error) {
      console.warn('cron COS local runtime could not be pre-warmed; individual learning stages will fail closed or use their existing fallbacks:', error instanceof Error ? error.message : String(error))
    }

    // Certification must get first claim on the bounded model-call budget. Previously it ran only
    // after daily research plus active learning, so the route often had less than the required
    // model-call estimate + cleanup reserve left. The cycle still updated last_cycle_at, which made
    // the pipeline look alive while no understanding/practice/holdout call actually ran.
    try {
      certification = await runCognitiveCertificationCycle({
        deadlineAt: routeStartedAt + CERTIFICATION_ROUTE_DEADLINE_MS,
        maxModelCalls: 1,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cognitive certification failed'
      console.error('cron COS cognitive certification failed:', message)
      certification = { enabled: false, errors: [message] }
    }

    try {
      learning = await runDailyAutonomousLearning({
        miningSummary: result.summary,
        injectedGapSignals: operationalSystemsCurriculumSignals(),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Daily learning failed'
      console.error('cron cos daily learning failed:', message)
      learning = { status: 'error', error: message }
    }

    if (learning?.status === 'error') {
      automaticLearningHealthRecorded = await recordAutonomousLearningRun({
        mode: 'daily', status: 'error', succeeded: false, startedAt: dailyStartedAt,
        skipReason: learning.error,
      })
    } else if (learning) {
      automaticLearningHealthRecorded = await recordAutonomousLearningRun({
        mode: 'daily',
        status: learning.status,
        succeeded: learning.status === 'learned',
        startedAt: dailyStartedAt,
        documentsAcquired: learning.documentsAcquired,
        accepted: learning.accepted,
        probationary: learning.probationary,
        sourceErrors: learning.sourceErrors,
        skipReason: learning.skipReason ?? null,
      })
    }

    try {
      cognitive = await runGovernedCognitiveLearningCycle()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cognitive active learning failed'
      console.error('cron COS cognitive active learning failed:', message)
      cognitive = { enabled: false, errors: [message] }
    }

    try {
      composition = await runCognitiveCompositionCycle()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cognitive skill composition failed'
      console.error('cron COS cognitive skill composition failed:', message)
      composition = { enabled: false, errors: [message] }
    }

    try {
      consolidation = await runCognitiveConsolidationCycle()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cognitive consolidation failed'
      console.error('cron COS cognitive consolidation failed:', message)
      consolidation = { enabled: false, errors: [message] }
    }

    try {
      factConsolidation = await runFactConsolidationCycle()
      probationaryPromotion = await runProbationaryPromotionCycle()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fact consolidation failed'
      console.error('cron COS fact consolidation failed:', message)
      factConsolidation = { enabled: false, errors: [message] }
      probationaryPromotion = { enabled: false, errors: [message] }
    }

    try {
      knowledgeApplication = await runKnowledgeApplicationScan()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Knowledge application scan failed'
      console.error('cron COS knowledge application scan failed:', message)
      knowledgeApplication = { enabled: false, errors: [message] }
    }

    try {
      evidenceRetest = await runEvidenceTriggeredRetest()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Evidence-triggered retest failed'
      console.error('cron COS evidence-triggered retest failed:', message)
      evidenceRetest = { enabled: false, errors: [message] }
    }

    try {
      metacognition = await refreshMetacognitiveCapabilityMap()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Metacognitive capability refresh failed'
      console.error('cron COS metacognitive refresh failed:', message)
      metacognition = { status: 'error', error: message }
    }

    cognitiveSkillHealth = await recordCognitiveSkillPipelineHealth(
      certification && 'candidate' in certification ? certification : null,
    )

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

  return NextResponse.json({
    ok: true,
    summary: result.summary,
    learning,
    automaticLearningHealthRecorded,
    cognitive,
    certification,
    cognitiveSkillHealth,
    composition,
    consolidation,
    factConsolidation,
    probationaryPromotion,
    knowledgeApplication,
    evidenceRetest,
    metacognition,
    corpus,
  })
}
