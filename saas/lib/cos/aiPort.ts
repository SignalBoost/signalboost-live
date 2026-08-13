// saas/lib/cos/aiPort.ts
// Injected model-access seam for COS generators. Text requests enter the shared COS gateway so
// existing Portables gain durable reuse and single-flight protection without owning provider logic.
import { callProviderModel, type ModelProvider } from '@/lib/ai/providerRouter'
import { callCosText } from '@/lib/cos/textGateway'

export interface CosAiPort {
  generate(input: { prompt: string; systemPrompt?: string; maxTokens?: number; modelPreference?: ModelProvider }): Promise<string>
}

export type ExternalTeacherProvider = Exclude<ModelProvider, 'local'>

function requireText(result: string | null, provider: string): string {
  if (!result) throw new Error(`${provider} AI provider returned no text`)
  return result
}

export function createPlatformAiPort(): CosAiPort {
  return {
    generate: async (input) => requireText(await callCosText({ ...input, taskId: 'cos-portable-text' }), 'platform'),
  }
}

export function createLocalApplianceAiPort(): CosAiPort {
  return {
    generate: async (input) => requireText(await callProviderModel({ ...input, modelPreference: 'local' }), 'local appliance'),
  }
}

/** SignalBoost-host adapter for optional frontier teacher/evaluator work. */
export function createExternalTeacherAiPort(provider: ExternalTeacherProvider): CosAiPort {
  return {
    generate: async (input) => requireText(
      await callProviderModel({ ...input, modelPreference: provider }),
      `external teacher ${provider}`,
    ),
  }
}

export type CosImageResult = { ok: boolean; b64?: string; url?: string; error?: string }

export interface CosImagePort {
  generate(input: { prompt: string; size?: string }): Promise<CosImageResult>
}

export function createPlatformImagePort(): CosImagePort {
  return {
    async generate({ prompt, size = '1024x1024' }): Promise<CosImageResult> {
      const key = process.env[['OPENAI', 'API', 'KEY'].join('_')]
      if (!key) return { ok: false, error: 'Creative image provider is not configured.' }
      try {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model: 'gpt-image-1', prompt, size, n: 1 }),
        })
        const data = await response.json() as { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } }
        if (!response.ok) return { ok: false, error: data.error?.message || 'Creative image generation failed.' }
        const first = data.data?.[0]
        return { ok: true, b64: first?.b64_json, url: first?.url }
      } catch (e: any) {
        return { ok: false, error: e?.message || 'Creative image generation failed.' }
      }
    },
  }
}
