import { NextRequest, NextResponse } from 'next/server'
import { runUniversityDistilledArtifactEvaluation } from '@/lib/ai/cos/cosUniversityDistilledArtifactEvaluation'
import { independentEvaluatorConfig } from '@/lib/ai/cos/cosUniversityIndependentEvaluator'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const HF_ROWS_ORIGIN = 'https://datasets-server.huggingface.co'

/**
 * Hugging Face's on-demand `/rows` view can return a provider-side 5xx even when the exact pinned
 * dataset is healthy. For this evaluator the holdout split is already bounded to <=100 items, so
 * `/first-rows` is an equivalent transport fallback. The evaluator still performs the authoritative
 * revision, row-count, item-hash, and manifest checks after this transport layer returns.
 *
 * Keep the override scoped to this one server invocation and restore the host fetch in finally.
 */
async function runWithHfRowsFallback<T>(runner: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch
  const patchedFetch: typeof fetch = async (input, init) => {
    const requestUrl = input instanceof URL
      ? input.toString()
      : typeof input === 'string'
        ? input
        : input.url
    const response = await originalFetch(input, init)

    if (response.ok || response.status < 500) return response

    let rowsUrl: URL
    try {
      rowsUrl = new URL(requestUrl)
    } catch {
      return response
    }
    if (rowsUrl.origin !== HF_ROWS_ORIGIN || rowsUrl.pathname !== '/rows') return response

    const fallbackUrl = new URL('/first-rows', HF_ROWS_ORIGIN)
    for (const key of ['dataset', 'config', 'split'] as const) {
      const value = rowsUrl.searchParams.get(key)
      if (value) fallbackUrl.searchParams.set(key, value)
    }
    if (!fallbackUrl.searchParams.get('dataset') || !fallbackUrl.searchParams.get('split')) {
      return response
    }

    return originalFetch(fallbackUrl, init)
  }

  globalThis.fetch = patchedFetch
  try {
    return await runner()
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // The evaluation engine keeps its existing fail-closed env seam. When no explicit Vercel secret
    // exists, hydrate only this server invocation from the separately generated service-only Vault key.
    const evaluator = await independentEvaluatorConfig()
    if (evaluator && !process.env.COS_UNIVERSITY_INDEPENDENT_EVALUATOR_SECRET) {
      process.env.COS_UNIVERSITY_INDEPENDENT_EVALUATOR_SECRET = evaluator.secret
    }
    const result = await runWithHfRowsFallback(
      () => runUniversityDistilledArtifactEvaluation(new Date()),
    )
    const skipped = 'skipped' in result && result.skipped === true
    await recordCosUniversityProductionPath({
      path: 'distilled_independent_evaluation',
      invocationSucceeded: result.ok === true,
      evidence: { ...result, runnerInvoked: !skipped, skipped },
    })
    console.info('[cos-distilled-independent-evaluation]', JSON.stringify(result))
    return NextResponse.json(result, {
      status: result.ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordCosUniversityProductionPath({
      path: 'distilled_independent_evaluation',
      invocationSucceeded: false,
      evidence: { error: message, runnerInvoked: true },
    }).catch(() => null)
    console.error('[cos-distilled-independent-evaluation]', JSON.stringify({ ok: false, error: message }))
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
