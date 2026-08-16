// saas/lib/ai/providerRouter.ts
// Raw provider execution boundary. Only COS gateway/adapters may import this module.

import { AsyncLocalStorage } from 'node:async_hooks'
import { getAdminSupabase } from '@/utils/supabase/server'
import { callLocalModel } from './local-inference'

export type ModelProvider = 'claude' | 'openai' | 'gemini' | 'local'

export interface ModelCallArgs {
  modelPreference?: ModelProvider
  prompt: string
  maxTokens?: number
  systemPrompt?: string
}

type ProviderResult = { text: string; provider: ModelProvider; model: string }

export type ProviderExecutionResult = ProviderResult & {
  requestedProvider: ModelProvider
  fallbackUsed: boolean
}

export type ProviderExecutionTrace = {
  provider: ModelProvider | null
  model: string | null
  invoked: boolean
  source: 'provider' | 'cache' | null
}

const providerTrace = new AsyncLocalStorage<ProviderExecutionTrace>()

export async function withProviderExecutionTrace<T>(work: () => Promise<T>): Promise<{ result: T; trace: ProviderExecutionTrace }> {
  const trace: ProviderExecutionTrace = { provider: null, model: null, invoked: false, source: null }
  const result = await providerTrace.run(trace, work)
  return { result, trace: { ...trace } }
}

export function recordProviderExecutionTrace(input: Partial<ProviderExecutionTrace>): void {
  const trace = providerTrace.getStore()
  if (!trace) return
  if (input.provider !== undefined) trace.provider = input.provider ?? null
  if (input.model !== undefined) trace.model = input.model ?? null
  if (input.invoked !== undefined) trace.invoked = Boolean(input.invoked)
  if (input.source !== undefined) trace.source = input.source ?? null
}

function modelForProvider(provider: ModelProvider): string {
  if (provider === 'openai') return process.env.OPENAI_FALLBACK_MODEL?.trim() || 'gpt-4o-mini'
  if (provider === 'claude') return process.env.ANTHROPIC_FALLBACK_MODEL?.trim() || 'claude-sonnet-4-6'
  if (provider === 'gemini') return process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-3.6-flash'
  return process.env.LOCAL_AI_MODEL || 'local-model'
}

async function callClaude(args: ModelCallArgs): Promise<ProviderResult | null> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) { console.warn('providerRouter: ANTHROPIC_API_KEY missing'); return null }
    const model = modelForProvider('claude')
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: args.maxTokens ?? 2048, system: args.systemPrompt ?? 'You are a helpful AI assistant. Always return valid JSON when asked.', messages: [{ role: 'user', content: args.prompt }] }),
    })
    if (!response.ok) { console.error('providerRouter: Claude HTTP error', response.status, await response.text()); return null }
    const data = await response.json()
    const text = data.content?.map?.((part: any) => typeof part?.text === 'string' ? part.text : '').join('') || data.content?.[0]?.text || ''
    if (!text) return null
    console.log('providerRouter: Claude response received, length:', text.length)
    return { text, provider: 'claude', model }
  } catch (err) { console.error('providerRouter: Claude exception', err); return null }
}

async function callGemini(args: ModelCallArgs): Promise<ProviderResult | null> {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) { console.warn('providerRouter: GEMINI_API_KEY missing'); return null }
    const model = modelForProvider('gemini')
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: args.systemPrompt ?? 'You are a helpful AI assistant. Always return valid JSON when asked.' }] }, contents: [{ role: 'user', parts: [{ text: args.prompt }] }], generationConfig: { maxOutputTokens: args.maxTokens ?? 2048 } }),
    })
    if (!response.ok) { console.error('providerRouter: Gemini HTTP error', response.status, await response.text()); return null }
    const data = await response.json(); const parts = data?.candidates?.[0]?.content?.parts
    const text = Array.isArray(parts) ? parts.map((part: any) => typeof part?.text === 'string' ? part.text : '').join('') : ''
    if (!text) return null
    console.log('providerRouter: Gemini response received, length:', text.length)
    return { text, provider: 'gemini', model }
  } catch (err) { console.error('providerRouter: Gemini exception', err); return null }
}

/**
 * EXTERNAL PROVIDERS ARE DISABLED BY OWNER POLICY (2026-08-16).
 *
 * OpenAI, Gemini and Claude are removed from the seller-managed COS execution path. COS answers
 * from its own reasoner, its own memory and authoritative sources, or it fails closed. Provider
 * implementations remain visible as explicit adapter seams for reviewable BYOM/teacher work; they
 * are never selected by default, by environment fallback, or after local inference fails.
 */
