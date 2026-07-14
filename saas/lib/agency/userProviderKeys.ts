// saas/lib/agency/userProviders.ts
// User-facing BYOK provider catalog + media adapter contract.
// Same "template" philosophy as the Hub Console provider registry, but for
// campaign media providers that END USERS connect with their own keys.
//
// The adapter contract is the platform's "driver model": the engine only
// speaks this interface; each provider is a small adapter that translates.
// Adding a provider = add a catalog entry + an adapter. Nothing else changes.

export type UserProviderCapability = 'text' | 'voice' | 'video' | 'image'
export type UserProviderStatus = 'live' | 'coming'

export type UserProviderTemplate = {
  id: string
  name: string
  capability: UserProviderCapability
  status: UserProviderStatus
  description: string
  keyLabel: string
  keyPlaceholder: string
  keyPrefixHints: string[]
  getKeyUrl: string
}

export const USER_PROVIDER_CATALOG: UserProviderTemplate[] = [
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    capability: 'text',
    status: 'live',
    description: 'Writes your campaign copy: YouTube, LinkedIn, and press release.',
    keyLabel: 'Anthropic API key',
    keyPlaceholder: 'sk-ant-…',
    keyPrefixHints: ['sk-ant-'],
    getKeyUrl: 'https://platform.claude.com/settings/keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    capability: 'text',
    status: 'live',
    description: 'Alternative copy engine for your campaign assets.',
    keyLabel: 'OpenAI API key',
    keyPlaceholder: 'sk-…',
    keyPrefixHints: ['sk-'],
    getKeyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    capability: 'voice',
    status: 'coming',
    description: 'AI voiceover for your video and audio ads.',
    keyLabel: 'ElevenLabs API key',
    keyPlaceholder: 'xi-…',
    keyPrefixHints: [],
    getKeyUrl: 'https://elevenlabs.io/app/settings/api-keys',
  },
  {
    id: 'runway',
    name: 'Runway',
    capability: 'video',
    status: 'coming',
    description: 'Cinematic AI video generation for your ads.',
    keyLabel: 'Runway API key',
    keyPlaceholder: 'key_…',
    keyPrefixHints: [],
    getKeyUrl: 'https://dev.runwayml.com',
  },
  {
    id: 'kling',
    name: 'Kling',
    capability: 'video',
    status: 'coming',
    description: '3D and motion video generation for your ads.',
    keyLabel: 'Kling API key',
    keyPlaceholder: '…',
    keyPrefixHints: [],
    getKeyUrl: 'https://app.klingai.com',
  },
]

export function getUserProvider(id: string): UserProviderTemplate | undefined {
  return USER_PROVIDER_CATALOG.find((p) => p.id === id)
}

export function liveTextProviderIds(): string[] {
  return USER_PROVIDER_CATALOG.filter((p) => p.status === 'live' && p.capability === 'text').map((p) => p.id)
}

// ── Adapter contract ─────────────────────────────────────────────────────────

export type TextGenResult = { ok: boolean; text?: string; code?: 'invalid_key' | 'provider_error' }

export type TextAdapter = {
  providerId: string
  generate: (apiKey: string, systemPrompt: string, prompt: string, maxTokens: number) => Promise<TextGenResult>
}

const anthropicAdapter: TextAdapter = {
  providerId: 'anthropic',
  async generate(apiKey, systemPrompt, prompt, maxTokens) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      if (response.status === 401 || response.status === 403) return { ok: false, code: 'invalid_key' }
      if (!response.ok) return { ok: false, code: 'provider_error' }
      const data = await response.json()
      const text = data?.content?.[0]?.text || ''
      if (!text) return { ok: false, code: 'provider_error' }
      return { ok: true, text }
    } catch {
      return { ok: false, code: 'provider_error' }
    }
  },
}

const openaiAdapter: TextAdapter = {
  providerId: 'openai',
  async generate(apiKey, systemPrompt, prompt, maxTokens) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
        }),
      })
      if (response.status === 401 || response.status === 403) return { ok: false, code: 'invalid_key' }
      if (!response.ok) return { ok: false, code: 'provider_error' }
      const data = await response.json()
      const text = data?.choices?.[0]?.message?.content || ''
      if (!text) return { ok: false, code: 'provider_error' }
      return { ok: true, text }
    } catch {
      return { ok: false, code: 'provider_error' }
    }
  },
}

const TEXT_ADAPTERS: Record<string, TextAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
}

export function getTextAdapter(providerId: string): TextAdapter | undefined {
  return TEXT_ADAPTERS[providerId]
}
