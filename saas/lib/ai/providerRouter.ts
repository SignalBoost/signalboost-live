// saas/lib/ai/providerRouter.ts
// Raw provider execution boundary. Only COS gateway/adapters may import this module.

import { getAdminSupabase } from '@/utils/supabase/server'
import { callLocalModel } from './local-inference'

export type ModelProvider = 'claude' | 'openai' | 'gemini' | 'local'

export interface ModelCallArgs {
  modelPreference?: ModelProvider
  prompt: string
  maxTokens?: number
  systemPrompt?: string
}

type ProviderResult = { text: string; provider: Exclude<ModelProvider, 'local'>; model: string }

function modelForProvider(provider: ModelProvider): string {
  if (provider === 'openai') return process.env.OPENAI_FALLBACK_MODEL?.trim() || 'gpt-4o-mini'
  if (provider === 'claude') return process.env.ANTHROPIC_FALLBACK_MODEL?.trim() || 'claude-sonnet-4-6'
  if (provider === 'gemini') return process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-2.5-flash'
  return process.env.LOCAL_AI_MODEL || 'local-model'
}

async function callClaude(args: ModelCallArgs): Promise<ProviderResult | null> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) { console.warn('providerRouter: ANTHROPIC_API_KEY missing'); return null }
    const model = modelForProvider('claude')
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: args.maxTokens ?? 2048,
        system: args.systemPrompt ?? 'You are a helpful AI assistant. Always return valid JSON when asked.',
        messages: [{ role: 'user', content: args.prompt }],
      }),
    })
    if (!response.ok) {
      console.error('providerRouter: Claude HTTP error', response.status, await response.text())
      return null
    }
    const data = await response.json()
    const text = data.content?.map?.((part: any) => typeof part?.text === 'string' ? part.text : '').join('') || data.content?.[0]?.text || ''
    if (!text) return null
    console.log('providerRouter: Claude response received, length:', text.length)
    return { text, provider: 'claude', model }
  } catch (err) {
    console.error('providerRouter: Claude exception', err)
    return null
  }
}

async function callOpenAI(args: ModelCallArgs): Promise<ProviderResult | null> {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) { console.warn('providerRouter: OPENAI_API_KEY missing'); return null }
    const model = modelForProvider('openai')
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: args.maxTokens ?? 2048,
        messages: [
          { role: 'system', content: args.systemPrompt ?? 'You are a helpful AI assistant. Always return valid JSON when asked.' },
          { role: 'user', content: args.prompt },
        ],
      }),
    })
    if (!response.ok) {
      console.error('providerRouter: OpenAI HTTP error', response.status, await response.text())
      return null
    }
    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || ''
    if (!text) return null
    console.log('providerRouter: OpenAI response received, length:', text.length)
    return { text, provider: 'openai', model }
  } catch (err) {
    console.error('providerRouter: OpenAI exception', err)
    return null
  }
}

async function callGemini(args: ModelCallArgs): Promise<ProviderResult | null> {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) { console.warn('providerRouter: GEMINI_API_KEY missing'); return null }
    const model = modelForProvider('gemini')
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: args.systemPrompt ?? 'You are a helpful AI assistant. Always return valid JSON when asked.' }] },
        contents: [{ role: 'user', parts: [{ text: args.prompt }] }],
        generationConfig: { maxOutputTokens: args.maxTokens ?? 2048 },
      }),
    })
    if (!response.ok) {
      console.error('providerRouter: Gemini HTTP error', response.status, await response.text())
      return null
    }
    const data = await response.json()
    const parts = data?.candidates?.[0]?.content?.parts
    const text = Array.isArray(parts) ? parts.map((part: any) => typeof part?.text === 'string' ? part.text : '').join('') : ''
    if (!text) return null
    console.log('providerRouter: Gemini response received, length:', text.length)
    return { text, provider: 'gemini', model }
  } catch (err) {
    console.error('providerRouter: Gemini exception', err)
    return null
  }
}

