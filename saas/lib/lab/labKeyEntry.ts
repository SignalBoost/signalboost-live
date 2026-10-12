// saas/lib/lab/labKeyEntry.ts
// One-paste key entry for the customer LAB: clean what people paste, recognise the provider from the key itself,
// name the key automatically, and check it with the provider before it is stored.
// Shared by the browser (cleaning, detection, naming) and the server (all four). No secrets are logged or returned.

/** Strips what commonly comes along with a copied key: whitespace/newlines, wrapping quotes, a "Bearer " prefix. */
export function cleanPastedKey(raw: unknown): string {
  let key = String(raw ?? '').trim()
  key = key.replace(/^bearer\s+/i, '')
  key = key.replace(/^['"`]+|['"`]+$/g, '')
  return key.replace(/\s+/g, '')
}

// Only prefixes that identify one provider. Generic "sk-" keys (OpenAI, DeepSeek, Qwen, …) are left to the person.
const KEY_PREFIXES: ReadonlyArray<readonly [RegExp, string]> = Object.freeze([
  [/^sk-ant-/, 'anthropic'],
  [/^sk-or-/, 'openrouter'],
  [/^hf_/, 'huggingface'],
  [/^gsk_/, 'groq'],
  [/^xai-/, 'xai'],
  [/^AIza/, 'gemini'],
  [/^fw_/, 'fireworks'],
] as const)

/** The provider a key belongs to when its prefix is unambiguous, else null. */
export function detectProviderFromKey(key: string): string | null {
  const clean = cleanPastedKey(key)
  return KEY_PREFIXES.find(([pattern]) => pattern.test(clean))?.[1] ?? null
}

/** "Together AI ··· 3f9a": readable, unique enough, never more than the last four characters of the key. */
export function autoKeyLabel(providerName: string, key: string): string {
  const clean = cleanPastedKey(key)
  return `${providerName} ··· ${clean.slice(-4)}`.slice(0, 80)
}

// --- Live check (server only) ------------------------------------------------------------------------------------
export type KeyCheck = 'valid' | 'rejected' | 'unverified'
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

// Read-only endpoints that need a valid key. A key is REJECTED only when the provider says so (401/403, or Gemini's
// API_KEY_INVALID); anything else (timeouts, 5xx, an endpoint that answers without auth) leaves the key UNVERIFIED and
// it is still saved, so a check can never block a real key.
const CHECKS: Readonly<Record<string, { url: string; auth: 'bearer' | 'anthropic' | 'gemini' }>> = Object.freeze({
  huggingface: { url: 'https://huggingface.co/api/whoami-v2', auth: 'bearer' },
  openai: { url: 'https://api.openai.com/v1/models', auth: 'bearer' },
  anthropic: { url: 'https://api.anthropic.com/v1/models?limit=1', auth: 'anthropic' },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', auth: 'gemini' },
  xai: { url: 'https://api.x.ai/v1/models', auth: 'bearer' },
  deepseek: { url: 'https://api.deepseek.com/models', auth: 'bearer' },
  qwen: { url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models', auth: 'bearer' },
  mistral: { url: 'https://api.mistral.ai/v1/models', auth: 'bearer' },
  groq: { url: 'https://api.groq.com/openai/v1/models', auth: 'bearer' },
  openrouter: { url: 'https://openrouter.ai/api/v1/key', auth: 'bearer' },
  together: { url: 'https://api.together.xyz/v1/models', auth: 'bearer' },
  fireworks: { url: 'https://api.fireworks.ai/inference/v1/models', auth: 'bearer' },
  deepinfra: { url: 'https://api.deepinfra.com/v1/me', auth: 'bearer' },
})

/** Checks a key with its provider. `modelsUrl` is required for openai_compatible (already validated as public https). */
export async function checkProviderKey(input: { kind: string; key: string; modelsUrl?: string | null; fetcher: Fetcher }): Promise<KeyCheck> {
  const spec = input.kind === 'openai_compatible'
    ? (input.modelsUrl ? { url: input.modelsUrl, auth: 'bearer' as const } : null)
    : CHECKS[input.kind] ?? null
  if (!spec) return 'unverified'
  const headers: Record<string, string> = { accept: 'application/json' }
  if (spec.auth === 'bearer') headers.authorization = `Bearer ${input.key}`
  if (spec.auth === 'anthropic') { headers['x-api-key'] = input.key; headers['anthropic-version'] = '2023-06-01' }
  if (spec.auth === 'gemini') headers['x-goog-api-key'] = input.key
  let response: Response
  try {
    response = await input.fetcher(spec.url, { method: 'GET', headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) })
  } catch {
    return 'unverified'
  }
  if (response.status === 401 || response.status === 403) return 'rejected'
  if (input.kind === 'gemini' && response.status === 400) {
    const body = await response.text().catch(() => '')
    if (/API_KEY_INVALID|API key not valid/i.test(body)) return 'rejected'
  }
  return response.ok ? 'valid' : 'unverified'
}
