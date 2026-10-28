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
  'A bare acknowledgement, digit such as 0, or ambiguous one-token follow-up is not permission to rewrite a previous letter, repeat an answer, run a tool, or initiate another task. Resolve only an explicitly offered numbered option; otherwise briefly ask what the customer wants next.',
  'Retain the original objective, explicit prohibitions, and agreed constraints through every tool call and retry.',
  'Compare final output with the actual requested outcome; a tool receipt or fluent prose alone is not task completion.',
  'Answer the customer underlying question, not merely summarize the supplied document.',
  'Pursue directly relevant alternative authority when the supplied source does not answer the user objective.',
  'Verify that each citation substantiates the specific claim rather than merely referring to a retrieved page.',
  'After the substantive answer, explain the most useful practical next step and offer concise relevant further help.',
  'Remain proactive but do not perform an unrequested draft, communication, deployment, purchase, or other action.',
].join('\n')

/**
 * Locate a user's explicit closing question after a pasted document. The document
 * remains available as evidence, but its subject must not replace the customer's
 * request. Do not claim the extracted question was independently verified.
 */
export function closingDocumentQuestion(raw: string): string | null {
  const text = String(raw || '').trim()
  if (text.length < 1200) return null
  const tail = text.slice(-1200)
  const paragraphs = tail.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  const last = paragraphs.at(-1) || ''
  if (last.length < 18 || last.length > 650) return null
  if (!/(?:\?|\b(?:i wonder|can i|could i|should i|would i|is there|what are my options)\b)/i.test(last)) return null
  // Source text frequently contains numbered sections, citations and headings;
  // do not promote those into the user's instruction.
  if (/^\s*(?:\d{1,2}[.)]|(?:from|subject|mrn|date|signature):)/i.test(last)) return null
  return last
}
