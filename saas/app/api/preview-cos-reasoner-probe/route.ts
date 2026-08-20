import { NextResponse } from 'next/server'
import { localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { embeddingEndpointIsSeparate, embeddingInferenceConfig, LOCAL_EMBEDDING_DIMENSIONS } from '@/lib/ai/cos/localEmbeddings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

const CHECK_TIMEOUT_MS = 8_000

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey } : {}
}

async function fetchBounded(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'test/deepinfra-preview-20260820') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  let reasonerConfig
  let embeddingConfig
  try {
    reasonerConfig = localInferenceConfigFromEnv()
    embeddingConfig = embeddingInferenceConfig()
  } catch (error) {
    return NextResponse.json({
      ok: false,
      stage: 'config',
      error: error instanceof Error ? error.message : String(error),
    }, { status: 503 })
  }

  const reasonerStartedAt = Date.now()
  const reasonerPromise = (async () => {
    try {
      const response = await fetchBounded(`${reasonerConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(reasonerConfig.apiKey),
        },
        body: JSON.stringify({
          model: reasonerConfig.model,
          max_tokens: 16,
          temperature: 0,
          messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
        }),
      })
      const raw = await response.text()
      let text: string | null = null
      try {
        const payload = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> }
        text = payload.choices?.[0]?.message?.content?.trim() || null
      } catch {}
      return {
        ok: response.ok && Boolean(text),
        httpStatus: response.status,
        latencyMs: Date.now() - reasonerStartedAt,
        text,
        bodyExcerpt: response.ok ? null : raw.replace(/\s+/g, ' ').slice(0, 500),
      }
    } catch (error) {
      return {
        ok: false,
        httpStatus: null,
        latencyMs: Date.now() - reasonerStartedAt,
        text: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })()

  const embeddingStartedAt = Date.now()
  const embeddingPromise = (async () => {
    try {
      const response = await fetchBounded(`${embeddingConfig.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(embeddingConfig.apiKey),
        },
        body: JSON.stringify({
          model: embeddingConfig.model,
          input: 'COS embedding health check',
        }),
      })
      const raw = await response.text()
      let dimensions: number | null = null
      try {
        const payload = JSON.parse(raw) as { data?: Array<{ embedding?: number[] }> }
        dimensions = Array.isArray(payload.data?.[0]?.embedding) ? payload.data![0].embedding!.length : null
      } catch {}
      return {
        ok: response.ok && dimensions === LOCAL_EMBEDDING_DIMENSIONS,
        httpStatus: response.status,
        latencyMs: Date.now() - embeddingStartedAt,
        model: embeddingConfig.model,
        dimensions,
        requiredDimensions: LOCAL_EMBEDDING_DIMENSIONS,
        separateEndpoint: embeddingEndpointIsSeparate(),
        baseUrl: embeddingConfig.baseUrl,
        bodyExcerpt: response.ok ? null : raw.replace(/\s+/g, ' ').slice(0, 500),
      }
    } catch (error) {
      return {
        ok: false,
        httpStatus: null,
        latencyMs: Date.now() - embeddingStartedAt,
        model: embeddingConfig.model,
        dimensions: null,
        requiredDimensions: LOCAL_EMBEDDING_DIMENSIONS,
        separateEndpoint: embeddingEndpointIsSeparate(),
        baseUrl: embeddingConfig.baseUrl,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })()

  const [completion, embeddings] = await Promise.all([reasonerPromise, embeddingPromise])
  const ok = completion.ok === true && embeddings.ok === true

  return NextResponse.json({
    ok,
    previewOnly: true,
    reasoner: {
      baseUrl: reasonerConfig.baseUrl,
      model: reasonerConfig.model,
      apiKeyPresent: Boolean(reasonerConfig.apiKey),
      completion,
    },
    embeddings,
  }, { status: ok ? 200 : 503 })
}
