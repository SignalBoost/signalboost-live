// saas/app/api/admin/cos-cache/health/route.ts
//
// THE CACHE DISCRIMINATOR. This endpoint verifies both cache paths used by COS:
// semantic cache (embedding -> write -> similarity lookup) and exact cache (write -> read -> delete).
// It is owner-gated and self-cleaning so health checks never pollute either cache.

import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { generateLocalEmbedding, LOCAL_EMBEDDING_DIMENSIONS } from '@/lib/ai/cos/localEmbeddings'
import { cosServiceDb, SupabaseKnowledgeStore } from '@/lib/cos-core/storage/supabase'
import { SupabaseExactCacheStore } from '@/lib/cos-core/storage/exactSupabase'

export const runtime = 'nodejs'
export const maxDuration = 60

const PROBE_TASK_ID = 'cache-health-probe'
const PROBE_PROMPT = 'cos semantic cache health probe — canonical text, do not answer'

type Stage = { ok: boolean; ms: number; detail: string }

function failed(stage: string, error: unknown, ms: number): Stage {
  const detail = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null
      ? JSON.stringify(error)
      : String(error)
  return { ok: false, ms, detail: `${stage} failed: ${detail}` }
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const db = cosServiceDb()
  if (!db) {
    return NextResponse.json({ ok: false, verdict: 'Supabase service credentials are not configured — nothing below can run.' }, { status: 500 })
  }
  const store = new SupabaseKnowledgeStore(db)
  const exactStore = new SupabaseExactCacheStore(db)
  const report: Record<string, Stage> = {}
  let vector: number[] | null = null

  // Stage 1 — embedding generation on the pod.
  {
    const started = Date.now()
    try {
      vector = await generateLocalEmbedding(PROBE_PROMPT)
      report.embedding = { ok: true, ms: Date.now() - started, detail: `${vector.length}-dimension vector returned (expected ${LOCAL_EMBEDDING_DIMENSIONS}).` }
    } catch (error) {
      report.embedding = failed('embedding', error, Date.now() - started)
    }
  }

  // Stage 2 — semantic-cache write.
  if (vector) {
    const started = Date.now()
    try {
      await store.save({ taskId: PROBE_TASK_ID, promptText: PROBE_PROMPT, contextText: 'health probe', embeddingVector: vector, responseData: { probe: true }, createdAt: new Date() })
      report.semanticWrite = { ok: true, ms: Date.now() - started, detail: 'probe row inserted into cos_knowledge_records.' }
    } catch (error) {
      report.semanticWrite = failed('semantic write', error, Date.now() - started)
    }
  }

  // Stage 3 — semantic similarity lookup.
  if (vector && report.semanticWrite?.ok) {
    const started = Date.now()
    try {
      const nearest = await store.queryNearest(vector, { taskId: PROBE_TASK_ID })
      report.semanticLookup = nearest && nearest.originalPrompt === PROBE_PROMPT
        ? { ok: true, ms: Date.now() - started, detail: `probe found with similarity ${nearest.similarityScore.toFixed(4)}.` }
        : { ok: false, ms: Date.now() - started, detail: `lookup returned ${nearest ? 'a different row' : 'nothing'} for a vector that was just written — cos_match_knowledge is the defect.` }
    } catch (error) {
      report.semanticLookup = failed('semantic lookup', error, Date.now() - started)
    }
  }

  // Stage 4 — exact-cache write/read/delete through the same store used by COS answers.
  const exactKey = `cache-health-probe:${randomUUID()}`
  {
    const started = Date.now()
    try {
      const now = Date.now()
      await exactStore.set(exactKey, { value: { probe: true }, createdAt: now, expiresAt: now + 60_000 })
      const exact = await exactStore.get<{ probe: boolean }>(exactKey)
      report.exactCache = exact?.value?.probe === true
        ? { ok: true, ms: Date.now() - started, detail: 'cos_exact_cache write/read round trip succeeded.' }
        : { ok: false, ms: Date.now() - started, detail: 'cos_exact_cache write completed but read-back did not return the probe.' }
    } catch (error) {
      report.exactCache = failed('exact cache', error, Date.now() - started)
    } finally {
      try { await exactStore.delete(exactKey) } catch { /* best effort */ }
    }
  }

  // Semantic cleanup — always.
  try { await db.from('cos_knowledge_records').delete().eq('task_id', PROBE_TASK_ID) } catch { /* best effort */ }

  let semanticCachedAnswers: number | null = null
  let exactCachedAnswers: number | null = null
  try {
    const { count } = await db.from('cos_knowledge_records').select('id', { count: 'exact', head: true })
    semanticCachedAnswers = count ?? 0
  } catch { /* leave null */ }
  try {
    const { count } = await db.from('cos_exact_cache').select('cache_key', { count: 'exact', head: true })
    exactCachedAnswers = count ?? 0
  } catch { /* leave null */ }

  const requiredStages = ['embedding', 'semanticWrite', 'semanticLookup', 'exactCache']
  const allOk = requiredStages.every(name => report[name]?.ok === true)
  const firstFailure = requiredStages.find(name => report[name]?.ok === false)
  const verdict = allOk
    ? `Every cache stage works. ${semanticCachedAnswers ?? 0} semantic answers and ${exactCachedAnswers ?? 0} exact answers are currently stored.`
    : firstFailure
      ? `BROKEN AT: ${firstFailure}. ${report[firstFailure].detail}`
      : 'A required cache stage did not execute.'

  return NextResponse.json({
    ok: allOk,
    verdict,
    cachedAnswers: { semantic: semanticCachedAnswers, exact: exactCachedAnswers },
    stages: report,
  })
}
