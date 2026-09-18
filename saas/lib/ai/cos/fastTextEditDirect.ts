// saas/lib/ai/cos/fastTextEditDirect.ts
//
// Latency-sensitive text editing only. This path intentionally avoids Supabase, persistence,
// council passes, tools, and long provider fallbacks. Every model attempt is abortable and the
// complete edit lane is bounded so no abandoned request can live until the platform's 300s limit.

export type DirectFastEditResult = { text: string; model: string; elapsedMs: number }

const DEFAULT_DEADLINE_MS = 20_000
const DEFAULT_ATTEMPT_MS = 6_000
const DEEPINFRA_FAST_MODEL = 'deepseek-ai/DeepSeek-V4-Flash'

function deadlineMs(): number {
  const parsed = Number(process.env.COS_FAST_EDIT_DEADLINE_MS || DEFAULT_DEADLINE_MS)
  return Number.isFinite(parsed) && parsed >= 3_000 && parsed <= 25_000 ? Math.floor(parsed) : DEFAULT_DEADLINE_MS
}

function attemptMs(): number {
  const parsed = Number(process.env.COS_FAST_EDIT_ATTEMPT_MS || DEFAULT_ATTEMPT_MS)
  return Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 10_000 ? Math.floor(parsed) : DEFAULT_ATTEMPT_MS
}

function normalizeBaseUrl(value: string): string {
  return String(value || '').trim().replace(/\/+$/, '')
}

function modelCandidates(baseUrl: string, configuredModel: string): string[] {
  const preferred = String(process.env.COS_FAST_TEXT_MODEL || '').trim()
  const deepInfra = /deepinfra/i.test(baseUrl)
  return [...new Set([
    preferred,
    deepInfra ? DEEPINFRA_FAST_MODEL : '',
    configuredModel,
  ].map(value => value.trim()).filter(Boolean))]
}

const SYSTEM_PROMPT = [
  'You are a text editor. Apply only the edit the user asks for: correct spelling, grammar and punctuation, or rewrite, shorten, polish, or translate as instructed.',
  'Preserve the meaning and every fact exactly. Do not research, browse, use tools, explain your changes, or add commentary.',
  'Return the edited text and nothing else. No preamble, no quotes, no markdown fences, no JSON.',
].join(' ')

