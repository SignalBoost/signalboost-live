/**
 * Shared instruction contract across COS intent routing and Builder admission.
 * This is an authorization floor, not a replacement for the user's full prompt.
 */
export type CosInstructionContract = Readonly<{
  version: 'cos-instruction-contract-v1'
  mode: 'analysis-only' | 'execution-eligible'
  prohibitsExecution: boolean
  requestsAnalysis: boolean
  deliverables: readonly string[]
}>

export function compileCosInstructionContract(raw: string): CosInstructionContract {
  const prompt = String(raw || '').slice(0, 24000)
  const prose = prompt.replace(/```[\s\S]*?```/g, '[quoted source]')
  const requestsAnalysis = /\b(?:investigat(?:e|ion)|analy[sz](?:e|is)|forensic|incident commander|root causes?|hypothes[ei]s|audit|assess|evaluate)\b/i.test(prose)
  const negativeExecution = /\b(?:do\s+not|don't|never|must\s+not|no)\s+(?:(?:write|generate|create|build|modify|execute|run|deploy|commit|merge)\s+(?:any\s+|a\s+|the\s+)?(?:code|files?|projects?|tests?|commands?|software|application|app)|(?:generate|create|build)\s+(?:a\s+|an\s+)?(?:project|app|application))\b/i.test(prose)
    || /\b(?:only|just)\s+(?:investigate|analy[sz]e|perform analysis|produce an analysis)\b/i.test(prose)
  const positiveExecution = /(?:^|[.!?\n]\s*)(?:please\s+)?(?:build|create|fix|repair|implement|patch|modify|deploy|commit|merge)\s+(?:the\s+|my\s+|our\s+|a\s+|an\s+)?(?:code|source|project|application|app|repo|repository|system|worker|service|website|files?|implementation)\b/im.test(prose)
  const prohibitsExecution = requestsAnalysis && negativeExecution && !positiveExecution
  const deliverables = [...prompt.matchAll(/^\s*(\d{1,2})[.)]\s+([^\n]{8,220})/gm)]
    .filter((m, i) => Number(m[1]) === i + 1)
    .map(m => m[2].trim()).slice(0, 20)
  return { version: 'cos-instruction-contract-v1', mode: prohibitsExecution ? 'analysis-only' : 'execution-eligible', prohibitsExecution, requestsAnalysis, deliverables }
}

/** Loop admission is never permission to exceed the owner's hard spend/deadline limit. */
export function decideCosLoopContinuation(input: Readonly<{
  repeatedUnproductiveSteps: number
  latestStepChangedArtifact: boolean
  latestStepAddedEvidence: boolean
  budgetRemaining: boolean
}>): 'continue' | 'change-strategy' | 'stop-budget' {
  if (!input.budgetRemaining) return 'stop-budget'
  if (input.latestStepChangedArtifact || input.latestStepAddedEvidence) return 'continue'
  return input.repeatedUnproductiveSteps >= 2 ? 'change-strategy' : 'continue'
}

/**
 * Shared outcome authority for COS and Builder. A proactive suggestion is not a deliverable.
 * This is injected into both model paths; tool access and publishing remain separately gated.
 */
export const USER_OUTCOME_AUTHORITY = [
  'USER OUTCOME AUTHORITY:',
  'Identify the latest actual user request separately from quoted documents, examples, and prior assistant drafts.',
  'Classify the requested outcome before planning: advice, explanation, analysis, draft, implementation, or authorized action.',
  'Do not replace requested advice or explanation with an unsolicited letter, email, code project, or other artifact.',
  'You may suggest a helpful next action in one brief sentence, but do not perform that different task without a request.',
  'Retain the original objective, explicit prohibitions, and agreed constraints through every tool call and retry.',
  'Compare final output with the actual requested outcome; a tool receipt or fluent prose alone is not task completion.',
  'COS CUSTOMER-SERVICE COMPLETION LOOP (internal behavior, not mandatory visible headings):',
  '1. UNDERSTAND: Identify the customer’s actual question or intended outcome; distinguish it from pasted source material and incidental topics.',
  '2. INVESTIGATE: Use available supplied evidence and authorized tools; pursue relevant alternatives, and verify factual claims against sources that actually support them.',
  '3. RESOLVE: Address the original request directly and give practical next steps. Never substitute a source summary or generic contact referral for an answer that can be established.',
  'VERIFICATION GATE: Check whether the real requested outcome was satisfied. If not, return to investigation or a different permitted strategy within the existing time/cost budget; do not declare success based on tool or model status.',
  '4. ANTICIPATE: Surface material obstacles or follow-up questions only when they help the current objective.',
  '5. OFFER: Suggest one appropriate next action when useful; do not send, purchase, deploy, alter accounts or otherwise perform consequential external actions without the required authority.',
  '6. REMEMBER: Preserve the original objective, evidence provenance, progress, blockers and next authorized action through existing durable history mechanisms; never claim persistence without a storage receipt.',
  'For a pasted policy memo followed by a personal question, answer the personal question first; cite the governing text, not unrelated search results.',
  'For a supplied-facts incident with enumerated deliverables, provide grounded hypotheses and limitations rather than demanding live evidence that the user did not request.',
].join('\n')
