import { NextRequest, NextResponse } from 'next/server'
import { ContinuousLearningCycle } from '@/lib/cos-core/layers/learning/cycle.ts'
import { ContinuousLearningDirector, type ContinuousLearningPolicy } from '@/lib/cos-core/layers/learning/index.ts'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources.ts'
import { createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase.ts'
import { currentWorldKnowledgeGaps, isCurrentWorldLearningAdapter } from '@/lib/ai/cos/currentWorldLearning.ts'
import { indexRecentUnembeddedLearnedCorpus } from '@/lib/ai/cos/learnedCorpusIndexing.ts'
import { recordAutonomousLearningRun } from '@/lib/ai/cos/autonomousLearningHealth.ts'
import { touchRunpodActivityLease } from '@/lib/ai/cos/runpodActivityLease.ts'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CURRENT_WORLD_POLICY: ContinuousLearningPolicy = {
  allowedSourceKinds: new Set([
    'official_documentation',
    'news_article',
    'approved_public_web',
  ]),
  minimumConfidence: 0.6,
  maxCandidatesPerCycle: 12,
  maxExternalCostUsdPerCycle: 0,
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  if (process.env.COS_AUTONOMOUS_LEARNING_ENABLED !== 'true') {
    await recordAutonomousLearningRun({
      mode: 'current_world', status: 'skipped', succeeded: false, startedAt,
      skipReason: 'autonomous_learning_disabled',
    })
    return NextResponse.json({ ok: true, status: 'skipped', reason: 'autonomous_learning_disabled' })
  }
  if (process.env.COS_LIVE_SOURCES_ENABLED === 'false') {
    await recordAutonomousLearningRun({
      mode: 'current_world', status: 'skipped', succeeded: false, startedAt,
      skipReason: 'live_sources_disabled',
    })
    return NextResponse.json({ ok: true, status: 'skipped', reason: 'live_sources_disabled' })
  }

  const stores = createSupabaseCOSStores()
  if (!stores) return NextResponse.json({ ok: false, error: 'COS Supabase service store is not configured.' }, { status: 503 })

  const adapters = createLiveLearningAdapters().filter(isCurrentWorldLearningAdapter)
  if (!adapters.length) {
    await recordAutonomousLearningRun({
      mode: 'current_world', status: 'error', succeeded: false, startedAt,
      skipReason: 'no_current_world_adapters',
    })
    return NextResponse.json({ ok: false, error: 'No current-world learning adapters are available.' }, { status: 503 })
  }

  try {
    const gaps = currentWorldKnowledgeGaps(new Date())
    const director = new ContinuousLearningDirector(stores.continuousLearning, CURRENT_WORLD_POLICY)
    const cycle = new ContinuousLearningCycle(director, adapters)
    const learning = await cycle.run(gaps, 0)

    let indexing: Awaited<ReturnType<typeof indexRecentUnembeddedLearnedCorpus>> | null = null
    if (learning.accepted > 0) {
      await touchRunpodActivityLease('current_world_learning_index')
      try {
        await ensureLocalInferenceRuntimeReady()
      } catch (error) {
        console.warn('current-world learning embedding runtime could not be pre-warmed:', error instanceof Error ? error.message : String(error))
      }
      indexing = await indexRecentUnembeddedLearnedCorpus({ limit: 16, concurrency: 4, createdAfter: startedAt })
    }

    const ok = learning.accepted === 0 || Boolean(indexing && indexing.failed === 0)
    const healthRecorded = await recordAutonomousLearningRun({
      mode: 'current_world',
      status: ok ? 'learned' : 'indexing_failed',
      succeeded: ok,
      startedAt,
      documentsAcquired: learning.documentsAcquired,
      accepted: learning.accepted,
      probationary: learning.probationary,
      indexed: indexing?.embedded ?? 0,
      indexingFailed: indexing?.failed ?? 0,
      sourceErrors: learning.sourceErrors,
    })
    return NextResponse.json({
      ok,
      status: 'learned',
      gaps: gaps.map(gap => ({ id: gap.id, subject: gap.subject })),
      sourceAdapters: adapters.map(adapter => adapter.id ?? adapter.kind),
      learning,
      indexing,
      healthRecorded,
    }, { status: ok ? 200 : 503 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordAutonomousLearningRun({
      mode: 'current_world', status: 'error', succeeded: false, startedAt,
      skipReason: message.slice(0, 500),
    })
    console.error('cron current-world learning failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
