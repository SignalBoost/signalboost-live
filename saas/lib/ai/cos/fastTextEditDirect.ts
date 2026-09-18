// saas/lib/ai/cos/fastTextEditDirect.ts
//
// A simple edit / rewrite / proofread / translate request must never enter the COS reasoning chain.
//
// The previous fast path raced a 12-second timer against callRawCosReasoner. Promise.race GIVES UP —
// it does not cancel. The abandoned chain kept running (draft 45.9s -> quality repair 60.0s ->
// citation repair 38.7s -> managed-provider fallback 120.0s), the invocation never closed, and the
// platform killed it at 300s — destroying the 503 response that had already been built at 12s.
//
// This module issues exactly ONE abortable OpenAI-compatible completion. No council, no repair
// passes, no fallback provider, no Supabase, no telemetry, no persistence. It either returns text
// inside the deadline or it aborts the socket and returns null. Nothing outlives the call.

export type DirectFastEditResult = { text: string; model: string; elapsedMs: number }

const DEFAULT_DEADLINE_MS = 20_000

function deadlineMs(): number {
  const parsed = Number(process.env.COS_FAST_EDIT_DEADLINE_MS || DEFAULT_DEADLINE_MS)
  return Number.isFinite(parsed) && parsed >= 2_000 && parsed <= 60_000 ? Math.floor(parsed) : DEFAULT_DEADLINE_MS
}

function normalizeBaseUrl(value: string): string {
  return String(value || '').trim().replace(/\/+$/, '')
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

  const fence = text.match(/^```[a-z]*\s*\n?([\s\S]*?)\n?```$/i)
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

export async function runDirectFastTextEdit(prompt: string): Promise<DirectFastEditResult | null> {
  const baseUrl = normalizeBaseUrl(process.env.LOCAL_AI_BASE_URL || '')
  const model = String(process.env.LOCAL_AI_MODEL || '').trim()
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
    return { text, model, elapsedMs: Date.now() - startedAt }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
