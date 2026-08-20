import { NextResponse } from 'next/server'
import { localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { checkLocalEmbeddingHealth, embeddingEndpointIsSeparate, embeddingInferenceConfig, LOCAL_EMBEDDING_DIMENSIONS } from '@/lib/ai/cos/localEmbeddings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey } : {}
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

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  const startedAt = Date.now()
  let completion: Record<string, unknown>
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(config.apiKey),
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
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
    } catch {
      // Keep the response excerpt below; never echo credentials.
    }
    completion = {
      ok: response.ok && Boolean(text),
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      text,
      bodyExcerpt: response.ok ? null : raw.replace(/\s+/g, ' ').slice(0, 500),
    }
  } catch (error) {
    completion = {
      ok: false,
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      text: null,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timeout)
  }

  const embeddingConfig = embeddingInferenceConfig()
  const embeddings = await checkLocalEmbeddingHealth()
    .then(health => ({
      ...health,
      separateEndpoint: embeddingEndpointIsSeparate(),
      baseUrl: embeddingConfig.baseUrl,
      requiredDimensions: LOCAL_EMBEDDING_DIMENSIONS,
    }))
    .catch(error => ({
      ok: false,
      model: process.env.LOCAL_AI_EMBEDDING_MODEL?.trim() || 'nomic-embed-text',
      error: error instanceof Error ? error.message : String(error),
      separateEndpoint: embeddingEndpointIsSeparate(),
      baseUrl: embeddingConfig.baseUrl,
      requiredDimensions: LOCAL_EMBEDDING_DIMENSIONS,
    }))

  const ok = completion.ok === true && embeddings.ok === true
  return NextResponse.json({
    ok,
    previewOnly: true,
    reasoner: {
      baseUrl: config.baseUrl,
      model: config.model,
      apiKeyPresent: Boolean(config.apiKey),
      completion,
    },
    embeddings,
  }, { status: ok ? 200 : 503 })
}
