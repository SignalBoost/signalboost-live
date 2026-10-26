//
// MODEL-FIRST COS AGENT SEAM.
//
// The host authenticates the delivery surface first. Then the primary interactive model sees the
// user's ordinary request before optional capability routing and must either answer it completely
// or request the minimum capabilities required to finish. A capability request is intent, NEVER
// authority: Referee/host policy still decides what may execute.

import { callLocalModel, callLocalModelTurn, localInferenceConfigFromEnv, type LocalModelChatMessage, type LocalModelToolDefinition, type LocalModelTurnResult } from '../local-inference.ts'
import { extractBalancedJsonObject } from './reasonerOutput.ts'
import { plannerSearchQueriesFromToolArguments, sanitizePlannerSearchQueries, PLANNER_SEARCH_QUERY_MAX_COUNT } from './plannerSearchQueries.ts'

export const COS_AGENT_CAPABILITIES = [
  'live_web',
  'compute',
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
      searchQueries: []
      reason: string
      reasonerLabel: string
    }>
  | Readonly<{
      mode: 'orchestrate'
      answer: ''
      confidence: number
      capabilities: CosAgentCapability[]
      /** Self-contained web searches the planner wrote for live_web; empty when it wrote none. */
      searchQueries: string[]
      /** One file to write and the command that proves it, when the planner gave both to software_specialist. */
      verifiedTask?: Readonly<{ targetPath: string; verifyCommand: string }> | null
      reason: string
      reasonerLabel: string
    }>

const CAPABILITY_SET = new Set<string>(COS_AGENT_CAPABILITIES)

function isCosAgentCapability(value: string): value is CosAgentCapability {
  return CAPABILITY_SET.has(value)
}

const CAPABILITY_DESCRIPTIONS: Record<CosAgentCapability, string> = {
  live_web: 'Retrieve current or mutable public-world information before answering. Pass the web searches to run in queries.',
  compute: 'Run the COS agent tools (web search, URL/API fetch and sandboxed Python) to retrieve data and compute, analyze, tabulate or chart it. Request it whenever the user wants a chart, graph or plot, a calculation over real data, statistics, or a result that requires running code.',
  conversation_history: 'Retrieve this signed-in user\'s past conversation context when it is materially required.',
  internal_context: 'Retrieve private organization/project context available to the authenticated owner.',
  semantic_memory: 'Retrieve meaning-similar durable knowledge, documents, learned material, enterprise/user context, and other authorized semantic memory. This is context retrieval, not permission and not a substitute for live facts.',
  creative_memory: 'Retrieve validated successful approaches, structures, styles, useful elements, and failure lessons that may improve how the task is solved or presented. Creative Memory is never factual evidence.',
  platform_runtime: 'Read current host-verified COS/iTMounts runtime and model configuration for the authenticated owner.',
  repository_read: 'Inspect the authorized repository or codebase before answering.',
  software_specialist: 'Hand off work that must build, change, run, test, debug or deploy actual software, code, files or a website to the governed Software Specialist. Not for analysis, investigation, explanation, review or planning that is answered in writing, even when its subject is software.',
  external_action: 'Request an authorized action in an external system; host policy decides whether execution is allowed.',
}

// software_specialist may name one file and the command that proves it; the job then runs the shared verified task
// loop (lib/builder/verified-task-loop.ts) instead of a whole Builder project.
const SOFTWARE_SPECIALIST_PARAMETERS = Object.freeze({
  type: 'object',
  properties: Object.freeze({
    targetPath: Object.freeze({ type: 'string', description: 'Only when the work is one file: its workspace path, e.g. lib/supabase-client.ts.' }),
    verifyCommand: Object.freeze({ type: 'string', description: 'Only with targetPath: the command whose exit code 0 proves the file is done, e.g. node --test test/client.test.ts.' }),
  }),
  additionalProperties: false,
})

