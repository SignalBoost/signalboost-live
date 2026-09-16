// saas/lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts
// The mass endpoint serves vLLM with --max-model-len 8192. Two Production rejections (2026-09-16) set the rules here:
// 15:40 UTC, 8 holdout cases with 3360 output tokens; 18:33 UTC, the same 8 cases with 1307 output tokens, rejected as
// "prompt contains at least 6886 tokens". "At least" is the provider's floor (8193 - output), not a measurement, so the
// 8-case holdout cannot be assumed to fit one call. The conservative 3 characters/token estimate is kept, and a suite that
// does not fit is split into a few smaller calls instead of being sent as one oversized request.
export const MASS_EVALUATION_MODEL_CONTEXT_TOKENS = 8192
export const MASS_EVALUATION_ESTIMATED_CHARACTERS_PER_TOKEN = 3
export const MASS_EVALUATION_SYSTEM_PROMPT = 'You are being evaluated on final-answer quality only. Do not provide hidden chain-of-thought.'
export function massEvaluationOutputTokens(caseCount: number, userPrompt: string): number {
  const estimatedPromptTokens=Math.ceil((MASS_EVALUATION_SYSTEM_PROMPT.length+userPrompt.length)/MASS_EVALUATION_ESTIMATED_CHARACTERS_PER_TOKEN)+128
  const desired=Math.min(4096,Math.max(1024,caseCount*420))
  const available=MASS_EVALUATION_MODEL_CONTEXT_TOKENS-estimatedPromptTokens
  const maxTokens=Math.min(desired,available)
  if(maxTokens<Math.max(256,caseCount*120))throw new Error(`mass_distilled_evaluation_context_budget_insufficient:cases=${caseCount}:estimatedPromptTokens=${estimatedPromptTokens}`)
  return maxTokens
}

function splitEvenly<T>(items: readonly T[], groups: number): T[][] {
  const out: T[][] = []
  const size = Math.ceil(items.length / groups)
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// Fewest contiguous, near-equal groups (at most maxGroups) whose every prompt fits the window. Case order and
// content are never changed; only how many cases share one request. Throws when even maxGroups cannot fit.
export function planMassEvaluationGroups<T>(items: readonly T[], promptFor: (group: readonly T[]) => string, maxGroups: number): T[][] {
  if (!items.length) throw new Error('mass_distilled_evaluation_no_cases')
  const limit = Math.max(1, Math.min(Math.floor(maxGroups), items.length))
  for (let groups = 1; groups <= limit; groups++) {
    const planned = splitEvenly(items, groups)
    const fits = planned.every(group => {
      try { massEvaluationOutputTokens(group.length, promptFor(group)); return true } catch { return false }
    })
    if (fits) return planned
  }
  throw new Error(`mass_distilled_evaluation_context_budget_insufficient:cases=${items.length}:maxGroups=${limit}`)
}
