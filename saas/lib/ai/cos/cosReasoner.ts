// saas/lib/ai/cos/cosReasoner.ts
//
// COS'S OWN REASONER — strict independence boundary.
//
// The COS-first path may use only the LOCAL_AI_* inference seam. That seam can point
// to Ollama, vLLM, TGI, or another OpenAI-compatible open/self-hosted model runtime.
// A remote self-hosted endpoint is allowed only through local-inference.ts's explicit
// host allow-list + API-key controls.
//
// IMPORTANT: Anthropic/OpenAI/Gemini and any generic "dedicated cloud reasoner" are
// intentionally NOT accepted here. Those providers belong only in the external
// escalation layer. This keeps provenance honest: if callCosReasoner() succeeds,
// COS really used its independent model runtime.

import { callLocalModel, localInferenceConfigFromEnv, type LocalModelCallArgs } from '@/lib/ai/local-inference'

export type CosReasonerKind = 'independent-local'

export interface CosReasonerConfig {
  kind: CosReasonerKind
  /** Provenance label, e.g. independent-local:qwen2.5-coder:32b. */
  label: string
}

function localConfigured(): boolean {
  return Boolean(process.env.LOCAL_AI_BASE_URL?.trim()) && Boolean(process.env.LOCAL_AI_MODEL?.trim())
}

/**
 * Which independent COS reasoner would answer right now.
 * Generic cloud-provider configuration is deliberately ignored here; those providers
 * are external fallbacks and must never masquerade as COS-local inference.
 */
export function resolveCosReasoner(): { config: CosReasonerConfig } | { config: null; reason: string } {
  if (localConfigured()) {
    return {
      config: {
        kind: 'independent-local',
        label: `independent-local:${(process.env.LOCAL_AI_MODEL || '').trim()}`,
      },
    }
  }

  return {
    config: null,
    reason:
      'No independent COS reasoner is configured. Set LOCAL_AI_BASE_URL + LOCAL_AI_MODEL to an Ollama, vLLM, TGI, or other approved self-hosted/open-model endpoint. External cloud models are fallback providers and are not valid COS-local reasoners.',
  }
}

/**
 * Ask COS's independent reasoner. Success means the LOCAL_AI_* path actually answered.
 * If unavailable or unhealthy, callers fail closed and may separately invoke the
 * explicitly-labelled external escalation gateway.
 */
export async function callCosReasoner(
  args: LocalModelCallArgs,
): Promise<{ text: string; reasoner: CosReasonerConfig } | null> {
  if (!localConfigured()) return null

  const config: CosReasonerConfig = {
    kind: 'independent-local',
    label: `independent-local:${(process.env.LOCAL_AI_MODEL || '').trim()}`,
  }
  const text = await callLocalModel(args, localInferenceConfigFromEnv()).catch(() => null)
  return text ? { text, reasoner: config } : null
}
