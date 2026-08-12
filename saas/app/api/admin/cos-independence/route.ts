import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { assessCOSIndependence } from '@/lib/cos-core/layers/autonomy/independence'
import { measureLearningQuality } from '@/lib/cos-core/layers/learning/quality'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const independence = assessCOSIndependence()
  const db = cosServiceDb()
  let learning = measureLearningQuality([])
  let provider = { total: 0, local: 0, cloud: 0, localRate: 0, fallbackRate: 0 }
  let roi: { tasks: number; providerCalls: number; avoidedUsd: number; bySource: Record<string, { count: number; avoidedUsd: number }> } = { tasks: 0, providerCalls: 0, avoidedUsd: 0, bySource: {} }

  if (db) {
    const [{ data: learningRows }, { data: taskRows }, { data: roiRows }] = await Promise.all([
      db.from('cos_learning_observations').select('strategy,succeeded,latency_ms,external_cost_usd,created_at').order('created_at', { ascending: true }).limit(500),
      db.from('ai_task_log').select('provider,fallback_used').order('created_at', { ascending: false }).limit(1000),
      // 'source' added Aug 12 so the dashboard can show WHY each call was avoided —
      // reused from a paraphrase (semantic_similarity), reused verbatim (exact_cache),
      // or answered fresh by COS's own reasoner (local_reasoner) with no cloud call.
      db.from('cos_ai_roi_metrics').select('source,provider_calls,estimated_cost_avoided_usd').order('created_at', { ascending: false }).limit(1000),
    ])

    learning = measureLearningQuality((learningRows ?? []).map((row: any) => ({
      strategy: String(row.strategy ?? ''), succeeded: Boolean(row.succeeded), latencyMs: Number(row.latency_ms ?? 0),
      externalCostUsd: Number(row.external_cost_usd ?? 0), createdAt: row.created_at,
    })))

    const tasks = taskRows ?? []
    const local = tasks.filter((row: any) => row.provider === 'local').length
    const fallback = tasks.filter((row: any) => Boolean(row.fallback_used)).length
    provider = {
      total: tasks.length, local, cloud: tasks.length - local,
      localRate: tasks.length ? local / tasks.length : 0,
      fallbackRate: tasks.length ? fallback / tasks.length : 0,
    }

    const metrics = roiRows ?? []
    const bySource: Record<string, { count: number; avoidedUsd: number }> = {}
    for (const row of metrics as any[]) {
      const key = String(row.source ?? 'unknown')
      const entry = bySource[key] ?? { count: 0, avoidedUsd: 0 }
      entry.count += 1
      entry.avoidedUsd += Number(row.estimated_cost_avoided_usd ?? 0)
      bySource[key] = entry
    }
    roi = {
      tasks: metrics.length,
      providerCalls: metrics.reduce((sum: number, row: any) => sum + Number(row.provider_calls ?? 0), 0),
      avoidedUsd: metrics.reduce((sum: number, row: any) => sum + Number(row.estimated_cost_avoided_usd ?? 0), 0),
      bySource,
    }
  }

  const proofComplete = independence.strictProviderIndependent && provider.cloud === 0 && provider.fallbackRate === 0 && learning.improving

  return NextResponse.json({
    ok: true,
    proofComplete,
    independence,
    provider,
    learning,
    roi,
    verdict: proofComplete
      ? 'PROVEN — COS is operating locally without OpenAI/Anthropic dependency and measured learning is improving.'
      : 'VALIDATION ACTIVE — architecture is complete; deployment/runtime evidence has not yet satisfied every proof criterion.',
  })
}