/** {targetPath, verifyCommand} from a software_specialist call, or null unless both are real strings. */
export function verifiedTaskFromToolArguments(argumentsText: string | null | undefined): { targetPath: string; verifyCommand: string } | null {
  try {
    const parsed = JSON.parse(String(argumentsText || '{}')) as Record<string, unknown>
    const targetPath = typeof parsed.targetPath === 'string' ? parsed.targetPath.trim() : ''
    const verifyCommand = typeof parsed.verifyCommand === 'string' ? parsed.verifyCommand.trim() : ''
    return targetPath && verifyCommand ? { targetPath, verifyCommand } : null
  } catch {
    return null
  }
}

const LIVE_WEB_PARAMETERS = Object.freeze({
  type: 'object',
  properties: Object.freeze({
    queries: Object.freeze({
      type: 'array',
      maxItems: PLANNER_SEARCH_QUERY_MAX_COUNT,
      items: Object.freeze({ type: 'string' }),
      description: `1-${PLANNER_SEARCH_QUERY_MAX_COUNT} self-contained web search queries that would retrieve the facts needed to answer.`,
    }),
  }),
  required: Object.freeze(['queries']),
  additionalProperties: false,
})

/**
 * What the planner must know to decide live_web and write its searches. Shared by the native tool turn and
 * the JSON compatibility turn so both apply one standard.
 */
const LIVE_WEB_PLANNING_RULES = [
  'Request live_web whenever a correct answer depends on the present or future state of the outside world: who currently holds an office or role, elections and their candidates, polls or likely outcomes, upcoming or recent events, news, markets, prices, schedules, availability, weather, laws or rules in force, or any figure that changes over time. Stable knowledge (concepts, history, how things work) needs no tool.',
  'A preceding assistant turn is conversation context, not evidence. Its sources and facts do not cover a new subject, a new country, or a new question; when the current request needs current facts the preceding turn does not already state, request live_web.',
  `With live_web, write 1-${PLANNER_SEARCH_QUERY_MAX_COUNT} web search queries a skilled researcher would type: self-contained (resolve pronouns and follow-ups from the conversation into the actual subject), specific to what must be established now, naming the place, office, event and year when known, and covering the distinct facts the answer needs (for example the current state and the upcoming event). Write them in the language most likely to find authoritative sources. Never copy the user's sentence when a better search exists.`,
].join(' ')

