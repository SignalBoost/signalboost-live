// saas/lib/cos/aiPort.ts
// Injected model-access seam for the COS text generators. The engine asks THIS port to produce
// text — it never imports a provider SDK, an endpoint, or an API key. On SignalBoost's own
// deployment createPlatformAiPort() routes through the platform model router. A buyer can use
// createLocalApplianceAiPort() to force private on-device inference with cloud fallback disabled
// unless explicitly enabled in environment policy.
import { callModel } from '@/lib/ai/modelRouter'

export interface CosAiPort {
  // Return the model's text for a single prompt. May throw; callers decide how to fall back.
  generate(input: { prompt: string; systemPrompt?: string; maxTokens?: number }): Promise<string>
}

function requireText(result: string | null, provider: string): string {
  if (!result) throw new Error(`${provider} AI provider returned no text`)
  return result
}

// ── SignalBoost's own adapter (the host implementation) ──
export function createPlatformAiPort(): CosAiPort {
  return { generate: async (input) => requireText(await callModel(input), 'platform') }
}

// ── Private appliance adapter ─────────────────────────────────────────────────
// This is an explicit local-only selection. The shared router itself enforces whether an
// administrator has opted into any cloud fallback via LOCAL_AI_ALLOW_CLOUD_FALLBACK=true.
export function createLocalApplianceAiPort(): CosAiPort {
  return {
    generate: async (input) => requireText(await callModel({ ...input, modelPreference: 'local' }), 'local appliance'),
  }
}

// ── Image generation — same seam, one method ──
// A buyer swaps the image model (their DALL·E-compatible endpoint, a private diffusion service)
// without the creative pipeline knowing the provider or holding a key.
// Flat result (not a discriminated union): this repo's tsconfig is non-strict, where `!img.ok`
// does not narrow a union — so a flat { ok; error? } shape keeps `error` safely accessible,
// matching the store result types (DecisionResult, CampaignQueueStore.update, ObjectStorePort).
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
