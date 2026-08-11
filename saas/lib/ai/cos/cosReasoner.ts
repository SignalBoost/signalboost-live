// saas/lib/ai/cos/cosReasoner.ts
//
// COS'S OWN REASONER — the one model seam the COS-first path is allowed to use.
//
// WHY THIS EXISTS. The independence benchmark produced its first honest evidence on
// Aug 11: escalation_reason = "Local COS inference is not configured." — and the
// reason it can never BE configured on the current deployment is structural:
// local-inference.ts allowlists only localhost/127.0.0.1/ai-brain, and a Vercel
// serverless function has nothing at localhost. The owner does not want to run a
// model on his own machine. So COS needs a reasoner that exists TODAY without new
// infrastructure, while keeping the local path first-class for the day an ai-brain
// box exists.
//
// RESOLUTION ORDER, and it is part of the contract:
//   1. LOCAL   — LOCAL_AI_BASE_URL + LOCAL_AI_MODEL set → the existing
//                callLocalModel path, host allowlist untouched. True local wins
//                whenever it is present.
//   2. DEDICATED CLOUD REASONER — COS_REASONER_API_URL + COS_REASONER_MODEL +
//                COS_REASONER_API_KEY set → an OpenAI-compatible chat/completions
//                endpoint on COS'S OWN KEY. DeepSeek, Groq, Together, or an OpenAI
//                mini model all speak this protocol. Deliberately a SEPARATE key
//                and bill from the platform's Claude/OpenAI keys: COS's brain is
//                not the same account that runs the rest of the business, so its
//                cost is visible on its own line and disabling the platform keys
//                never lobotomises COS again.
//   3. NEITHER — resolve() returns null with the reason; callers fail closed and
//                record the gap, exactly as cosFirstAnswer already does.
//
// HONESTY RULE. Every answer carries WHICH reasoner produced it ('local' or
// 'dedicated-cloud'). A dedicated cloud reasoner is provider-independence in the
// sense that matters commercially — COS's knowledge is its own, its key is its own,
// and the vendor behind that key is swappable — but it is NOT a machine in the
// owner's rack, and the provenance must never pretend otherwise.

import { callLocalModel, localInferenceConfigFromEnv, type LocalModelCallArgs } from '@/lib/ai/local-inference'

export type CosReasonerKind = 'local' | 'dedicated-cloud'

export interface CosReasonerConfig {
  kind: CosReasonerKind
  /** Display label for provenance, e.g. 'local:qwen2.5-coder' or 'dedicated-cloud:deepseek-chat'. Never includes a key. */
  label: string
}

interface CloudReasonerConfig {
  baseUrl: string
  model: string
  apiKey: string
  timeoutMs: number
}

function localConfigured(): boolean {
  return Boolean(process.env.LOCAL_AI_BASE_URL?.trim()) && Boolean(process.env.LOCAL_AI_MODEL?.trim())
}

function cloudReasonerFromEnv(): CloudReasonerConfig | null {
  const baseUrlRaw = (process.env.COS_REASONER_API_URL || '').trim()
  const model = (process.env.COS_REASONER_MODEL || '').trim()
  const apiKey = (process.env.COS_REASONER_API_KEY || '').trim()
  if (!baseUrlRaw || !model || !apiKey) return null

  // Only the protocol is constrained, never the host: this seam exists precisely
  // because the buyer (or the owner) chooses the vendor. https only — this is a
  // cloud endpoint carrying a credential, and http would send that credential
  // in the clear.
  let baseUrl: string
  try {
    const url = new URL(baseUrlRaw)
    if (url.protocol !== 'https:') return null
    baseUrl = url.toString().replace(/\/$/, '')
  } catch {
    return null
  }

  const timeoutMs = Number(process.env.COS_REASONER_TIMEOUT_MS || '90000')
  return {
    baseUrl,
    model,
    apiKey,
    timeoutMs: Number.isFinite(timeoutMs) ? Math.max(5_000, Math.min(timeoutMs, 300_000)) : 90_000,
  }
}

/**
 * Which reasoner would answer right now, or null (with the reason) when none can.
 * Callers use this both to gate the attempt and to report configuration honestly.
 */
export function resolveCosReasoner(): { config: CosReasonerConfig } | { config: null; reason: string } {
  if (localConfigured()) {
    return { config: { kind: 'local', label: `local:${(process.env.LOCAL_AI_MODEL || '').trim()}` } }
  }
  const cloud = cloudReasonerFromEnv()
  if (cloud) {
    return { config: { kind: 'dedicated-cloud', label: `dedicated-cloud:${cloud.model}` } }
  }
  return {
    config: null,
    reason:
      'No COS reasoner is configured. Set LOCAL_AI_BASE_URL + LOCAL_AI_MODEL for a local model, or COS_REASONER_API_URL + COS_REASONER_MODEL + COS_REASONER_API_KEY for a dedicated OpenAI-compatible cloud reasoner (https only).',
  }
}

async function callCloudReasoner(args: LocalModelCallArgs, config: CloudReasonerConfig): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        max_tokens: args.maxTokens ?? 2048,
        temperature: args.temperature ?? 0.2,
        messages: [
          { role: 'system', content: args.systemPrompt ?? 'You are a helpful AI assistant. Return valid JSON when explicitly requested.' },
          { role: 'user', content: args.prompt },
        ],
      }),
    })
    if (!response.ok) {
      console.error('cosReasoner: cloud reasoner HTTP error', response.status, await response.text())
      return null
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const text = data.choices?.[0]?.message?.content
    return typeof text === 'string' && text.length > 0 ? text : null
  } catch (error) {
    console.error('cosReasoner: cloud reasoner request failed', error)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Ask COS's own reasoner. Returns the text plus WHICH reasoner answered, or null
 * when none is configured or the configured one failed — callers treat null as
 * "COS cannot reason right now" and fail closed, never silently substituting the
 * platform's external providers.
 */
export async function callCosReasoner(
  args: LocalModelCallArgs,
): Promise<{ text: string; reasoner: CosReasonerConfig } | null> {
  if (localConfigured()) {
    const config = { kind: 'local' as const, label: `local:${(process.env.LOCAL_AI_MODEL || '').trim()}` }
    const text = await callLocalModel(args, localInferenceConfigFromEnv()).catch(() => null)
    return text ? { text, reasoner: config } : null
  }

  const cloud = cloudReasonerFromEnv()
  if (cloud) {
    const config = { kind: 'dedicated-cloud' as const, label: `dedicated-cloud:${cloud.model}` }
    const text = await callCloudReasoner(args, cloud)
    return text ? { text, reasoner: config } : null
  }

  return null
}
