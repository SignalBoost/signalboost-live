import { callLocalModel, type LocalInferenceConfig, type LocalModelCallArgs } from '@/lib/ai/local-inference'

export type OpenEvaluatorIdentity = Readonly<{ model: string; baseUrl: string; label: string }>

function normalizedBaseUrl(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('cos_open_evaluator_invalid_protocol')
  if (url.username || url.password) throw new Error('cos_open_evaluator_embedded_credentials_forbidden')
  const host = url.hostname.toLowerCase()
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === 'ai-brain'
  const allowed = new Set((process.env.COS_OPEN_EVALUATOR_ALLOWED_HOSTS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean))
  if (!loopback && !allowed.has(host)) throw new Error('cos_open_evaluator_host_not_allowed')
  if (!loopback && url.protocol !== 'https:') throw new Error('cos_open_evaluator_remote_https_required')
  return url.toString().replace(/\/$/, '')
}

export function resolveIndependentOpenEvaluator(): { identity: OpenEvaluatorIdentity; config: LocalInferenceConfig } | null {
  const rawBaseUrl = process.env.COS_OPEN_EVALUATOR_BASE_URL?.trim()
  const model = process.env.COS_OPEN_EVALUATOR_MODEL?.trim()
  if (!rawBaseUrl || !model) return null
  const baseUrl = normalizedBaseUrl(rawBaseUrl)
  const primaryModel = process.env.LOCAL_AI_MODEL?.trim()
  const primaryBase = process.env.LOCAL_AI_BASE_URL?.trim().replace(/\/$/, '')
  if (primaryModel && primaryModel === model && primaryBase && primaryBase === baseUrl) {
    throw new Error('cos_open_evaluator_not_independent_from_primary')
  }
  const timeout = Number(process.env.COS_OPEN_EVALUATOR_TIMEOUT_MS || '90000')
  if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 300000) throw new Error('cos_open_evaluator_timeout_invalid')
  return {
    identity: Object.freeze({ model, baseUrl, label: `independent-open-evaluator:${model}` }),
    config: {
      baseUrl,
      model,
      apiKey: process.env.COS_OPEN_EVALUATOR_API_KEY?.trim() || undefined,
      timeoutMs: timeout,
      provider: 'itmounts-open-evaluator',
      routeOwner: 'itmounts',
    },
  }
}

export async function callIndependentOpenEvaluator(args: LocalModelCallArgs): Promise<{ text: string; evaluator: OpenEvaluatorIdentity } | null> {
  const resolved = resolveIndependentOpenEvaluator()
  if (!resolved) return null
  const text = await callLocalModel({
    ...args,
    allowConfiguredFallback: false,
    usageContext: {
      feature: 'cos_independent_open_evaluation',
      purpose: 'independent_evaluation',
      correlationId: args.usageContext?.correlationId,
    },
  }, resolved.config)
  return text?.trim() ? { text, evaluator: resolved.identity } : null
}