function externalOrder(preference: Exclude<ModelProvider, 'local'>): Array<Exclude<ModelProvider, 'local'>> {
  const rest: Array<Exclude<ModelProvider, 'local'>> = preference === 'openai'
    ? ['gemini', 'claude']
    : preference === 'claude'
      ? ['gemini', 'openai']
      : ['claude', 'openai']
  return [preference, ...rest]
}

async function callExternalChain(args: ModelCallArgs, preference: Exclude<ModelProvider, 'local'>): Promise<ProviderResult | null> {
  for (const provider of externalOrder(preference)) {
    const result = provider === 'openai'
      ? await callOpenAI(args)
      : provider === 'gemini'
        ? await callGemini(args)
        : await callClaude(args)
    if (result) {
      if (provider !== preference) console.warn(`providerRouter: ${preference} unavailable — external fallback succeeded with ${provider}`)
      return result
    }
  }
  return null
}

async function callLocal(args: ModelCallArgs): Promise<{ text: string; provider: ModelProvider; model: string } | null> {
  const result = await callLocalModel(args)
  if (result) return { text: result, provider: 'local', model: modelForProvider('local') }

  if (process.env.LOCAL_AI_ALLOW_CLOUD_FALLBACK !== 'true') {
    console.error('providerRouter: local inference failed and cloud fallback is disabled')
    return null
  }

  const configured = process.env.LOCAL_AI_CLOUD_FALLBACK_PROVIDER?.trim().toLowerCase()
  const fallback: Exclude<ModelProvider, 'local'> = configured === 'openai' || configured === 'gemini' ? configured : 'claude'
  console.warn(`providerRouter: local inference failed — explicit cloud fallback to ${fallback}`)
  return callExternalChain(args, fallback)
}

function providerFromEnvironment(): ModelProvider | undefined {
  const value = process.env.AI_MODEL_PROVIDER?.trim().toLowerCase()
  return value === 'local' || value === 'openai' || value === 'claude' || value === 'gemini' ? value : undefined
}

async function logAiTask(args: {
  taskType: string
  provider: ModelProvider
  status: 'success' | 'error' | 'fallback'
  durationMs: number
  fallbackUsed?: boolean
  errorMessage?: string
  metadata?: Record<string, unknown>
}) {
  try {
    const admin = getAdminSupabase()
    await admin.from('ai_task_log').insert({
      task_type: args.taskType,
      provider: args.provider,
      model: modelForProvider(args.provider),
      status: args.status,
      duration_ms: args.durationMs,
      fallback_used: !!args.fallbackUsed,
      error_message: args.errorMessage || null,
      metadata: args.metadata || {},
    })
  } catch {
    // Observability must never break provider execution.
  }
}

/** Raw compute execution. Never call from a Portable or feature route. */
export async function callProviderModel(args: ModelCallArgs): Promise<string | null> {
  const preference = args.modelPreference ?? providerFromEnvironment() ?? 'claude'
  const startedAt = Date.now()

  console.log('providerRouter: calling', preference, {
    maxTokens: args.maxTokens ?? 2048,
    promptLength: args.prompt.length,
  })

  const result = preference === 'local'
    ? await callLocal(args)
    : await callExternalChain(args, preference)

  const actualProvider = result?.provider ?? preference
  await logAiTask({
    taskType: args.systemPrompt ? 'system_prompt_call' : 'model_call',
    provider: actualProvider,
    status: result ? (actualProvider === preference ? 'success' : 'fallback') : 'error',
    durationMs: Date.now() - startedAt,
    fallbackUsed: Boolean(result && actualProvider !== preference),
    metadata: {
      maxTokens: args.maxTokens ?? 2048,
      promptLength: args.prompt.length,
      requestedProvider: preference,
      actualProvider: result?.provider ?? null,
      actualModel: result?.model ?? null,
    },
  })

  return result?.text ?? null
}
