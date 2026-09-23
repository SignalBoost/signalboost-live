// saas/lib/ai/cos/cosAgentDecision.ts
//
// MODEL-FIRST COS AGENT SEAM.
//
// The host authenticates the delivery surface first. Then the primary interactive model sees the
// user's ordinary request before optional capability routing and must either answer it completely
// or request the minimum capabilities required to finish. A capability request is intent, NEVER
// authority: Referee/host policy still decides what may execute.

import { callLocalModel, localInferenceConfigFromEnv } from '../local-inference.ts'
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
  | Readonly<{
      mode: 'answer'
      answer: string
      confidence: number
      capabilities: []
      reason: string
      reasonerLabel: string
    }>
  | Readonly<{
      mode: 'orchestrate'
      answer: ''
      confidence: number
      capabilities: CosAgentCapability[]
      reason: string
      reasonerLabel: string
    }>

const CAPABILITY_SET = new Set<string>(COS_AGENT_CAPABILITIES)

function confidence(value: unknown): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0
}

export function parseCosAgentDecision(raw: string, reasonerLabel = 'unknown'): CosAgentDecision | null {
  const json = extractBalancedJsonObject(String(raw || '').trim())
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    const mode = String(parsed.mode || '').trim()
    const reason = String(parsed.reason || '').trim().slice(0, 500)
    const score = confidence(parsed.confidence)

    if (mode === 'answer') {
      const answer = String(parsed.answer || '').trim()
      if (!answer) return null
      return { mode: 'answer', answer, confidence: score, capabilities: [], reason, reasonerLabel }
    }

    if (mode === 'orchestrate') {
      const rawCapabilities = Array.isArray(parsed.capabilities) ? parsed.capabilities : []
      const capabilities = [...new Set(
        rawCapabilities
          .map(value => String(value || '').trim())
          .filter(value => CAPABILITY_SET.has(value)),
      )] as CosAgentCapability[]
      if (!capabilities.length) return null
      return { mode: 'orchestrate', answer: '', confidence: score, capabilities, reason, reasonerLabel }
    }
    return null
  } catch {
    return null
  }
}

function configuredReasonerLabel(): string {
  const config = localInferenceConfigFromEnv()
  const provider = String(config.provider || process.env.LOCAL_AI_MANAGED_PROVIDER || '').trim().toLowerCase()
  return provider
    ? `managed-open-model:${provider}:${config.model}`
    : `independent-local:${config.model}`
}

export async function decideCosAgentTurn(input: {
  prompt: string
  previousAssistant?: string | null
  surface: 'assistant' | 'concierge'
  ownerAuthenticated: boolean
  language?: string | null
}): Promise<CosAgentDecision | null> {
  const prompt = String(input.prompt || '').trim()
  if (!prompt) return null

  const config = localInferenceConfigFromEnv()
  const configuredTimeout = Number(process.env.COS_AGENT_DECISION_TIMEOUT_MS || '10000')
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? Math.max(4_000, Math.min(15_000, Math.floor(configuredTimeout)))
    : 10_000

  const raw = await callLocalModel({
    usageContext: { feature: 'cos_interactive_answer', purpose: 'agent_answer_or_capability_plan' },
    temperature: 0.1,
    maxTokens: 1_800,
    disableThinking: true,
    timeoutMs,
    jsonObject: true,
    allowConfiguredFallback: false,
    persistUsage: false,
    systemPrompt: [
      'You are the first-turn reasoning brain inside the COS agent runtime.',
      'For this user request choose exactly one outcome: ANSWER it completely now, or REQUEST the minimum capabilities needed before a reliable answer/action can be completed.',
      'Return ONLY strict JSON using exactly one of these shapes:',
      '{"mode":"answer","answer":"complete user-facing answer","confidence":0.0,"capabilities":[],"reason":"self_contained"}',
      '{"mode":"orchestrate","answer":"","confidence":0.0,"capabilities":["live_web"],"reason":"brief reason"}',
      'Prefer mode=answer when the request is reliably answerable from the request itself, conversation context supplied here, and stable model knowledge. Do not request capabilities merely to improve wording or because the topic sounds sophisticated.',
      'Use mode=orchestrate whenever correctness materially depends on information or action unavailable inside the model.',
      'Available capability names and meanings:',
      '- live_web: mutable outside-world facts such as current/future schedules, transport, prices, opening hours, availability, weather, news, office holders, releases, or explicit research/verification.',
      '- conversation_history: earlier user conversations or decisions are materially required.',
      '- internal_context: private user/organization/project knowledge not present in this request is materially required.',
      '- platform_runtime: current COS/iTMounts/SignalBoost runtime, model, provider, configuration, or host facts are required.',
      '- repository_read: inspecting the real repository/codebase is required.',
      '- software_specialist: real debugging, repair, implementation, testing, or deployment work is required.',
      '- external_action: the user asks to change an outside system, for example send, publish, deploy, modify, delete, purchase, book, or cancel.',
      'A conceptual coding/software question that stable knowledge can answer is mode=answer. Do not request software_specialist merely because software is mentioned.',
      'Travel planning involving a current/future date plus transport, fares, opening hours, prices, availability, or other mutable details requires live_web.',
      'A capability request is NOT authorization. The host independently checks identity, scope, permissions, safety, and action policy before executing anything.',
      'Never claim a capability was used or an external action occurred unless a later host/tool result establishes that.',
      input.surface === 'concierge'
        ? 'This is public Concierge. Never request or disclose owner-private platform_runtime, repository_read, internal_context, software repair authority, or external_action authority. If such private capability would be required, answer only what is safely answerable without it.'
        : input.ownerAuthenticated
          ? 'This is the authenticated owner Assistant. You may request owner capabilities, but host authorization remains final.'
          : 'This is Assistant without verified owner authority. You may identify a capability need, but privileged capabilities may be denied.',
      input.language ? `Write a direct answer in the user language hint: ${input.language}.` : '',
    ].filter(Boolean).join(' '),
    prompt: [
      input.previousAssistant?.trim()
        ? `PRECEDING ASSISTANT TURN (conversation context only):\n${input.previousAssistant.trim().slice(0, 5_000)}`
        : '',
      `CURRENT USER REQUEST:\n${prompt}`,
      'Choose ANSWER or ORCHESTRATE now.',
    ].filter(Boolean).join('\n\n'),
  }, { ...config, timeoutMs }).catch(error => {
    console.warn('[cos-agent-decision] unavailable', error instanceof Error ? error.message : String(error))
    return null
  })

  return raw ? parseCosAgentDecision(raw, configuredReasonerLabel()) : null
}
