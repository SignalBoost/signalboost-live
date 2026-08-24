export const USER_SUPPLIED_SCENARIO_DIRECTIVE = [
  'CURRENT-REQUEST PREMISE RULE:',
  'Facts, numbers, terms, identities, and constraints that the user explicitly supplies in this request are user-provided task premises, not private SignalBoost records retrieved by the Concierge.',
  'You may reason over, compare, calculate from, and restate those supplied premises to answer the user.',
  'Do not refuse merely because the scenario describes a private company or non-public facts.',
  'Do not claim those premises were independently verified, retrieved from private systems, or known outside the current request.',
  'If additional facts are required, identify exactly what is missing and continue with the analysis that can be supported by the supplied premises.',
].join(' ')

export function conciergePromptWithScenarioRule(prompt: string): string {
  return `${USER_SUPPLIED_SCENARIO_DIRECTIVE}\n\nUSER REQUEST:\n${String(prompt ?? '').trim()}`
}

export function looksLikePrivateDataRefusal(reply: string): boolean {
  const value = String(reply ?? '').toLowerCase()
  return (
    value.includes('cannot provide a factual analysis') ||
    value.includes("do not have access to the company's private") ||
    (value.includes('not public information') && value.includes('cannot')) ||
    value.includes('without private data')
  )
}
