// Preview-only acceptance probe for the DeepInfra COS migration.
// Never expose credentials or reasoning traces. This endpoint exists only on the dedicated Preview branch.
import { NextResponse } from 'next/server'
import { localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { LOCAL_EMBEDDING_DIMENSIONS } from '@/lib/ai/cos/localEmbeddings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

const CHECK_TIMEOUT_MS = 8_000
const EMBEDDING_CANDIDATE = 'BAAI/bge-base-en-v1.5'

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

  let config
  try {
    config = localInferenceConfigFromEnv()
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
      const response = await fetchBounded(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(config.apiKey),
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 256,
          temperature: 0,
          reasoning_effort: 'none',
          messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
        }),
      })
      const raw = await response.text()
      let text: string | null = null
      let finishReason: string | null = null
      let completionTokens: number | null = null
      let reasoningPresent = false
      try {
        const payload = JSON.parse(raw) as {
          choices?: Array<{
            finish_reason?: string | null
            message?: { content?: string | null; reasoning_content?: unknown; reasoning?: unknown }
          }>
          usage?: { completion_tokens?: number }
        }
        const message = payload.choices?.[0]?.message
        text = typeof message?.content === 'string' ? message.content.trim() || null : null
        finishReason = payload.choices?.[0]?.finish_reason ?? null
        completionTokens = typeof payload.usage?.completion_tokens === 'number' ? payload.usage.completion_tokens : null
        reasoningPresent = Boolean(message && (message.reasoning_content != null || message.reasoning != null))
      } catch {}
      return {
        ok: response.ok && Boolean(text),
        httpStatus: response.status,
        latencyMs: Date.now() - reasonerStartedAt,
        text,
        finishReason,
        completionTokens,
        reasoningPresent,
        bodyExcerpt: response.ok ? null : raw.replace(/\s+/g, ' ').slice(0, 500),
      }
    } catch (error) {
      return {
        ok: false,
        httpStatus: null,
        latencyMs: Date.now() - reasonerStartedAt,
        text: null,
        finishReason: null,
        completionTokens: null,
        reasoningPresent: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })()

  // Candidate-only embedding test. Do not alter COS embedding configuration until this proves 768 dimensions.
  const embeddingStartedAt = Date.now()
  const embeddingPromise = (async () => {
    try {
      const response = await fetchBounded(`${config.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(config.apiKey),
        },
        body: JSON.stringify({
          model: EMBEDDING_CANDIDATE,
          input: 'COS embedding migration acceptance check',
          encoding_format: 'float',
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
        model: EMBEDDING_CANDIDATE,
        dimensions,
        requiredDimensions: LOCAL_EMBEDDING_DIMENSIONS,
        baseUrl: config.baseUrl,
        bodyExcerpt: response.ok ? null : raw.replace(/\s+/g, ' ').slice(0, 500),
      }
    } catch (error) {
      return {
        ok: false,
        httpStatus: null,
        latencyMs: Date.now() - embeddingStartedAt,
        model: EMBEDDING_CANDIDATE,
        dimensions: null,
        requiredDimensions: LOCAL_EMBEDDING_DIMENSIONS,
        baseUrl: config.baseUrl,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })()

  const [completion, embeddingCandidate] = await Promise.all([reasonerPromise, embeddingPromise])
  const ok = completion.ok === true && embeddingCandidate.ok === true

  return NextResponse.json({
    ok,
    previewOnly: true,
    reasoner: {
      baseUrl: config.baseUrl,
      model: config.model,
      apiKeyPresent: Boolean(config.apiKey),
      completion,
    },
    embeddingCandidate,
    note: ok
      ? 'DeepInfra reasoner and 768-dimension embedding candidate both passed. Safe to configure Preview embedding model next.'
      : 'No COS learning writes should run on this Preview until both checks pass.',
  }, { status: ok ? 200 : 503 })
}
