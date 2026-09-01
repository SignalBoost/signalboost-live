import { MAX_BUILDER_OBJECTIVE_CHARS } from '../../builder/request-contract.ts'
import { isPastedOperationalLog } from './pastedOperationalLog.ts'

export type CosSpecialistRole = 'primary' | 'coder' | 'critic' | 'verifier' | 'researcher'

export type CosReasoningRoleDecision = {
  role: CosSpecialistRole
  reason: string
  objective: string
}

export type CosCodingRoutingContext = Readonly<{
  attachmentNames?: readonly string[]
  attachmentMimeTypes?: readonly string[]
  attachmentSizes?: readonly number[]
}>

export const COS_ROLE_TOKEN_CAPS: Readonly<Record<CosSpecialistRole, number>> = {
  primary: 6000,
  coder: 6000,
  critic: 4200,
  verifier: 2400,
  researcher: 3600,
}

function clean(value: unknown, max = 4000): string {
  return String(value ?? '').replace(/\r/g, '').trim().slice(0, max)
}

/**
 * Routing must be based on the user's task, not on evidence injected around it. Production COS
 * prompts normally carry USER QUESTION or Original question markers; use those when present and
 * fall back to the raw prompt only for direct/internal callers.
 */
export function cosRoutingObjective(prompt: string): string {
  const text = clean(prompt)
  const upper = text.toUpperCase()
  const userMarker = 'USER QUESTION:'
  const userIndex = upper.lastIndexOf(userMarker)
  if (userIndex >= 0) return clean(text.slice(userIndex + userMarker.length), 2000)

  const original = /Original question:\s*([^\n]+)/i.exec(text)
  if (original?.[1]) return clean(original[1], 2000)
  return clean(text, 2000)
}

