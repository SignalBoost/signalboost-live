// saas/lib/ai/cos/cosAgentDecision.ts
//
// Model-first agent decision seam. The primary model sees the user's request before optional
// capability routing and either answers directly or asks the COS host for capabilities.
// The model may REQUEST a capability; it never grants itself authority to use one.

import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { extractBalancedJsonObject } from './reasonerOutput.ts'

export const COS_AGENT_CAPABILITIES = [
  'live_web',
  'conversation_history',
  'internal_context',
  'platform_runtime',
  'repository_read',
  'software_specialist',
  'external_action',
] as const

export type CosAgentCapability = typeof COS_AGENT_CAPABILITIES[number]

export type CosAgentDecision =
  | {
      mode: 'answer'
      answer: string
      confidence: number
      capabilities: []
      reason: string
      reasonerLabel: string
    }
  | {
      mode: 'orchestrate'
      answer: ''
      confidence: number
      capabilities: CosAgentCapability[]
      reason: string
      reasonerLabel: string
    }

const CAPABILITY_SET = new Set<string>(COS_AGENT_CAPABILITIES)

function clampConfidence(value: unknown): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0
}

export function parseCosAgentDecision(raw: string, reasonerLabel = 'unknown'): CosAgentDecision | null {
  const text = String(raw || '').trim().replace(/^\`\`\`json\s*/i, '').replace(/\`\`\`\s*$/i, '').trim()
  const json = extractBalancedJsonObject(text)
  if (!json) return null

  try {
    const value = JSON.parse(json) as Record<string, unknown>
    const mode = String(value.mode || '').trim()
    const confidence = clampConfidence(value.confidence)
    const reason = String(value.reason || '').trim().slice(0, 500)

    if (mode === 'answer') {
      const answer = String(value.answer || '').trim()
      if (!answer) return null
      return { mode: 'answer', answer, confidence, capabilities: [], reason, reasonerLabel }
    }

    if (mode === 'orchestrate') {
      const requested = Array.isArray(value.capabilities) ? value.capabilities : []
      const capabilities = [...new Set(requested.map(item => String(item || '').trim()).filter(item => CAPABILITY_SET.has(item)))] as CosAgentCapability[]
      if (!capabilities.length) return null
      return { mode: 'orchestrate', answer: '', confidence, capabilities, reason, reasonerLabel }
    }

    return null
  } catch {
    return null
  }
}

function reasonerLabel(): string {
  const config = localInferenceConfigFromEnv()
  const provider = String(config.provider || '').trim()
  return provider && provider !== 'self_hosted'
    ? `managed-open-model:${provider}:${config.model}`
    : `independent-local:${config.model}`
}

export async function decideCosAgentTurn(args: {
  prompt: string
  previousAssistant?: string | null
  surface: 'assistant' | 'concierge'
  ownerAuthenticated: boolean
  language?: string | null
}): Promise<CosAgentDecision | null> {
  const prompt = String(args.prompt || '').trim()
  if (!prompt) return null

  const config = localInferenceConfigFromEnv()
  const timeoutMs = Math.max(4_000, Math.min(Number(process.env.COS_AGENT_DECISION_TIMEOUT_MS || '12000'), 20_000))
  const label = reasonerLabel()

  const raw = await callLocalModel({
    usageContext: { feature: 'cos_interactive_answer', purpose: 'agent_answer_or_capability_plan' },
    temperature: 0.1,
    maxTokens: 1800,
    disableThinking: true,
    timeoutMs,
    jsonObject: true,
    persistUsage: true,
    allowConfiguredFallback: false,
    systemPrompt: [
      'You are the first-turn brain of the COS agent runtime.',
      'Your job is to do exactly one of two things: ANSWER the user completely now, or REQUEST the minimum capabilities needed before a reliable answer/action can be completed.',
      'Return ONLY strict JSON in one of these shapes:',
      '{"mode":"answer","answer":"complete user-facing answer","confidence":0.0,"capabilities":[],"reason":"self_contained"}',
      '{"mode":"orchestrate","answer":"","confidence":0.0,"capabilities":["live_web"],"reason":"short reason"}',
      'Prefer mode=answer whenever the request can be answered reliably from the user-provided context and stable model knowledge. Do not request tools merely to improve style, verbosity, or confidence.',
      'Use mode=orchestrate when correctness materially depends on information or action the model cannot possess by itself.',
      'Capability catalog:',
      '- live_web: mutable outside-world facts such as current schedules, prices, opening hours, availability, weather, news, office holders, travel details, or explicit verification/research.',
      '- conversation_history: the user asks what they said, decided, uploaded, or discussed in earlier conversations.',
      '- internal_context: the answer materially depends on private/user/organization/project knowledge that is not contained in the current request.',
      '- platform_runtime: current SignalBoost/COS runtime configuration, model/provider/specification, or other host-verified platform facts.',
      '- repository_read: inspection of a real repository/codebase is required.',
      '- software_specialist: debugging, repair, implementation, testing, or deployment work on a real software system is required.',
      '- external_action: the user asks to send, publish, deploy, modify, delete, purchase, or otherwise change an external system.',
      'A conceptual software question that can be answered from stable knowledge is mode=answer; do not request software_specialist just because code is mentioned.',
      'A travel itinerary involving a future/current date, transport, opening hours, prices, availability, or similar mutable details requires live_web.',
      'A capability request is NOT authorization. The host will independently decide whether the capability is available and permitted for this user/surface.',
      'Never claim that a capability was used or an action occurred unless its result is supplied to you in a later turn.',
      'If the request is self-contained, answer it directly instead of explaining that no tool is needed.',
      args.surface === 'concierge'
        ? 'This is the public Concierge surface. Do not request or disclose owner-private runtime, repository, internal-context, or external-action authority.'
        : args.ownerAuthenticated
          ? 'This is the authenticated owner Assistant surface. You may request owner capabilities, but host authorization still governs execution.'
          : 'This is the Assistant surface without verified owner authority. You may request capabilities, but the host may deny privileged ones.',
      args.language ? `Answer direct responses in the user language hint: ${args.language}.` : '',
    ].filter(Boolean).join(' '),
    prompt: [
      args.previousAssistant?.trim()
        ? `PRECEDING ASSISTANT TURN (conversation context only):\n${args.previousAssistant.trim().slice(0, 5000)}`
        : '',
      `CURRENT USER REQUEST:\n${prompt}`,
      'Choose answer or orchestrate now.',
    ].filter(Boolean).join('\n\n'),
  }, { ...config, timeoutMs }).catch(error => {
    console.warn('[cos-agent-decision] model unavailable', error instanceof Error ? error.message : String(error))
    return null
  })

  return raw ? parseCosAgentDecision(raw, label) : null
}
