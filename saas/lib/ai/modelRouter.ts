// saas/lib/ai/modelRouter.ts
// Routes model calls to Claude or OpenAI.

import type { IntentType } from './intentRouter'

export type ModelPreference = 'claude' | 'openai'

export interface ModelCallArgs {
  modelPreference?: ModelPreference
  intent?: IntentType
  prompt: string
  maxTokens?: number
  systemPrompt?: string
}

export function defaultModelForIntent(intent?: IntentType): ModelPreference {
  if (intent === 'business' || intent === 'global_knowledge') return 'openai'
  return 'claude'
}

async function callClaude(args: ModelCallArgs): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: args.maxTokens ?? 2048,
      system: args.systemPrompt ?? 'You are a helpful AI assistant. Always return valid JSON when asked.',
      messages: [{ role: 'user', content: args.prompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(`Claude HTTP ${response.status}: ${await response.text()}`)
  }

  const data = await response.json()
  const text = data.content?.map((part: { text?: string }) => part.text || '').join('') || ''
  console.log('modelRouter: Claude response received', { length: text.length })
  return text
}

async function callOpenAI(args: ModelCallArgs): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      max_tokens: args.maxTokens ?? 2048,
      messages: [
        {
          role: 'system',
          content: args.systemPrompt ?? 'You are a helpful AI assistant. Always return valid JSON when asked.',
        },
        { role: 'user', content: args.prompt },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`)
  }

  const data = await response.json()
  const text = data.choices?.[0]?.message?.content || ''
  console.log('modelRouter: OpenAI response received', { length: text.length })
  return text
}

export async function callModel(args: ModelCallArgs): Promise<string> {
  const selectedModel = args.modelPreference ?? defaultModelForIntent(args.intent)
  console.log('modelRouter: selected model', {
    selectedModel,
    intent: args.intent,
    maxTokens: args.maxTokens ?? 2048,
    promptLength: args.prompt.length,
  })

  if (selectedModel === 'openai') return callOpenAI(args)
  return callClaude(args)
}
