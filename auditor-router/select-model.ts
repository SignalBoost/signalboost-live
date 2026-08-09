// auditor-router/select-model.ts
//
// Task-aware model router for the Portable AI Auditor.
//
// Routing policy:
//   • All tasks → OpenAI FIRST, fall back to Anthropic (claude-sonnet-4-6)
//
// Each task tries OpenAI first; on ANY failure (error, rate-limit,
// timeout, empty output) it gracefully falls back to Anthropic so an
// audit never dies just because one vendor hiccupped.
//
// Env required: OPENAI_API_KEY, ANTHROPIC_API_KEY

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

// ── Models (override via env without touching code) ──────────────────────────
const OPENAI_MODEL = process.env.AUDITOR_OPENAI_MODEL || 'gpt-4o'
const ANTHROPIC_MODEL = process.env.AUDITOR_ANTHROPIC_MODEL || 'claude-sonnet-4-6'
const ANTHROPIC_MAX_TOKENS = Number(process.env.AUDITOR_ANTHROPIC_MAX_TOKENS || 8000)

// ── Task taxonomy ────────────────────────────────────────────────────────────
export type TaskKind = 'audit' | 'general'
export type Provider = 'openai' | 'anthropic'

export type RouteResult = {
  ok: boolean
  text: string
  providerUsed: Provider | null
  modelUsed: string | null
  attempts: { provider: Provider; model: string; ok: boolean; error?: string }[]
  error?: string
}

// ── Lazily-constructed clients (so importing this file never throws) ─────────
let _anthropic: Anthropic | null = null
let _openai: OpenAI | null = null

function anthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  if (!_anthropic) _anthropic = new Anthropic({ apiKey })
  return _anthropic
}

function openaiClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  if (!_openai) _openai = new OpenAI({ apiKey })
  return _openai
}

// ── Provider calls — each returns trimmed text or throws ─────────────────────
async function callOpenAI(system: string, user: string, temperature: number): Promise<string> {
  const client = openaiClient()
  if (!client) throw new Error('OPENAI_API_KEY is not configured')
  const res = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
  const text = res.choices?.[0]?.message?.content?.trim() || ''
  if (!text) throw new Error('OpenAI returned an empty response')
  return text
}

async function callAnthropic(system: string, user: string, temperature: number): Promise<string> {
  const client = anthropicClient()
  if (!client) throw new Error('ANTHROPIC_API_KEY is not configured')
  const msg = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: ANTHROPIC_MAX_TOKENS,
    temperature,
    system,
    messages: [{ role: 'user', content: user }],
  })
  const text = Array.isArray(msg.content)
    ? msg.content.filter((b: any) => b && b.type === 'text').map((b: any) => b.text).join('').trim()
    : ''
  if (!text) throw new Error('Anthropic returned an empty response')
  return text
}

// ── Public API ───────────────────────────────────────────────────────────────
export type RouteInput = {
  task: TaskKind
  system: string
  user: string
  temperature?: number
}

/**
 * Route a request through OpenAI first with automatic Anthropic fallback.
 */
export async function routeAndRun(input: RouteInput): Promise<RouteResult> {
  const temperature = typeof input.temperature === 'number' ? input.temperature : (input.task === 'audit' ? 0 : 0.4)

  const order: Provider[] = ['openai', 'anthropic']
  const attempts: RouteResult['attempts'] = []

  for (const provider of order) {
    const model = provider === 'openai' ? OPENAI_MODEL : ANTHROPIC_MODEL
    try {
      const text = provider === 'openai'
        ? await callOpenAI(input.system, input.user, temperature)
        : await callAnthropic(input.system, input.user, temperature)
      attempts.push({ provider, model, ok: true })
      return { ok: true, text, providerUsed: provider, modelUsed: model, attempts }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown provider error'
      attempts.push({ provider, model, ok: false, error })
    }
  }

  return {
    ok: false,
    text: '',
    providerUsed: null,
    modelUsed: null,
    attempts,
    error: `All providers failed for task "${input.task}". ${attempts.map(a => `${a.provider}: ${a.error}`).join(' | ')}`,
  }
}
