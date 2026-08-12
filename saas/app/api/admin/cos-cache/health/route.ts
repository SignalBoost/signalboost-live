// saas/app/api/admin/cos-cache/health/route.ts
//
// THE CACHE DISCRIMINATOR. The semantic cache has reported NOT USED across every benchmark run,
// and the failure could live in any of three stages: embedding generation on the pod, the write
// into cos_knowledge_records, or the similarity lookup. Chasing that across pod terminals, Vercel
// log searches and SQL queries has cost days. This endpoint runs the whole chain in one request —
// embed, write a probe row, look it up by similarity, delete it — and reports each stage with its
// timing and, on failure, the actual error text. One URL answers "which stage is broken."
//
// GET only, owner-gated, and self-cleaning: the probe row is deleted at the end even when a later
// stage fails, so repeated checks never pollute the cache. The probe uses task id
// 'cache-health-probe', which the answering path never queries.

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { generateLocalEmbedding, LOCAL_EMBEDDING_DIMENSIONS } from '@/lib/ai/cos/localEmbeddings'
import { cosServiceDb, SupabaseKnowledgeStore } from '@/lib/cos-core/storage/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

const PROBE_TASK_ID = 'cache-health-probe'
const PROBE_PROMPT = 'cos semantic cache health probe — canonical text, do not answer'

type Stage = { ok: boolean; ms: number; detail: string }

function failed(stage: string, error: unknown, ms: number): Stage {
  const detail = error instanceof Error ? error.message : String(error)
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
  const report: Record<string, Stage> = {}
  let vector: number[] | null = null

  // Stage 1 — embedding generation on the pod. If this fails, nothing downstream can work and the
  // detail carries the pod's own error (model not pulled, pod stopped, auth, dimension mismatch).
  {
    const started = Date.now()
    try {
      vector = await generateLocalEmbedding(PROBE_PROMPT)
      report.embedding = { ok: true, ms: Date.now() - started, detail: `${vector.length}-dimension vector returned (expected ${LOCAL_EMBEDDING_DIMENSIONS}).` }
    } catch (error) {
      report.embedding = failed('embedding', error, Date.now() - started)
    }
  }

  // Stage 2 — the write. Inserts a real probe row through the same store the answer path uses.
  if (vector) {
    const started = Date.now()
    try {
      await store.save({ taskId: PROBE_TASK_ID, promptText: PROBE_PROMPT, contextText: 'health probe', embeddingVector: vector, responseData: { probe: true }, createdAt: new Date() })
      report.write = { ok: true, ms: Date.now() - started, detail: 'probe row inserted into cos_knowledge_records.' }
    } catch (error) {
      report.write = failed('write', error, Date.now() - started)
    }
  }

  // Stage 3 — the similarity lookup, via the same RPC the answer path uses. Looking up the vector
  // just written must return the probe with similarity ~1.0; anything else is a lookup defect.
  if (vector && report.write?.ok) {
    const started = Date.now()
    try {
      const nearest = await store.queryNearest(vector, { taskId: PROBE_TASK_ID })
      report.lookup = nearest && nearest.originalPrompt === PROBE_PROMPT
        ? { ok: true, ms: Date.now() - started, detail: `probe found with similarity ${nearest.similarityScore.toFixed(4)}.` }
        : { ok: false, ms: Date.now() - started, detail: `lookup returned ${nearest ? 'a different row' : 'nothing'} for a vector that was just written — cos_match_knowledge is the defect.` }
    } catch (error) {
      report.lookup = failed('lookup', error, Date.now() - started)
    }
  }

  // Cleanup — always, so health checks never leave probe rows behind.
  try { await db.from('cos_knowledge_records').delete().eq('task_id', PROBE_TASK_ID) } catch { /* best effort */ }

  // Live row count — how many REAL cached answers exist right now.
  let cachedAnswers: number | null = null
  try {
    const { count } = await db.from('cos_knowledge_records').select('id', { count: 'exact', head: true })
    cachedAnswers = count ?? 0
  } catch { /* leave null */ }

  const stages = Object.values(report)
  const allOk = stages.length === 3 && stages.every(stage => stage.ok)
  const firstFailure = Object.entries(report).find(([, stage]) => !stage.ok)
  const verdict = allOk
    ? `Every stage works. ${cachedAnswers === 0 ? 'The table is still empty, so no confident answer has completed a write since the last deploy — ask one question and re-check.' : `${cachedAnswers} cached answers are stored; if repeats still miss, the defect is in lookup thresholds, not the pipeline.`}`
    : firstFailure
      ? `BROKEN AT: ${firstFailure[0]}. ${firstFailure[1].detail}`
      : 'Embedding failed before any other stage could run.'

  return NextResponse.json({ ok: allOk, verdict, cachedAnswers, stages: report })
}
