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
