import { NextRequest, NextResponse } from 'next/server'
import { readPinnedHfParquetRows } from '@/lib/ai/cos/hfPinnedParquetRows'
import { runUniversityDistilledArtifactEvaluation } from '@/lib/ai/cos/cosUniversityDistilledArtifactEvaluation'
import { independentEvaluatorConfig } from '@/lib/ai/cos/cosUniversityIndependentEvaluator'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const HF_HUB_ORIGIN = 'https://huggingface.co'
const HF_ROWS_ORIGIN = 'https://datasets-server.huggingface.co'
const HEX40 = /^[a-f0-9]{40}$/i

type PinnedDatasetMetadata = Readonly<{
  revision: string
  siblings: ReadonlyArray<Readonly<{ rfilename?: unknown }>>
}>

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  return input instanceof URL
    ? input.toString()
    : typeof input === 'string'
      ? input
      : input.url
}

function metadataRepoId(url: URL): string | null {
  if (url.origin !== HF_HUB_ORIGIN) return null
  const match = /^\/api\/datasets\/([^/]+)\/([^/]+)$/.exec(url.pathname)
  if (!match) return null
  try {
    return `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`
  } catch {
    return null
  }
}

/**
 * Private datasets do not reliably expose Dataset Viewer `/rows` or `/first-rows`. Capture the exact
 * Hub revision already fetched by the evaluator, then on a Dataset Viewer provider 5xx read only the
 * pinned holdout Parquet shards from the private Hub repo and synthesize the same `{ rows: [{row}] }`
 * transport shape. The evaluator still performs the authoritative revision, count, SHA-256 item,
 * identity-set, and manifest checks before any model call.
 *
 * Keep the override scoped to this one server invocation and restore the host fetch in finally.
 */
async function runWithPinnedHfParquetFallback<T>(runner: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch
  const pinned = new Map<string, PinnedDatasetMetadata>()
  const patchedFetch: typeof fetch = async (input, init) => {
    const rawUrl = requestUrl(input)
    const response = await originalFetch(input, init)

    let url: URL | null = null
    try { url = new URL(rawUrl) } catch { url = null }
    if (url && response.ok) {
      const repoId = metadataRepoId(url)
      if (repoId) {
        try {
          const metadata: any = await response.clone().json()
          const revision = String(metadata?.sha || '').trim().toLowerCase()
          if (HEX40.test(revision)) {
            pinned.set(repoId, {
              revision,
              siblings: Array.isArray(metadata?.siblings) ? metadata.siblings : [],
            })
          }
        } catch {
          // The evaluator owns metadata validation; absence here simply disables the transport fallback.
        }
      }
    }

    if (response.ok || response.status < 500 || !url) return response
    if (url.origin !== HF_ROWS_ORIGIN || url.pathname !== '/rows') return response

    const repoId = url.searchParams.get('dataset')?.trim() || ''
    const split = url.searchParams.get('split')?.trim() || ''
    const metadata = pinned.get(repoId)
    const token = process.env.HF_TOKEN?.trim() || ''
    if (!metadata || !repoId || !split || token.length < 20) return response

    const rows = await readPinnedHfParquetRows({
      repoId,
      revision: metadata.revision,
      split,
      token,
      siblings: metadata.siblings,
      fetchImpl: originalFetch,
    })
    return new Response(JSON.stringify({
      rows: rows.map((row, rowIdx) => ({ row_idx: rowIdx, row })),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
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
    const result = await runWithPinnedHfParquetFallback(
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
