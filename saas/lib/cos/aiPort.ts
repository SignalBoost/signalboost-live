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

const IMAGE_GENERATION_TIMEOUT_MS = 50_000

export function createPlatformImagePort(): CosImagePort {
  return {
    async generate({ prompt, size = '1024x1024' }): Promise<CosImageResult> {
      // Visual creation uses only the approved COS managed runtime. It must never select an
      // ambient OpenAI key or any other external-provider fallback.
      const key = process.env.LOCAL_AI_API_KEY?.trim()
      const baseUrl = (process.env.LOCAL_AI_BASE_URL || '').replace(/\/$/, '')
      if (!key || !/^https:\/\/api\.deepinfra\.com\/v1\/openai$/i.test(baseUrl)) {
        return { ok: false, error: 'Approved visual runtime is not configured.' }
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), IMAGE_GENERATION_TIMEOUT_MS)
      try {
        const response = await fetch('https://api.deepinfra.com/v1/openai/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          signal: controller.signal,
          body: JSON.stringify({ model: 'black-forest-labs/FLUX-2-klein-4b', prompt, size, n: 1 }),
        })
        const raw = await response.text()
        let data: { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } | string; detail?: string | { message?: string }; message?: string } = {}
        try { data = JSON.parse(raw) } catch { /* provider returned a non-JSON error */ }
        if (!response.ok) {
          const detail = typeof data.error === 'string'
            ? data.error
            : data.error?.message || (typeof data.detail === 'string' ? data.detail : data.detail?.message) || data.message || raw.slice(0, 240)
          console.warn('[concierge-visual-runtime-failure]', JSON.stringify({ status: response.status, detail: detail || 'no_provider_error_detail' }))
          return { ok: false, error: detail || `Approved visual runtime failed (HTTP ${response.status}).` }
        }
        const first = data.data?.[0]
        return first?.b64_json ? { ok: true, b64: first.b64_json, url: first.url } : { ok: false, error: 'Creative image provider returned no image.' }
      } catch (e: any) {
        return {
          ok: false,
          error: controller.signal.aborted
            ? 'Creative image generation timed out.'
            : e?.message || 'Creative image generation failed.',
        }
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}
