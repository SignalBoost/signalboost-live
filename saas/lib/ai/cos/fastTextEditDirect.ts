// saas/lib/ai/cos/fastTextEditDirect.ts
//
// A simple edit / rewrite / proofread / translate request must never enter the COS reasoning chain.
// One abortable completion owns the whole task. No council, repair passes, provider fallback,
// Supabase, telemetry, persistence, or abandoned Promise continues after the deadline.

export type DirectFastEditResult = {
  text: string
  model: string
  provider: string
  external: boolean
  elapsedMs: number
}

const DEFAULT_DEADLINE_MS = 20_000

function deadlineMs(): number {
  const parsed = Number(process.env.COS_FAST_EDIT_DEADLINE_MS || DEFAULT_DEADLINE_MS)
  return Number.isFinite(parsed) && parsed >= 2_000 && parsed <= 60_000
    ? Math.floor(parsed)
    : DEFAULT_DEADLINE_MS
}

function normalizeBaseUrl(value: string): string {
  return String(value || '').trim().replace(/\/+$/, '')
}

function selectedModel(baseUrl: string): string {
  const explicit = String(process.env.COS_FAST_TEXT_MODEL || '').trim()
  if (explicit) return explicit
  if (/deepinfra/i.test(baseUrl)) return 'deepseek-ai/DeepSeek-V4-Flash'
  return String(process.env.LOCAL_AI_MODEL || '').trim()
}

function providerLabel(baseUrl: string): { provider: string; external: boolean } {
  const configured = String(process.env.LOCAL_AI_PROVIDER || '').trim()
  if (/deepinfra/i.test(baseUrl) || /deepinfra/i.test(configured)) return { provider: 'deepinfra', external: true }
  if (/runpod/i.test(baseUrl) || /runpod/i.test(configured)) return { provider: 'runpod', external: false }
  return { provider: configured || 'self_hosted', external: configured !== '' && configured !== 'self_hosted' }
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

export async function runDirectFastTextEdit(prompt: string): Promise<DirectFastEditResult | null> {
  const baseUrl = normalizeBaseUrl(process.env.LOCAL_AI_BASE_URL || '')
  const model = selectedModel(baseUrl)
  const apiKey = String(process.env.LOCAL_AI_API_KEY || '').trim()
  const input = String(prompt || '').trim()
  if (!baseUrl || !model || !input) return null

  const controller = new AbortController()
  const startedAt = Date.now()
  const timer = setTimeout(() => controller.abort(), deadlineMs())

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 1200,
        stream: false,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: input },
        ],
      }),
    })

    if (!response.ok) return null
    const payload: any = await response.json().catch(() => null)
    const raw = String(payload?.choices?.[0]?.message?.content ?? '')
    const text = stripWrapper(raw)
    if (!text) return null
    const provider = providerLabel(baseUrl)
    return { text, model, provider: provider.provider, external: provider.external, elapsedMs: Date.now() - startedAt }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
