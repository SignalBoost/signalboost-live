const INTERNAL_SCENARIO_PREFIX = 'CURRENT-REQUEST PREMISE RULE:'
const USER_REQUEST_MARKER = '\n\nUSER REQUEST:\n'

const SIGNALBOOST_SELF_REFERENCE = /\b(?:signalboost(?:ai)?|self-healing supervisor|provider (?:connection )?hub|agent operations platform|browser automation governor|campaign studio|integrations hub|video maker|control center software|portable cos)\b/i

const SIGNALBOOST_CONTEXT_LEAK = /\b(?:signalboost(?:ai)?|public (?:signalboost )?product catalog|self-healing supervisor|provider (?:connection )?hub|agent operations platform|browser automation governor|integrations hub)\b/i

const USER_PREMISE_ACCESS_DISCLAIMER = /(?:cannot|can't|do not have access|don't have access)[^\n.]{0,140}\b(?:private|financial|contract|roadmap|company data|business information)\b|\bnot part of the public signalboost product catalog\b|\bwithout (?:access to )?private data\b/i

/**
 * The homepage may prepend a server-authored premise directive before the real user text.
 * That wrapper is policy transport, not user content. Public routing and product-scope
 * classification must operate on the actual request so the word "SignalBoost" inside the
 * directive cannot turn a generic third-party scenario into a SignalBoost-specific request.
 */
export function publicUserRequestText(prompt: string): string {
  const value = String(prompt ?? '').trim()
  if (!value.startsWith(INTERNAL_SCENARIO_PREFIX)) return value
  const markerIndex = value.lastIndexOf(USER_REQUEST_MARKER)
  if (markerIndex < 0) return value
  return value.slice(markerIndex + USER_REQUEST_MARKER.length).trim()
}

export function isSignalBoostSpecificPublicRequest(prompt: string): boolean {
  return SIGNALBOOST_SELF_REFERENCE.test(publicUserRequestText(prompt))
}

export type PublicScenarioScopeViolation =
  | 'signalboost_context_leak'
  | 'user_premise_access_disclaimer'

/**
 * Generic third-party/hypothetical scenarios must not inherit SignalBoost catalog context and
 * must not refuse facts that are already present in the user's request. This is answer-quality
 * validation only; it grants no private-system access.
 */
export function publicScenarioScopeViolations(prompt: string, answer: string): PublicScenarioScopeViolation[] {
  if (isSignalBoostSpecificPublicRequest(prompt)) return []
  const value = String(answer ?? '')
  const violations: PublicScenarioScopeViolation[] = []
  if (SIGNALBOOST_CONTEXT_LEAK.test(value)) violations.push('signalboost_context_leak')
  if (USER_PREMISE_ACCESS_DISCLAIMER.test(value)) violations.push('user_premise_access_disclaimer')
  return violations
}
