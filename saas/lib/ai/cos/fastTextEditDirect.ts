// saas/lib/ai/cos/fastTextEditDirect.ts
//
// A simple edit / rewrite / proofread / translate request must never enter the COS reasoning chain.
//
// This path intentionally avoids Supabase, persistence, council passes and long provider fallbacks.
// It uses a short bounded model cascade directly against the already-configured OpenAI-compatible
// endpoint so one slow model cannot turn a simple edit into a browser transport timeout.

export type DirectFastEditResult = { text: string; model: string; elapsedMs: number }

const DEFAULT_DEADLINE_MS = 18_000
const DEFAULT_ATTEMPT_MS = 6_000
const DEEPINFRA_FAST_MODEL = 'deepseek-ai/DeepSeek-V4-Flash'

function deadlineMs(): number {
  const parsed = Number(process.env.COS_FAST_EDIT_DEADLINE_MS || DEFAULT_DEADLINE_MS)
  return Number.isFinite(parsed) && parsed >= 3_000 && parsed <= 30_000 ? Math.floor(parsed) : DEFAULT_DEADLINE_MS
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

/** Reasoning models emit <think> blocks and some wrap answers in fences or JSON. Unwrap all three. */
function stripWrapper(value: string): string {
  let text = String(value || '')
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
  const strayThink = text.search(/<think>/i)
  if (strayThink >= 0) text = text.slice(0, strayThink)
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
    } catch {
      // Not JSON after all — keep the literal text.
    }
  }

  return text
}

async function callFastEditor(input: {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  timeoutMs: number
}): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), input.timeoutMs)
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
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: input.prompt },
        ],
      }),
    })

    if (!response.ok) return null
    const payload: any = await response.json().catch(() => null)
    const raw = String(payload?.choices?.[0]?.message?.content ?? '')
    const text = stripWrapper(raw)
    return text || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function runDirectFastTextEdit(prompt: string): Promise<DirectFastEditResult | null> {
  const baseUrl = normalizeBaseUrl(process.env.LOCAL_AI_BASE_URL || '')
  const configuredModel = String(process.env.LOCAL_AI_MODEL || '').trim()
  const apiKey = String(process.env.LOCAL_AI_API_KEY || '').trim()
  const input = String(prompt || '').trim()
  if (!baseUrl || !configuredModel || !input) return null

  const startedAt = Date.now()
  const totalBudgetMs = deadlineMs()
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
  return null
}