function stripWrapper(value: string): string {
  let text = String(value || '')
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
  const strayThink = text.search(/<think>/i)
  if (strayThink >= 0) text = text.slice(0, strayThink)
  text = text.replace(/\/no_?think/gi, '')
  text = text.trim()

  const fence = text.match(/^\`\`\`[a-z]*\s*\n?([\s\S]*?)\n?\`\`\`$/i)
  if (fence?.[1]) text = fence[1].trim()

  if (/^\{[\s\S]*\}$/.test(text)) {
    try {
      const parsed = JSON.parse(text)
      const answer = typeof parsed?.answer === 'string'
        ? parsed.answer
        : typeof parsed?.text === 'string'
          ? parsed.text
          : ''
      if (answer.trim()) return answer.trim()
    } catch {}
  }

  return text
}

function warn(detail: Record<string, unknown>): void {
  console.warn('[cos-fast-text-edit-direct]', JSON.stringify(detail))
}

async function callFastEditor(input: {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  timeoutMs: number
}): Promise<string | null> {
  const controller = new AbortController()
  const startedAt = Date.now()
  const timer = setTimeout(() => controller.abort(), input.timeoutMs)

  // Qwen3 is a thinking model, and hosted runtimes disagree about how to switch that off: vLLM
  // reads chat_template_kwargs.enable_thinking, Ollama reads think, OpenAI-compatible gateways read
  // reasoning_effort. A runtime that does not recognise a field drops it silently, so send all
  // three AND Qwen3's own /no_think system switch, which still works when every parameter is
  // dropped. Measured in Production (local-inference.ts:181): with thinking on, a small token
  // budget is spent entirely on hidden reasoning and NO answer text comes back — against this
  // path's 6s per-attempt ceiling that meant every attempt aborted and every edit fell through.
  const thinkingModel = /qwen/i.test(input.model)
  const systemContent = thinkingModel ? `${SYSTEM_PROMPT} /no_think` : SYSTEM_PROMPT

  try {
    const response = await fetch(`${input.baseUrl}/chat/completions`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}`, 'x-api-key': input.apiKey } : {}),
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.1,
        max_tokens: 900,
        stream: false,
        reasoning_effort: 'none',
        ...(thinkingModel ? { think: false, chat_template_kwargs: { enable_thinking: false } } : {}),
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: input.prompt },
        ],
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      warn({ stage: 'http_error', model: input.model, status: response.status, elapsedMs: Date.now() - startedAt, detail: detail.slice(0, 300) })
      return null
    }

    const payload: any = await response.json().catch(() => null)
    const raw = String(payload?.choices?.[0]?.message?.content ?? '')
    const text = stripWrapper(raw)
    if (!text) {
      warn({
        stage: 'empty_content',
        model: input.model,
        elapsedMs: Date.now() - startedAt,
        finishReason: payload?.choices?.[0]?.finish_reason ?? null,
        completionTokens: payload?.usage?.completion_tokens ?? null,
      })
      return null
    }
    return text
  } catch (error) {
    warn({
      stage: controller.signal.aborted ? 'deadline_abort' : 'transport_error',
      model: input.model,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  } finally {
    clearTimeout(timer)
  }
}

type FastEditEndpoint = {
  label: string
  baseUrl: string
  apiKey: string
  configuredModel: string
}

/** Resolving the primary must never eat the edit budget, so the readiness probe is itself bounded. */
const PRIMARY_RESOLVE_MS = 2_500

/**
 * RunPod is the iTMounts primary and the configured LOCAL_AI transport is a bounded fallback
 * (local-inference.ts: "ordinary iTMounts text inference prefers the verified RunPod primary and
 * uses the configured LOCAL_AI/DeepInfra transport only as a bounded fallback").
 *
 * This lane used to read LOCAL_AI_BASE_URL directly with a raw fetch, so it bypassed that policy
 * entirely and every text edit was served by the FALLBACK provider while the primary sat unused.
 * Resolve the same primary callLocalModel resolves, then keep the configured transport behind it.
 */
async function fastEditEndpoints(): Promise<FastEditEndpoint[]> {
  const endpoints: FastEditEndpoint[] = []

  try {
    const primary = await import('./runpodPrimaryInference.ts')
    const resolved = await Promise.race([
      primary.resolveReadyRunpodPrimaryConfig('reasoner'),
      new Promise<null>(resolve => setTimeout(() => resolve(null), PRIMARY_RESOLVE_MS)),
    ])
    if (resolved?.baseUrl && resolved.model) {
      endpoints.push({
        label: 'runpod-primary',
        baseUrl: normalizeBaseUrl(resolved.baseUrl),
        apiKey: String(resolved.apiKey || '').trim(),
        configuredModel: String(resolved.model).trim(),
      })
    } else {
      warn({ stage: 'primary_unavailable', reason: 'not_ready_or_resolve_timeout' })
    }
  } catch (error) {
    warn({ stage: 'primary_unavailable', reason: error instanceof Error ? error.message : String(error) })
  }

  const fallbackBaseUrl = normalizeBaseUrl(process.env.LOCAL_AI_BASE_URL || '')
  const fallbackModel = String(process.env.LOCAL_AI_MODEL || '').trim()
  if (fallbackBaseUrl && fallbackModel) {
    endpoints.push({
      label: 'configured-fallback',
      baseUrl: fallbackBaseUrl,
      apiKey: String(process.env.LOCAL_AI_API_KEY || '').trim(),
      configuredModel: fallbackModel,
    })
  }

  return endpoints
}

export async function runDirectFastTextEdit(prompt: string): Promise<DirectFastEditResult | null> {
  const input = String(prompt || '').trim()
  if (!input) {
    warn({ stage: 'not_configured', hasInput: false })
    return null
  }

  const startedAt = Date.now()
  const totalBudgetMs = deadlineMs()
  const endpoints = await fastEditEndpoints()
  if (!endpoints.length) {
    warn({ stage: 'not_configured', hasBaseUrl: false, hasModel: false, hasInput: true })
    return null
  }

  for (const endpoint of endpoints) {
    const { baseUrl, apiKey, configuredModel } = endpoint
    for (const model of modelCandidates(baseUrl, configuredModel)) {
      const remainingMs = totalBudgetMs - (Date.now() - startedAt)
      if (remainingMs < 1_000) break
      const text = await callFastEditor({
        baseUrl,
        apiKey,
        model,
        prompt: input,
        timeoutMs: Math.min(attemptMs(), remainingMs),
      })
      if (text) return { text, model, elapsedMs: Date.now() - startedAt }
    }
  }

  warn({ stage: 'all_candidates_failed', elapsedMs: Date.now() - startedAt, endpoints: endpoints.map(e => e.label) })
  return null
}
