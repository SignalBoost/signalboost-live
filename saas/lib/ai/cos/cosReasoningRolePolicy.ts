export type CosSpecialistRole = 'primary' | 'coder' | 'critic' | 'verifier' | 'researcher'

export type CosReasoningRoleDecision = {
  role: CosSpecialistRole
  reason: string
  objective: string
}

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

const CODE_SIGNAL = /\b(code|coding|function|script|typescript|javascript|node(?:\.js)?|npm|pnpm|bun|python|sql|query|regex|api call|implement|implementation|refactor|compile|compiler|stack trace|bug|patch|repository|pull request|commit|create (?:a )?file|run (?:the )?(?:file|code|command))\b|\b(?:design|build|create)\s+(?:a\s+)?(?:website|web\s*page|landing page|dashboard|user interface|ui|component|mockup|prototype)\b/i
const CONCIERGE_BUILDER_ACTION = /\b(?:debug|fix|repair|refactor|implement|compile|write)\b|\b(?:create|build)\s+(?:a\s+)?(?:file|script|function|class|html|css|app|test)\b|\b(?:design|build|create)\s+(?:(?:a|an|the|my|me|us)\s+){0,2}(?:(?:responsive|modern|simple|full|new|mobile|web|marketing|interactive|custom|professional)\s+){0,3}(?:website|web\s*page|landing page|dashboard|user interface|ui|component|mockup|prototype)\b/i
const CURRENT_SIGNAL = /\b(current|currently|today|right now|as of now|latest|most recent|this (?:year|month|week)|live evidence|verify current|office holder)\b/i
const CRITIC_SIGNAL = /\b(diagnos|root cause|troubleshoot|incident|outage|latency|p9[59]|timeout|regression|failure mode|why (?:is|are|did|does).*(?:slow|fail|error|down|spike)|critique|audit|stress[- ]?test|find (?:the )?(?:flaw|weakness|problem))\b/i
const RESEARCH_SIGNAL = /\b(research|evidence|sources?|compare|comparison|difference between|what (?:is|are)|define|definition|who (?:is|was|are|were)|company|organization|organisation|architecture|mechanism|explain)\b/i

/** Broad worker selection for the authorized COS UI. */
export function isCosCodingObjective(prompt: string): boolean {
  return CODE_SIGNAL.test(cosRoutingObjective(prompt))
}

/**
 * Public Concierge may start Builder only for an action the user explicitly asked it to perform.
 * This is intentionally narrower than worker selection: “What is a SQL query?” is a COS answer,
 * not an authenticated sandbox task.
 */
export function isConciergeBuilderObjective(prompt: string): boolean {
  return CONCIERGE_BUILDER_ACTION.test(cosRoutingObjective(prompt))
}

/** Deterministic, zero-model-call task routing. */
export function selectCosReasoningWorkerRole(prompt: string): CosReasoningRoleDecision {
  const objective = cosRoutingObjective(prompt)
  if (isCosCodingObjective(objective)) return { role: 'coder', reason: 'code_or_implementation_signal', objective }
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
