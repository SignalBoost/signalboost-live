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

// Browser-safe mirror of the explicit transformation-intent check. Do not import the server-side
// textTransformationInput module here: it now carries request-local artifact continuation state
// backed by AsyncLocalStorage/node:async_hooks, which cannot enter the homepage client bundle.
const TRANSFORM_INTENT_RE = /(?<![\p{L}\p{N}_])(?:edit|rewrite|proofread|polish|rephrase|shorten|tighten|clean\s*up|summari[sz]e|translate|correct\s+(?:the\s+)?grammar|fix\s+(?:the\s+)?grammar|improve\s+(?:the\s+)?wording|make\s+(?:this|it)\s+(?:clearer|more\s+professional)|editar|edite|reescrev(?:a|er)|revis(?:e|ar)|corrig(?:a|ir)|melhor(?:e|ar)|encurt(?:e|ar)|resum(?:a|ir)|traduz(?:a|ir)|edita|reescrib(?:e|ir)|revisa|revisar|corrig(?:e|ir)|mejora|mejorar|acorta|acortar|resume|resumir|traduce|traducir|edytuj|przeredaguj|zredaguj|popraw|skr[oó][ćc]|stre[sś][ćc]|streszcz|przet[lł]umacz|отредактируй|редактировать|перепиши|исправь|улучши|сократи|резюмируй|суммируй|переведи)(?![\p{L}\p{N}_])/iu
const LEADING_REQUEST_RE = /^(?:please\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+|por\s+favor\s+|proszę\s+|пожалуйста\s+)?/iu

function looksLikeDirectTextTransformation(prompt: string): boolean {
  const raw = String(prompt ?? '').trim()
  if (raw.length < 20) return false
  const stripped = raw.replace(LEADING_REQUEST_RE, '')
  const intent = stripped.match(TRANSFORM_INTENT_RE)
  return Boolean(intent && intent.index !== undefined && intent.index <= 100)
}

function premiseRuleAllowed(prompt: string): boolean {
  const value = String(prompt ?? '').trim()
  if (!value) return false

  // Preserve the dedicated text-transformation path without importing server-only continuation
  // state into the browser bundle. The API route still performs the authoritative full detection.
  if (looksLikeDirectTextTransformation(value)) return false

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
