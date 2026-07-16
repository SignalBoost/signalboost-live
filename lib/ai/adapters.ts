export type AiProviderId = 'openai' | 'anthropic'

export type WebsiteGenerationRequest = {
  prompt: string
  mode?: string
  language?: string
}

export type WebsiteGenerationResult = {
  text: string
  provider: AiProviderId
  model: string
}

export type AiProviderAdapter = {
  id: AiProviderId
  label: string
  defaultModel: string
  envKeyName: string
  generateWebsite: (request: WebsiteGenerationRequest) => Promise<WebsiteGenerationResult>
}

export const DEFAULT_AI_PROVIDER: AiProviderId = 'openai'

const providerAliases: Record<string, AiProviderId> = {
  openai: 'openai',
  gpt: 'openai',
  chatgpt: 'openai',
  anthropic: 'anthropic',
  claude: 'anthropic',
}

function normalizeProviderId(provider?: unknown): AiProviderId {
  if (typeof provider !== 'string') return DEFAULT_AI_PROVIDER

  return providerAliases[provider.trim().toLowerCase()] ?? DEFAULT_AI_PROVIDER
}

function buildSystemPrompt(language = 'en'): string {
  return `You are SignalBoostAi's website-generation engine. Generate concise, brand-safe website content and implementation guidance for a Next.js App Router site. Respond in ${language}.`
}

function missingKeyDraft(request: WebsiteGenerationRequest, provider: AiProviderId, model: string): WebsiteGenerationResult {
  const mode = request.mode || 'default'
  const language = request.language || 'en'

  return {
    provider,
    model,
    text: `SignalBoostAi website draft (${mode}, ${language}): ${request.prompt}`,
  }
}

async function callOpenAi(request: WebsiteGenerationRequest): Promise<WebsiteGenerationResult> {
  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  if (!apiKey) return missingKeyDraft(request, 'openai', model)

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(request.language) },
        { role: 'user', content: request.prompt },
      ],
      temperature: 0.8,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI generation failed with status ${response.status}`)
  }

  const data = await response.json()
  const text = data?.choices?.[0]?.message?.content || 'No response.'

  return { provider: 'openai', model, text }
}

async function callAnthropic(request: WebsiteGenerationRequest): Promise<WebsiteGenerationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest'

  if (!apiKey) return missingKeyDraft(request, 'anthropic', model)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system: buildSystemPrompt(request.language),
      messages: [{ role: 'user', content: request.prompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(`Anthropic generation failed with status ${response.status}`)
  }

  const data = await response.json()
  const text = data?.content?.find?.((part: { type?: string; text?: string }) => part?.type === 'text')?.text || data?.content?.[0]?.text || 'No response.'

  return { provider: 'anthropic', model, text }
}

export const aiProviderAdapters: Record<AiProviderId, AiProviderAdapter> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    envKeyName: 'OPENAI_API_KEY',
    generateWebsite: callOpenAi,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-3-5-sonnet-latest',
    envKeyName: 'ANTHROPIC_API_KEY',
    generateWebsite: callAnthropic,
  },
}

export function getAiProviderAdapter(provider?: unknown): AiProviderAdapter {
  return aiProviderAdapters[normalizeProviderId(provider)]
}