async function callExternalChain(args: ModelCallArgs, preference: Exclude<ModelProvider, 'local'>): Promise<ProviderResult | null> {
  console.warn('[cos-external-provider-blocked]', JSON.stringify({
    at: new Date().toISOString(),
    requestedProvider: preference,
    promptChars: args.prompt.length,
    policy: 'cos_is_local_only_external_ai_disabled',
    effect: 'no external model was called; the caller must fail closed or answer from local/COS-owned evidence',
  }))
  return null
}

async function callLocal(args: ModelCallArgs): Promise<ProviderResult | null> {
  const result = await callLocalModel(args)
  if (result) return { text: result, provider: 'local', model: modelForProvider('local') }
  // No cloud fallback exists: local failure is reported honestly instead of silently becoming an
  // external answer. LOCAL_AI_ALLOW_CLOUD_FALLBACK and LOCAL_AI_CLOUD_FALLBACK_PROVIDER are not
  // routing inputs for seller-managed COS.
  console.error('providerRouter: local inference failed; COS is local-only so this request fails closed')
  return null
}

/**
 * Resolve the seller-managed default provider. An explicit per-call preference is preserved so
 * optional adapter/teacher requests remain observable and can be blocked by policy at the execution
 * boundary. Environment configuration, however, is not allowed to turn a generic COS call into a
 * hosted-model dependency: no preference and any stale commercial provider value both resolve local.
 */
export function resolveProviderPreference(
  explicitPreference?: ModelProvider,
  environmentPreference = process.env.AI_MODEL_PROVIDER,
): ModelProvider {
  if (explicitPreference) return explicitPreference

  const value = String(environmentPreference || '').trim().toLowerCase()
  if (value && value !== 'local') {
    if (value === 'openai' || value === 'claude' || value === 'gemini') {
      console.warn(`[providerRouter] AI_MODEL_PROVIDER=${value} cannot control seller-managed COS; defaulting to local`)
    } else {
      console.warn(`[providerRouter] ignoring unknown AI_MODEL_PROVIDER=${value}; defaulting to local`)
    }
  }
  return 'local'
}

async function logAiTask(args: { taskType: string; provider: ModelProvider; status: 'success' | 'error' | 'fallback'; durationMs: number; fallbackUsed?: boolean; errorMessage?: string; metadata?: Record<string, unknown> }) {
  try {
    const admin = getAdminSupabase()
    await admin.from('ai_task_log').insert({ task_type: args.taskType, provider: args.provider, model: modelForProvider(args.provider), status: args.status, duration_ms: args.durationMs, fallback_used: !!args.fallbackUsed, error_message: args.errorMessage || null, metadata: args.metadata || {} })
  } catch { /* Observability must never break provider execution. */ }
}

/** Raw compute execution with truthful provider/model metadata. */
export async function callProviderModelDetailed(args: ModelCallArgs): Promise<ProviderExecutionResult | null> {
  const preference = resolveProviderPreference(args.modelPreference)
  const startedAt = Date.now()
  console.log('providerRouter: calling', preference, { maxTokens: args.maxTokens ?? 2048, promptLength: args.prompt.length })
  const result = preference === 'local' ? await callLocal(args) : await callExternalChain(args, preference)
  const actualProvider = result?.provider ?? preference
  const fallbackUsed = Boolean(result && actualProvider !== preference)
  await logAiTask({ taskType: args.systemPrompt ? 'system_prompt_call' : 'model_call', provider: actualProvider, status: result ? (fallbackUsed ? 'fallback' : 'success') : 'error', durationMs: Date.now() - startedAt, fallbackUsed, metadata: { maxTokens: args.maxTokens ?? 2048, promptLength: args.prompt.length, requestedProvider: preference, actualProvider: result?.provider ?? null, actualModel: result?.model ?? null } })
  if (!result) return null
  recordProviderExecutionTrace({ provider: result.provider, model: result.model, invoked: true, source: 'provider' })
  return { ...result, requestedProvider: preference, fallbackUsed }
}

/** Raw compute execution. Never call from a Portable or feature route. */
export async function callProviderModel(args: ModelCallArgs): Promise<string | null> {
  return (await callProviderModelDetailed(args))?.text ?? null
}
