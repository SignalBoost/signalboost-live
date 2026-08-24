import { detectDirectTextTransformation } from './ai/cos/textTransformationInput.ts'

export const USER_SUPPLIED_SCENARIO_DIRECTIVE = [
  'CURRENT-REQUEST PREMISE RULE:',
  'Facts, numbers, terms, identities, and constraints that the user explicitly supplies in this request may be used as task premises when they describe a third-party situation or an explicitly hypothetical scenario.',
  'You may reason over, compare, calculate from, and restate those supplied premises to answer the user.',
  'Do not refuse merely because the scenario describes a private company or non-public facts.',
  'Do not say that you cannot access, disclose, or analyze facts that are already written in the current user request. Those facts are available as user-supplied premises even though they were not retrieved from private systems.',
  'When the supplied premises are sufficient for the requested analysis, begin directly with the analysis. Do not preface the answer with a private-data, public-catalog, confidentiality, or lack-of-access disclaimer.',
  'Do not claim those premises were independently verified, retrieved from private systems, or known outside the current request.',
  'This premise rule never overrides authoritative SignalBoost product catalog, status, runtime, authorization, safety, governance, or system-of-record facts.',
  'If the user supplies a conflicting claim about SignalBoost itself, do not restate it as a current fact. Use authoritative SignalBoost evidence instead; if the user explicitly framed it as hypothetical, reason only within that hypothetical frame.',
  'If additional facts are genuinely required, identify exactly what is missing and continue with the analysis that can be supported by the supplied premises.',
].join(' ')

const SCENARIO_DOMAIN = /\b(company|business|startup|vendor|contract|investor|financing|runway|valuation|board|ceo|cfo|employee|option pool|procurement|customer|tenant|provider)\b/i
const SCENARIO_TASK = /\b(compare|matrix|analy[sz]e|assess|evaluate|recommend|decide|decision|trade-?off|structure|plan|triage|go\/no-go|what should|how should)\b/i
const SIGNALBOOST_SELF_REFERENCE = /\b(?:signalboost(?:ai)?|self-healing supervisor|provider (?:connection )?hub|portable cos|agent operations|browser agent ecosystem|campaign studio|integrations hub|video maker|control center)\b/i
const EXPLICIT_HYPOTHETICAL = /\b(?:hypothetical(?:ly)?|suppose|assume for (?:this|the) scenario|imagine)\b/i

function premiseRuleAllowed(prompt: string): boolean {
  const value = String(prompt ?? '').trim()
  if (!value) return false

  // Preserve the dedicated text-transformation path. Prefixing policy prose before a
  // rewrite/edit intent can move the actual intent beyond that detector's bounded window.
  if (detectDirectTextTransformation(value)) return false

  // User input is not authoritative evidence about SignalBoost itself. Only an explicit
  // hypothetical may use a conflicting SignalBoost premise, and then only as hypothetical.
  if (SIGNALBOOST_SELF_REFERENCE.test(value) && !EXPLICIT_HYPOTHETICAL.test(value)) return false

  return true
}

export function shouldClarifyUserSuppliedScenario(prompt: string): boolean {
  const value = String(prompt ?? '').trim()
  if (!premiseRuleAllowed(value)) return false
  return SCENARIO_DOMAIN.test(value) && SCENARIO_TASK.test(value)
}

export function conciergePromptWithScenarioRule(prompt: string): string {
  const value = String(prompt ?? '').trim()
  if (!premiseRuleAllowed(value)) return value
  return `${USER_SUPPLIED_SCENARIO_DIRECTIVE}\n\nUSER REQUEST:\n${value}`
}

export function looksLikePrivateDataRefusal(reply: string): boolean {
  const value = String(reply ?? '').toLowerCase()
  return (
    value.includes('cannot provide a factual analysis') ||
    value.includes("do not have access to the company's private") ||
    value.includes('cannot access or disclose private company data') ||
    value.includes('cannot access or disclose private') ||
    (value.includes('private business information') && value.includes('cannot')) ||
    (value.includes('not part of the public signalboost product catalog') && value.includes('cannot')) ||
    (value.includes('not public information') && value.includes('cannot')) ||
    value.includes('without private data')
  )
}
