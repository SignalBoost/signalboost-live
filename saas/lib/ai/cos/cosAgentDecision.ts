//
// MODEL-FIRST COS AGENT SEAM.
//
// The host authenticates the delivery surface first. Then the primary interactive model sees the
// user's ordinary request before optional capability routing and must either answer it completely
// or request the minimum capabilities required to finish. A capability request is intent, NEVER
// authority: Referee/host policy still decides what may execute.

import { callLocalModel, callLocalModelTurn, localInferenceConfigFromEnv, type LocalModelToolDefinition } from '../local-inference.ts'
import { extractBalancedJsonObject } from './reasonerOutput.ts'

export const COS_AGENT_CAPABILITIES = [
  'live_web',
  'conversation_history',
  'internal_context',
  'semantic_memory',
  'creative_memory',
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

function isCosAgentCapability(value: string): value is CosAgentCapability {
  return CAPABILITY_SET.has(value)
}

const CAPABILITY_DESCRIPTIONS: Record<CosAgentCapability, string> = {
  live_web: 'Retrieve current or mutable public-world information before answering.',
  conversation_history: 'Retrieve this signed-in user\'s past conversation context when it is materially required.',
  internal_context: 'Retrieve private organization/project context available to the authenticated owner.',
  semantic_memory: 'Retrieve meaning-similar durable knowledge, documents, learned material, enterprise/user context, and other authorized semantic memory. This is context retrieval, not permission and not a substitute for live facts.',
  creative_memory: 'Retrieve validated successful approaches, structures, styles, useful elements, and failure lessons that may improve how the task is solved or presented. Creative Memory is never factual evidence.',
  platform_runtime: 'Read current host-verified COS/iTMounts runtime and model configuration for the authenticated owner.',
  repository_read: 'Inspect the authorized repository or codebase before answering.',
  software_specialist: 'Hand off real debugging, implementation, testing, or deployment work to the governed Software Specialist.',
  external_action: 'Request an authorized action in an external system; host policy decides whether execution is allowed.',
}

function toolCatalog(input: { surface: 'assistant' | 'concierge'; ownerAuthenticated: boolean }): readonly LocalModelToolDefinition[] {
  const allowed: readonly CosAgentCapability[] = input.surface === 'concierge'
    ? ['live_web']
    : input.ownerAuthenticated
      ? COS_AGENT_CAPABILITIES
      : ['live_web']
  return Object.freeze(allowed.map(name => Object.freeze({
    type: 'function' as const,
    function: Object.freeze({
      name,
      description: CAPABILITY_DESCRIPTIONS[name],
      parameters: Object.freeze({ type: 'object', properties: Object.freeze({}), additionalProperties: false }),
    }),
  })))
}

function turnReasonerLabel(turn: { provider: string; model: string }): string {
  return turn.provider === 'runpod' || turn.provider === 'self_hosted'
    ? `independent-local:${turn.model}`
    : `managed-open-model:${turn.provider}:${turn.model}`
}

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

const REFERS_TO_PRIOR_TURN = /\b(?:it|its|it's|that|this|these|those|they|them|their|above|previous(?:ly)?|earlier|same|again|more|also|else|instead|then|former|latter|last one|first one|second one|you said|you mentioned|your answer|the answer)\b/

export function stableKnowledgeQuestionNeedsNoPlanner(prompt: string, previousAssistant?: string | null): boolean {
  const text = String(prompt || '').trim().toLowerCase()
  if (!text) return false
  // A previous answer only matters when this question points back at it. Production 2026-09-30 05:32 UTC: the
  // second question of a conversation ("What is the difference between an Ingress and a Service in Kubernetes?")
  // ran the planner (20.4 s) purely because a previous answer existed. Self-contained questions skip it; a
  // follow-up that refers back ("it", "that", "those", "the above", "more", "again", ...) still gets the planner.
  if (String(previousAssistant || '').trim() && REFERS_TO_PRIOR_TURN.test(text)) return false
  // Deterministic fast lane for ordinary evergreen explanatory questions. The planner exists to
  // request capabilities, not to spend a model turn rediscovering that definitions/mechanisms do
  // not need live tools. Mutable/current, action, repository and personal-history language stays
  // on the planner path.
  const questionShape = /^(?:what|why|how|explain|define|describe|compare|when|where)\b/.test(text)
  if (!questionShape) return false
  if (/\b(?:today|current|currently|latest|live|now|this (?:week|month|year)|price|weather|schedule|availability|near me|my (?:account|email|calendar|files?|repo|repository|project)|deploy|commit|merge|pull request|pr\b|fix|change|create|send|book|buy|cancel|delete|update)\b/.test(text)) return false
  return true
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

  const tools = toolCatalog({ surface: input.surface, ownerAuthenticated: input.ownerAuthenticated })
  const nativeTurn = await callLocalModelTurn({
    usageContext: { feature: 'cos_interactive_answer', purpose: 'agent_native_tool_choice' },
    temperature: 0.1,
    // Planner output is a tool call or a fixed one-line JSON; it never writes the user's answer.
    maxTokens: 300,
    disableThinking: true,
    timeoutMs,
    allowConfiguredFallback: false,
    persistUsage: false,
    tools,
    toolChoice: 'auto',
    systemPrompt: [
      'You are the first-turn capability PLANNER inside the COS agent runtime. You never answer the user: COS reasons and answers every request.',
      'Your only job: if information or action outside the model is materially required, call only the minimum function tools needed.',
      'A function call is a capability request, NOT authorization. The host independently checks identity, scope, permissions, safety, and action policy.',
      'Do not call tools merely because a topic is sophisticated. A conceptual software question that stable knowledge can answer needs no tool.',
      'Current/future travel details such as transport, fares, opening hours, prices, availability, schedules, weather, or other mutable facts require live_web.',
      'Request semantic_memory when meaning-similar durable internal context would materially improve the answer beyond stable model knowledge.',
      'Request creative_memory when a planning, writing, ideation, recommendation, transformation, or problem-solving task would materially benefit from validated prior approaches or successful answer patterns. Creative Memory guides HOW to solve/present; never use it as factual evidence.',
      'When no tool is required, do NOT write an answer. Return ONLY this exact JSON: {"mode":"answer","answer":"COS","confidence":1,"capabilities":[],"reason":"cos_answers"}.',
      input.surface === 'concierge'
        ? 'This is public Concierge. Only the public-safe tools supplied by the host exist for this turn; never imply access to private owner capabilities.'
        : input.ownerAuthenticated
          ? 'This is the authenticated owner Assistant. You may request only tools actually supplied by the host; host authorization remains final.'
          : 'This is Assistant without verified owner authority. Only the tools supplied by the host are available.',
    ].filter(Boolean).join(' '),
    prompt: [
      input.previousAssistant?.trim()
        ? `PRECEDING ASSISTANT TURN (conversation context only):\\n${input.previousAssistant.trim().slice(0, 5_000)}`
        : '',
      `CURRENT USER REQUEST:\\n${prompt}`,
      'Call the minimum tool capability now, or return the no-tool JSON.',
    ].filter(Boolean).join('\\n\\n'),
  }, { ...config, timeoutMs }).catch(error => {
    console.warn('[cos-agent-native-tools] unavailable', error instanceof Error ? error.message : String(error))
    return null
  })

  if (nativeTurn?.toolCalls.length) {
    const capabilities: CosAgentCapability[] = Array.from(
      new Set<CosAgentCapability>(
        nativeTurn.toolCalls
          .map(call => String(call.function.name || '').trim())
          .filter(isCosAgentCapability),
      ),
    )
    if (capabilities.length) {
      return {
        mode: 'orchestrate',
        answer: '',
        confidence: 1,
        capabilities,
        reason: 'native_tool_request',
        reasonerLabel: turnReasonerLabel(nativeTurn),
      }
    }
  }

  if (nativeTurn?.content?.trim()) {
    const direct = parseCosAgentDecision(nativeTurn.content, turnReasonerLabel(nativeTurn))
    if (direct?.mode === 'answer') return direct
  }

  // Compatibility fallback for OpenAI-compatible endpoints that do not implement native tools.
  // This is still one answer-or-plan model turn, never a classifier followed by another answer call.
  const raw = await callLocalModel({
    usageContext: { feature: 'cos_interactive_answer', purpose: 'agent_answer_or_capability_plan_compat' },
    temperature: 0.1,
    // Planner output is a tool call or a fixed one-line JSON; it never writes the user's answer.
    maxTokens: 300,
    disableThinking: true,
    timeoutMs,
    jsonObject: true,
    allowConfiguredFallback: false,
    persistUsage: false,
    systemPrompt: [
      'You are the first-turn capability PLANNER inside the COS agent runtime. You never answer the user: COS reasons and answers every request.',
      'For this user request choose exactly one outcome: NO TOOL NEEDED, or REQUEST the minimum capabilities needed before a reliable answer/action can be completed.',
      'Return ONLY strict JSON using exactly one of these shapes (never write an answer to the user):',
      '{"mode":"answer","answer":"COS","confidence":1,"capabilities":[],"reason":"cos_answers"}',
      '{"mode":"orchestrate","answer":"","confidence":0.0,"capabilities":["live_web"],"reason":"brief reason"}',
      'Return the no-tool JSON when the request is reliably answerable from the request itself, conversation context supplied here, and stable model knowledge. Do not request capabilities merely to improve wording or because the topic sounds sophisticated.',
      'Use mode=orchestrate whenever correctness materially depends on information or action unavailable inside the model.',
      `Allowed capabilities for this turn: ${tools.map(tool => tool.function.name).join(', ')}.`,
      'A capability request is NOT authorization. The host independently checks identity, scope, permissions, safety, and action policy before executing anything.',
    ].filter(Boolean).join(' '),
    prompt: [
      input.previousAssistant?.trim()
        ? `PRECEDING ASSISTANT TURN (conversation context only):\\n${input.previousAssistant.trim().slice(0, 5_000)}`
        : '',
      `CURRENT USER REQUEST:\\n${prompt}`,
      'Choose NO TOOL or ORCHESTRATE now.',
    ].filter(Boolean).join('\\n\\n'),
  }, { ...config, timeoutMs }).catch(error => {
    console.warn('[cos-agent-decision] compatibility fallback unavailable', error instanceof Error ? error.message : String(error))
    return null
  })

  return raw ? parseCosAgentDecision(raw, configuredReasonerLabel()) : null
}