function toolCatalog(input: { surface: 'assistant' | 'concierge'; ownerAuthenticated: boolean }): readonly LocalModelToolDefinition[] {
  // Every surface can hand software work to the Software Specialist: wording no longer does it (2026-10-26), and the
  // Specialist itself keeps public work in its isolated workspace and repository authority with the signed-in owner.
  const allowed: readonly CosAgentCapability[] = input.surface === 'concierge'
    ? ['live_web', 'compute', 'software_specialist']
    : input.ownerAuthenticated
      ? COS_AGENT_CAPABILITIES
      : ['live_web', 'compute', 'software_specialist']
  return Object.freeze(allowed.map(name => Object.freeze({
    type: 'function' as const,
    function: Object.freeze({
      name,
      description: CAPABILITY_DESCRIPTIONS[name],
      parameters: name === 'live_web' ? LIVE_WEB_PARAMETERS
        : name === 'software_specialist' ? SOFTWARE_SPECIALIST_PARAMETERS
        : Object.freeze({ type: 'object', properties: Object.freeze({}), additionalProperties: false }),
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
      return { mode: 'answer', answer, confidence: score, capabilities: [], searchQueries: [], reason, reasonerLabel }
    }

    if (mode === 'orchestrate') {
      const rawCapabilities = Array.isArray(parsed.capabilities) ? parsed.capabilities : []
      const capabilities = [...new Set(
        rawCapabilities
          .map(value => String(value || '').trim())
          .filter(value => CAPABILITY_SET.has(value)),
      )] as CosAgentCapability[]
      if (!capabilities.length) return null
      const searchQueries = capabilities.includes('live_web') ? sanitizePlannerSearchQueries(parsed.queries) : []
      return { mode: 'orchestrate', answer: '', confidence: score, capabilities, searchQueries, reason, reasonerLabel }
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
  const raw = String(prompt || '').trim()
  // A short subject-domain preface (e.g. "In networking, what is ...?") does not
  // turn an otherwise self-contained definition into a tool request. Keep the
  // original prompt for the model; normalize only this planner eligibility check.
  const domainPreface = /^in\s+[a-z][a-z\s&/-]{0,32}?,?\s+(?=(?:what|why|how|explain|define|describe|compare)\b)/i
  const text = raw.replace(domainPreface, '').toLowerCase()
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
  // Unknown acronym identification can name a specific project, not an evergreen concept.
  // Let the capability planner decide if a lookup is necessary; do not force a web search.
  if (/^(?:what(?: is|'s)|define|explain)\\s+[A-Z][A-Z0-9-]{1,9}(?:\\s*[?.!]|$)/.test(String(prompt || '').trim())) return false
  const questionShape = /^(?:what|why|how|explain|define|describe|compare|when|where)\b/.test(text)
  if (!questionShape) return false
  if (/\b(?:today|current|currently|latest|live|now|this (?:week|month|year)|price|weather|schedule|availability|near me|my (?:account|email|calendar|files?|repo|repository|project)|deploy|commit|merge|pull request|pr\b|fix|change|create|send|book|buy|cancel|delete|update|build|implement|write|code|develop|run|debug|repair|test)\b/.test(text)) return false
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

  // Native and compatibility planning share one absolute clock. A timed-out first
  // transport cannot buy a second full deadline at the expense of answer execution.
  const planningDeadlineAt = Date.now() + timeoutMs
  const planningRemainingMs = () => Math.max(0, planningDeadlineAt - Date.now())
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
      'Read the whole request before choosing: decide what the user asks to have DONE, not which words appear in it. Request software_specialist only when the user wants software actually built, changed, run or repaired; an investigation, analysis, test plan or specification to discuss is answered by COS.',
      'When that work is exactly one file and the request gives or clearly implies the command that proves it, pass targetPath and verifyCommand to software_specialist; otherwise call it without them.',
      'Request compute when the answer needs a chart, graph or plot, a calculation over real data, statistics, or anything that requires running code; COS then retrieves the data and runs the code itself.',
      'Current/future travel details such as transport, fares, opening hours, prices, availability, schedules, weather, or other mutable facts require live_web.',
      LIVE_WEB_PLANNING_RULES,
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
      const liveWebCall = nativeTurn.toolCalls.find(call => String(call.function.name || '').trim() === 'live_web')
      const softwareCall = nativeTurn.toolCalls.find(call => String(call.function.name || '').trim() === 'software_specialist')
      return {
        mode: 'orchestrate',
        answer: '',
        confidence: 1,
        capabilities,
        searchQueries: liveWebCall ? plannerSearchQueriesFromToolArguments(liveWebCall.function.arguments) : [],
        verifiedTask: softwareCall ? verifiedTaskFromToolArguments(softwareCall.function.arguments) : null,
        reason: 'native_tool_request',
        reasonerLabel: turnReasonerLabel(nativeTurn),
      }
    }
  }

  if (nativeTurn?.content?.trim()) {
    const direct = parseCosAgentDecision(nativeTurn.content, turnReasonerLabel(nativeTurn))
    if (direct?.mode === 'answer') return direct
  }

  // If native planning exhausted its budget, leave the request to governed COS
  // reasoning rather than spending a second full window on compatibility probing.
  if (planningRemainingMs() < 1_000) return null

  // Compatibility fallback for OpenAI-compatible endpoints that do not implement native tools.
  // This is still one answer-or-plan model turn, never a classifier followed by another answer call.
  const raw = await callLocalModel({
    usageContext: { feature: 'cos_interactive_answer', purpose: 'agent_answer_or_capability_plan_compat' },
    temperature: 0.1,
    // Planner output is a tool call or a fixed one-line JSON; it never writes the user's answer.
    maxTokens: 300,
    disableThinking: true,
    timeoutMs: planningRemainingMs(),
    jsonObject: true,
    allowConfiguredFallback: false,
    persistUsage: false,
    systemPrompt: [
      'You are the first-turn capability PLANNER inside the COS agent runtime. You never answer the user: COS reasons and answers every request.',
      'For this user request choose exactly one outcome: NO TOOL NEEDED, or REQUEST the minimum capabilities needed before a reliable answer/action can be completed.',
      'Return ONLY strict JSON using exactly one of these shapes (never write an answer to the user):',
      '{"mode":"answer","answer":"COS","confidence":1,"capabilities":[],"reason":"cos_answers"}',
      '{"mode":"orchestrate","answer":"","confidence":0.0,"capabilities":["live_web"],"queries":["self-contained web search"],"reason":"brief reason"}',
      LIVE_WEB_PLANNING_RULES,
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
  }, { ...config, timeoutMs: planningRemainingMs() }).catch(error => {
    console.warn('[cos-agent-decision] compatibility fallback unavailable', error instanceof Error ? error.message : String(error))
    return null
  })

  return raw ? parseCosAgentDecision(raw, configuredReasonerLabel()) : null
}

/**
 * One native tool-calling round of the COS agent loop (lib/ai/cos/agentLoop). It lives in this
 * canonical agent seam so every model turn the loop takes uses the same governed transport as the
 * planner. The loop owns tools, budgets and verification; this function only runs the round.
 */
export async function runCosAgentToolTurn(input: {
  systemPrompt: string
  messages: readonly LocalModelChatMessage[]
  tools: readonly LocalModelToolDefinition[]
  toolChoice: 'auto' | 'none'
  timeoutMs: number
}): Promise<LocalModelTurnResult | null> {
  const config = localInferenceConfigFromEnv()
  // Production 2026-10-16 (round_ms [14259, 60135]): the configured reasoner (Qwen3.6-35B-A3B) never
  // finished a code-writing round within 60 s. On DeepInfra, loop rounds use the fast models the edit
  // lane already runs in production, the second only when the first returns nothing; other
  // providers keep their configured model.
  const deepInfra = /deepinfra/i.test(String(config.provider || '')) || /deepinfra\.com/i.test(config.baseUrl)
  const models = deepInfra
    ? [...new Set([
        process.env.COS_FAST_TEXT_MODEL?.trim() || 'deepseek-ai/DeepSeek-V4-Flash-0731',
        process.env.COS_DIRECT_TEXT_MODEL?.trim() || 'zai-org/GLM-5.3-Flash',
      ])]
    : [config.model]
  const startedAt = Date.now()
  const failures: string[] = []
  for (const [index, model] of models.entries()) {
    const remaining = input.timeoutMs - (Date.now() - startedAt)
    if (remaining < 5_000) break
    // The first model gets most of the round; a second attempt keeps at least a third of it.
    const attemptMs = index === models.length - 1 ? remaining : Math.max(5_000, Math.floor(remaining * 0.65))
    let noResult = ''
    try {
      const turn = await callLocalModelTurn({
        usageContext: { feature: 'cos_interactive_answer', purpose: 'agent_tool_loop' },
        prompt: '',
        systemPrompt: input.systemPrompt,
        messages: input.messages,
        tools: input.tools,
        toolChoice: input.toolChoice,
        temperature: 0.2,
        maxTokens: 2_000,
        // Code-writing rounds need repeated identifiers and indentation.
        frequencyPenalty: 0,
        presencePenalty: 0,
        disableThinking: true,
        timeoutMs: attemptMs,
        allowConfiguredFallback: false,
        persistUsage: true,
        maxEstimatedCostUsd: 0.05,
        onNoResult: reason => { noResult = reason },
      }, { ...config, model, timeoutMs: attemptMs })
      if (turn) return turn
      failures.push(noResult || `${model}: model returned no turn`)
    } catch (error) {
      failures.push(`${model}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const message = (failures.join(' | ') || 'no time left for a model round').slice(0, 600)
  // The loop records why a round produced nothing; a silent null hides provider rejections.
  console.warn('[cos-agent-loop] model turn failed', message)
  throw new Error(message)
}
