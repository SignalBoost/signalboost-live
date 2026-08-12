import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { checkLocalInferenceHealth, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { checkLocalEmbeddingHealth } from '@/lib/ai/cos/localEmbeddings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const resolved = resolveCosReasoner()
  if ('reason' in resolved) {
    return NextResponse.json({
      ok: false,
      configured: false,
      healthy: false,
      model: null,
      embedding: null,
      reason: resolved.reason,
      fallbackEnabled: process.env.COS_EXTERNAL_AI_FALLBACK_ENABLED !== 'false',
    })
  }

  try {
    const config = localInferenceConfigFromEnv()
    const [reasonerHealth, embeddingHealth] = await Promise.all([
      checkLocalInferenceHealth(config),
      checkLocalEmbeddingHealth(),
    ])
    const healthy = reasonerHealth.ok && embeddingHealth.ok
    const error = !reasonerHealth.ok
      ? reasonerHealth.error ?? 'Local reasoner is unhealthy.'
      : !embeddingHealth.ok
        ? embeddingHealth.error ?? 'Local embedding model is unhealthy.'
        : null

    return NextResponse.json({
      ok: healthy,
      configured: true,
      healthy,
      model: reasonerHealth.model,
      reasoner: resolved.config.label,
      reasonerHealth: {
        healthy: reasonerHealth.ok,
        model: reasonerHealth.model,
        error: reasonerHealth.error ?? null,
      },
      embedding: {
        healthy: embeddingHealth.ok,
        model: embeddingHealth.model,
        dimensions: embeddingHealth.dimensions ?? null,
        error: embeddingHealth.error ?? null,
      },
      error,
      fallbackEnabled: process.env.COS_EXTERNAL_AI_FALLBACK_ENABLED !== 'false',
    }, { status: healthy ? 200 : 503 })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      configured: true,
      healthy: false,
      model: process.env.LOCAL_AI_MODEL?.trim() || null,
      embedding: {
        healthy: false,
        model: process.env.LOCAL_AI_EMBEDDING_MODEL?.trim() || 'nomic-embed-text',
        dimensions: null,
        error: error instanceof Error ? error.message : String(error),
      },
      reasoner: resolved.config.label,
      error: error instanceof Error ? error.message : String(error),
      fallbackEnabled: process.env.COS_EXTERNAL_AI_FALLBACK_ENABLED !== 'false',
    }, { status: 503 })
  }
}
