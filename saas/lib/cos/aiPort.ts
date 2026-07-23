// saas/lib/cos/aiPort.ts
// Injected model-access seam for the COS text generators. The engine asks THIS port to produce
// text — it never imports a provider SDK, an endpoint, or an API key. On SignalBoost's own
// deployment createPlatformAiPort() routes to the platform model router (Claude↔OpenAI fallback).
// A Fortune-500 buyer supplies an adapter over THEIR model provider (Azure OpenAI, Bedrock, a
// private gateway) with keys from THEIR vault, and the generators never change.
import { callModel } from '@/lib/ai/modelRouter'

export interface CosAiPort {
  // Return the model's text for a single prompt. May throw; callers decide how to fall back.
  generate(input: { prompt: string; systemPrompt?: string; maxTokens?: number }): Promise<string>
}

// ── SignalBoost's own adapter (the host implementation) ──
export function createPlatformAiPort(): CosAiPort {
  return { generate: (input) => callModel(input) }
}


// ── Image generation — same seam, one method ──
// A buyer swaps the image model (their DALL·E-compatible endpoint, a private diffusion service)
// without the creative pipeline knowing the provider or holding a key.
export type CosImageResult =
  | { ok: true; b64?: string; url?: string }
  | { ok: false; error: string }

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
