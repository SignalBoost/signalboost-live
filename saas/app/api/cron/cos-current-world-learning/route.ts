import { NextRequest, NextResponse } from 'next/server'
import { ContinuousLearningCycle } from '@/lib/cos-core/layers/learning/cycle.ts'
import { ContinuousLearningDirector } from '@/lib/cos-core/layers/learning/index.ts'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources.ts'
import { createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase.ts'
import { currentWorldKnowledgeGaps, isCurrentWorldLearningAdapter } from '@/lib/ai/cos/currentWorldLearning.ts'
import { indexRecentUnembeddedLearnedCorpus } from '@/lib/ai/cos/learnedCorpusIndexing.ts'
import { touchRunpodActivityLease } from '@/lib/ai/cos/runpodActivityLease.ts'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CURRENT_WORLD_POLICY = {
  allowedSourceKinds: new Set([
    'official_documentation',
    'news_article',
    'approved_public_web',
  ] as const),
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
  if (process.env.COS_AUTONOMOUS_LEARNING_ENABLED !== 'true') {
    return NextResponse.json({ ok: true, status: 'skipped', reason: 'autonomous_learning_disabled' })
  }
  if (process.env.COS_LIVE_SOURCES_ENABLED === 'false') {
    return NextResponse.json({ ok: true, status: 'skipped', reason: 'live_sources_disabled' })
  }

  const stores = createSupabaseCOSStores()
  if (!stores) return NextResponse.json({ ok: false, error: 'COS Supabase service store is not configured.' }, { status: 503 })

  const adapters = createLiveLearningAdapters().filter(isCurrentWorldLearningAdapter)
  if (!adapters.length) {
    return NextResponse.json({ ok: false, error: 'No current-world learning adapters are available.' }, { status: 503 })
  }

  const startedAt = new Date().toISOString()
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
  return NextResponse.json({
    ok,
    status: 'learned',
    gaps: gaps.map(gap => ({ id: gap.id, subject: gap.subject })),
    sourceAdapters: adapters.map(adapter => adapter.id ?? adapter.kind),
    learning,
    indexing,
  }, { status: ok ? 200 : 207 })
}