const DESIGN_ARTIFACT_SIGNAL = /\b(?:website|web\s*page|landing(?:\s|-)?page|dashboard|user interface|ui|component|mockup|prototype)\b/i
const DESIGN_REQUEST_SIGNAL = /(?:^(?:please\s+)?(?:design|build|create|make)\b|\b(?:can|could)\s+you\b|\b(?:i\s+(?:need|want|would\s+like)|give\s+me|help\s+me)\b)/i
const CODE_ACTION = /\b(?:debug|fix|repair|troubleshoot|correct|implement|refactor|compile|write|run|execute|test)\b|\b(?:create|build|make)\s+(?:a\s+|an\s+|the\s+)?(?:file|script|function|class|component|api|endpoint|test|app|program|module)\b/i
const DEBUG_ACTION = /\b(?:debug|fix|repair|troubleshoot|correct)\b|\b(?:not\s+working|does(?:\s+not|n't)\s+work|not\s+functional|broken|failing|throws?|crashes?)\b/i
const CODE_LANGUAGE = /\b(?:javascript|typescript|node(?:\.js)?|python|react|next(?:\.js)?|html|css|sql|bash|shell|java|c\+\+|c#|golang|go|rust|php|ruby|swift|kotlin|tsx|jsx)\b/i
const FILE_REFERENCE = /(?:^|[\s`'"(])(?:\.\.?\/)?[A-Za-z0-9_@.+-]+(?:\/[A-Za-z0-9_@.+-]+)*\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py|html|css|json|sql|sh|bash|java|cpp|cc|cxx|cs|go|rs|php|rb|swift|kt)(?=$|[\s`'"),:.])/i
const STACK_TRACE = /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|ModuleNotFoundError|Traceback \(most recent call last\)|npm ERR!|ERR_[A-Z_]+)\b|\bat\s+[^\n]+\([^\n()]+:\d+:\d+\)|\bFile\s+"[^"]+",\s+line\s+\d+/i
const CODE_FENCE = /```(?:javascript|typescript|js|ts|tsx|jsx|python|py|sql|bash|sh|html|css|json)?\s*[\s\S]{12,}```/i
const CODE_NOUN = /\b(?:code|function|script|class|component|endpoint|api route|test case|regular expression|regex|query)\b/i
const EXPLICIT_CODE_QUESTION = /\b(?:how do i|how can i|show me how to|write|give me|create|implement)\b[\s\S]{0,100}\b(?:code|function|script|class|component|endpoint|regex|query)\b/i
const SOURCE_ATTACHMENT = /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py|html|css|json|sql|sh|bash|java|cpp|cc|cxx|cs|go|rs|php|rb|swift|kt)$/i
const NON_CODING_TOPIC = /\b(?:pay gap|gender wage|football|soccer|sports? standings?|sports? list|schools? of samba|secretar(?:y|ies) of state|who is the model|what model are you|current president)\b/i
const TRANSCRIPT_MARKER = /\b(?:assistant|user|system|history|conversation|copy response|copy question)\s*:/gi

function isDesignBuildRequest(prompt: string): boolean {
  const objective = cosRoutingObjective(prompt)
  return DESIGN_ARTIFACT_SIGNAL.test(objective) && DESIGN_REQUEST_SIGNAL.test(objective)
}

function sourceAttachment(context?: CosCodingRoutingContext): boolean {
  const names = Array.isArray(context?.attachmentNames) ? context.attachmentNames : []
  return names.some(name => SOURCE_ATTACHMENT.test(String(name || '').trim()))
}

function hugeTranscriptOrDump(prompt: string): boolean {
  const raw = String(prompt || '')
  if (raw.length > MAX_BUILDER_OBJECTIVE_CHARS) return true
  const markers = raw.match(TRANSCRIPT_MARKER)?.length ?? 0
  return raw.length > 16_000 && markers >= 12
}

function concreteCodeEvidence(prompt: string, context?: CosCodingRoutingContext): boolean {
  const objective = cosRoutingObjective(prompt)
  return sourceAttachment(context)
    || FILE_REFERENCE.test(objective)
    || STACK_TRACE.test(objective)
    || CODE_FENCE.test(objective)
    || CODE_LANGUAGE.test(objective)
}

function excludedFromBuilder(prompt: string, context?: CosCodingRoutingContext): boolean {
  const raw = String(prompt || '')
  const objective = cosRoutingObjective(raw)
  // A log alone cannot start Builder. A log plus an attached source file is the same
  // job a human sends here: debug that file. Huge dumps and off-topic prompts stay closed.
  if (isPastedOperationalLog(raw) && !sourceAttachment(context)) return true
  return hugeTranscriptOrDump(raw) || NON_CODING_TOPIC.test(objective)
}

function executableBuilderAction(objective: string): boolean {
  return CODE_ACTION.test(objective) || DEBUG_ACTION.test(objective)
}

const ASK_ABOUT_ATTACHMENT = /\b(?:what is|what's|whats|tell me what|explain|summarize|describe)\b/i

/**
 * Humans drop a file and type “fix this”, “help”, “não funciona”, or nothing.
 * A source attachment is the intent. Only a clear “what is this file?” stays on chat.
 * Pasted operational logs and huge dumps stay excluded above this helper.
 */
function attachedSourceIsTheJob(prompt: string, context?: CosCodingRoutingContext): boolean {
  if (!sourceAttachment(context)) return false
  const objective = cosRoutingObjective(prompt)
  if (ASK_ABOUT_ATTACHMENT.test(objective) && !executableBuilderAction(objective)) return false
  return true
}

/** Broad worker selection for the authorized COS UI. */
export function isCosCodingObjective(prompt: string, context?: CosCodingRoutingContext): boolean {
  if (excludedFromBuilder(prompt, context)) return false
  const objective = cosRoutingObjective(prompt)
  if (isDesignBuildRequest(objective)) return true
  if (attachedSourceIsTheJob(prompt, context)) return true
  const evidence = concreteCodeEvidence(objective, context)
  if (DEBUG_ACTION.test(objective)) return evidence
  if (CODE_ACTION.test(objective)) return evidence || (CODE_NOUN.test(objective) && CODE_LANGUAGE.test(objective))
  return evidence && EXPLICIT_CODE_QUESTION.test(objective)
}

/**
 * Public Concierge starts Builder for a design request, an explicit coding action with
 * source evidence, or a dropped source file with casual/empty wording.
 *
 * A timeout report, a log dump, “what is this file?”, or a general factual question
 * still cannot acquire sandbox authority. Platform self-repair with no source file stays closed.
 */
export function isConciergeBuilderObjective(prompt: string, context?: CosCodingRoutingContext): boolean {
  if (excludedFromBuilder(prompt, context)) return false
  const objective = cosRoutingObjective(prompt)
  if (isDesignBuildRequest(objective)) return true
  if (attachedSourceIsTheJob(prompt, context)) return true
  if (!executableBuilderAction(objective)) return false
  return concreteCodeEvidence(objective, context)
}

const CURRENT_SIGNAL = /\b(current|currently|today|right now|as of now|latest|most recent|this (?:year|month|week)|live evidence|verify current|office holder)\b/i
const CRITIC_SIGNAL = /\b(diagnos|root cause|troubleshoot|incident|outage|latency|p9[59]|timeout|regression|failure mode|why (?:is|are|did|does).*(?:slow|fail|error|down|spike)|critique|audit|stress[- ]?test|find (?:the )?(?:flaw|weakness|problem))\b/i
const RESEARCH_SIGNAL = /\b(research|evidence|sources?|compare|comparison|difference between|what (?:is|are)|define|definition|who (?:is|was|are|were)|company|organization|organisation|architecture|mechanism|explain)\b/i

/** Deterministic, zero-model-call task routing. */
export function selectCosReasoningWorkerRole(prompt: string, context?: CosCodingRoutingContext): CosReasoningRoleDecision {
  const objective = cosRoutingObjective(prompt)
  if (isCosCodingObjective(prompt, context)) return { role: 'coder', reason: 'code_or_implementation_signal', objective }
  if (CURRENT_SIGNAL.test(objective)) return { role: 'verifier', reason: 'current_or_live_verification_signal', objective }
  if (CRITIC_SIGNAL.test(objective)) return { role: 'critic', reason: 'diagnostic_or_critical_reasoning_signal', objective }
  if (RESEARCH_SIGNAL.test(objective)) return { role: 'researcher', reason: 'research_or_explanatory_signal', objective }
  return { role: 'primary', reason: 'general_reasoning_default', objective }
}

export function boundedRoleMaxTokens(role: CosSpecialistRole, requested?: number): number | undefined {
  if (requested === undefined) return undefined
  const numeric = Number(requested)
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined
  return Math.max(256, Math.min(Math.floor(numeric), COS_ROLE_TOKEN_CAPS[role]))
}
