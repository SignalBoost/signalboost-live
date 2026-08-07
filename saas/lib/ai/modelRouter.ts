// saas/lib/ai/modelRouter.ts
// Routes model calls to Claude, OpenAI, or a private OpenAI-compatible local endpoint.

import { getAdminSupabase } from '@/utils/supabase/server'
import { callLocalModel } from './local-inference'

export type ModelProvider = 'claude' | 'openai' | 'local'

export interface ModelCallArgs {
  modelPreference?: ModelProvider
  prompt:           string
  maxTokens?:       number
  systemPrompt?:    string
}

// ── Claude (Anthropic) ────────────────────────────────────────────────────────

async function callClaude(args: ModelCallArgs): Promise<string | null> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) { console.error('modelRouter: ANTHROPIC_API_KEY missing'); return null }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: args.maxTokens ?? 2048,
        system:     args.systemPrompt ?? 'You are a helpful AI assistant. Always return valid JSON when asked.',
        messages:   [{ role: 'user', content: args.prompt }],
      }),
    })

    if (!response.ok) {
      console.error('modelRouter: Claude HTTP error', response.status, await response.text())
      return null
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''
    console.log('modelRouter: Claude response received, length:', text.length)
    return text
  } catch (err) {
    console.error('modelRouter: Claude exception', err)
    return null
  }
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

async function callOpenAI(args: ModelCallArgs): Promise<string | null> {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.warn('modelRouter: OPENAI_API_KEY missing — falling back to Claude')
      return callClaude(args)
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:      'gpt-4o-mini',
        max_tokens: args.maxTokens ?? 2048,
        messages:   [
          {
            role:    'system',
            content: args.systemPrompt ?? 'You are a helpful AI assistant. Always return valid JSON when asked.',
          },
          { role: 'user', content: args.prompt },
        ],
      }),
    })

    if (!response.ok) {
      console.error('modelRouter: OpenAI HTTP error', response.status, await response.text())
      console.warn('modelRouter: OpenAI failed — falling back to Claude')
      return callClaude(args)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || ''
    console.log('modelRouter: OpenAI response received, length:', text.length)
    return text
  } catch (err) {
    console.error('modelRouter: OpenAI exception — falling back to Claude', err)
    return callClaude(args)
  }
}

// ── Private local inference ───────────────────────────────────────────────────

async function callLocal(args: ModelCallArgs): Promise<string | null> {
  const result = await callLocalModel(args)
  if (result) return result

  // Privacy is fail-closed by default. An appliance never sends prompts off-device
  // unless the buyer explicitly opts into cloud fallback.
  if (process.env.LOCAL_AI_ALLOW_CLOUD_FALLBACK !== 'true') {
    console.error('modelRouter: local inference failed and cloud fallback is disabled')
    return null
  }

  const fallback = process.env.LOCAL_AI_CLOUD_FALLBACK_PROVIDER === 'openai' ? 'openai' : 'claude'
  console.warn(`modelRouter: local inference failed — explicit cloud fallback to ${fallback}`)
  return fallback === 'openai' ? callOpenAI(args) : callClaude(args)
}

function providerFromEnvironment(): ModelProvider | undefined {
  const value = process.env.AI_MODEL_PROVIDER?.trim().toLowerCase()
  return value === 'local' || value === 'openai' || value === 'claude' ? value : undefined
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
    const model = args.provider === 'openai'
      ? 'gpt-4o-mini'
      : args.provider === 'claude'
        ? 'claude-sonnet-4-6'
        : (process.env.LOCAL_AI_MODEL || 'local-model')
    await admin.from('ai_task_log').insert({
      task_type: args.taskType,
      provider: args.provider,
      model,
      status: args.status,
      duration_ms: args.durationMs,
      fallback_used: !!args.fallbackUsed,
      error_message: args.errorMessage || null,
      metadata: args.metadata || {},
    })
  } catch {
    // Observability must never break model execution.
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function callModel(args: ModelCallArgs): Promise<string | null> {
  const preference = args.modelPreference ?? providerFromEnvironment() ?? 'claude'
  const startedAt = Date.now()

  console.log('modelRouter: calling', preference, {
    maxTokens: args.maxTokens ?? 2048,
    promptLength: args.prompt.length,
  })

  const result = preference === 'local'
    ? await callLocal(args)
    : preference === 'openai'
      ? await callOpenAI(args)
      : await callClaude(args)

  await logAiTask({
    taskType: args.systemPrompt ? 'system_prompt_call' : 'model_call',
    provider: preference,
    status: result ? 'success' : 'error',
    durationMs: Date.now() - startedAt,
    metadata: { maxTokens: args.maxTokens ?? 2048, promptLength: args.prompt.length },
  })

  return result
}
