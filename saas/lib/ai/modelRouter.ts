// saas/lib/ai/modelRouter.ts
// Routes model calls to Claude or OpenAI with automatic fallback.

export interface ModelCallArgs {
  modelPreference?: 'claude' | 'openai'
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

// ── Main export ───────────────────────────────────────────────────────────────

export async function callModel(args: ModelCallArgs): Promise<string | null> {
  const preference = args.modelPreference ?? 'claude'

  console.log('modelRouter: calling', preference, {
    maxTokens: args.maxTokens ?? 2048,
    promptLength: args.prompt.length,
  })

  if (preference === 'openai') {
    return callOpenAI(args)
  }
  return callClaude(args)
}
