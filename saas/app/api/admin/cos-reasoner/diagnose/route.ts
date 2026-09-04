// saas/app/api/admin/cos-reasoner/diagnose/route.ts
//
// Owner-only. One click, one answer: WHY did COS return nothing?
//
// /api/admin/cos-reasoner/health answers "did the endpoint respond" and has been answering yes
// throughout this outage. This answers the three questions that actually distinguish the failures —
// reachable, has the configured model, and can produce a real completion — and reports the raw
// endpoint error text that callLocalModel() throws away.
//
// Read-only: one model-list GET and one 16-token generation. The optional readiness step is retained
// for API compatibility even though the managed inference runtime has no server-owned pod lifecycle.

import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { probeReasoner } from '@/lib/ai/cos/reasonerProbe'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { checkLocalEmbeddingHealth, embeddingEndpointIsSeparate, embeddingInferenceConfig, LOCAL_EMBEDDING_DIMENSIONS } from '@/lib/ai/cos/localEmbeddings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  // Preserve the existing ?wake=false diagnostic contract. On managed inference, readiness is a
  // no-op and the probe itself is the authoritative availability check.
  const wake = request.nextUrl.searchParams.get('wake') !== 'false'
  let wakeError: string | null = null

  const run = async () => {
    if (wake) {
      try {
        await ensureLocalInferenceRuntimeReady()
      } catch (error) {
        // A readiness failure is reported, never fatal: the probe below still records what the
        // endpoint does right now, and its result is the more specific evidence.
        wakeError = error instanceof Error ? error.message : String(error)
      }
    }
    return probeReasoner()
  }

  // The reasoner probe says nothing about embeddings, and embeddings are the half that fails
  // SILENTLY during a provider migration: chat completions succeed while every vector call is
  // rejected for wrong dimensions, so the semantic cache and corpus retrieval — i.e. learning —
  // stop working with no visible error. Report both halves from one call.
  const embeddingCheck = async () => {
    const health = await checkLocalEmbeddingHealth()
    return {
      ...health,
      separateEndpoint: embeddingEndpointIsSeparate(),
      baseUrl: embeddingInferenceConfig().baseUrl,
      requiredDimensions: LOCAL_EMBEDDING_DIMENSIONS,
      note: health.ok
        ? undefined
        : `Embeddings must return ${LOCAL_EMBEDDING_DIMENSIONS} dimensions to match cos_knowledge_records. If the reasoner moved to a provider without a 768-dimension model, set LOCAL_AI_EMBEDDING_BASE_URL to keep embeddings where they work.`,
    }
  }

  const embeddings = await embeddingCheck().catch(error => ({
    ok: false,
    model: 'unknown',
    error: error instanceof Error ? error.message : String(error),
    separateEndpoint: embeddingEndpointIsSeparate(),
    baseUrl: '',
    requiredDimensions: LOCAL_EMBEDDING_DIMENSIONS,
    note: undefined as string | undefined,
  }))

  const result = await run()

  return NextResponse.json(
    // ok requires BOTH halves. A green reasoner with broken embeddings is not a working COS.
    { ok: result.verdict === 'ok' && embeddings.ok, wakeAttempted: wake, wakeError, embeddings, ...result },
    { status: result.verdict === 'ok' && embeddings.ok ? 200 : 503 },
  )
}
