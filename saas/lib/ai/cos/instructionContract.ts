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
