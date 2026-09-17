// saas/lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts
// The mass endpoint serves vLLM with --max-model-len 8192. Two Production rejections (2026-09-16) set the rules here:
// 15:40 UTC, 8 holdout cases with 3360 output tokens; 18:33 UTC, the same 8 cases with 1307 output tokens, rejected as
// "prompt contains at least 6886 tokens". "At least" is the provider's floor (8193 - output), not a measurement, so the
// 8-case holdout cannot be assumed to fit one call. The conservative 3 characters/token estimate is kept, and a suite that
// does not fit is split into a few smaller calls instead of being sent as one oversized request.
//
// Production then showed another independent bottleneck: a 4-case candidate request with a 1,680-token generation budget
// repeatedly reached the exact artifact but died behind the RunPod gateway with HTTP 502. Keep the evaluator unchanged, but
// bound every model response to 1,024 tokens so the serverless worker is not asked for multi-thousand-token generations merely
// because several concise cases share one request.
//
// 2026-09-17 01:20 UTC Production evidence showed the opposite edge too: after the 4-case request was reduced to 512 output
// tokens, the gateway completed but the response omitted a required answer marker. Reserve 192 tokens per case (still hard-
// capped at 1,024) so four-case batches receive 768 tokens.
//
// 2026-09-17 01:53 UTC Production evidence then showed a missing answer marker after the adaptive 4-case -> 2+2 recovery path.
// Give two-case split children the same 768-token floor. Truncation still fails closed; no cases, references, scoring thresholds,
// authority, promotion rules, or endpoint-call ceilings are changed.
//
// 2026-09-17 20:42 UTC Production showed the remaining transport edge: a 2-case candidate call returned 502, the evaluator
// split it 1+1, and the first child returned 502 again. That child failure escaped because split children are deliberately not
// allowed to create an unbounded recursive retry tree. Mass batches currently produce two holdout cases, so start that shape as
// two single-case groups instead. The existing bounded single-group retry can then retry one failed child while preserving all
// later-suite reservations and the same eight-call authorization ceiling.
//
// 2026-09-17 20:56-21:10 UTC Production then showed solo candidate calls repeatedly ending finish_reason=length even after
// their output allowance was raised from 768 to 1,024 tokens. Qwen3 thinking is enabled by default, while the exact-artifact
// canary already disables thinking. Add Qwen's documented /no_think soft switch to the evaluator system prompt so the bounded
// output budget is spent on the final answer rather than hidden thinking. Calls, output caps, cases, references, scoring
// thresholds, authority, promotion rules, and fail-closed truncation behavior are unchanged.
export const MASS_EVALUATION_MODEL_CONTEXT_TOKENS = 8192
export const MASS_EVALUATION_ESTIMATED_CHARACTERS_PER_TOKEN = 3
export const MASS_EVALUATION_SYSTEM_PROMPT = 'You are being evaluated on final-answer quality only. Do not provide hidden chain-of-thought. /no_think'
export const MASS_EVALUATION_MAX_OUTPUT_TOKENS = 1024
export function massEvaluationOutputTokens(caseCount: number, userPrompt: string): number {
  const estimatedPromptTokens=Math.ceil((MASS_EVALUATION_SYSTEM_PROMPT.length+userPrompt.length)/MASS_EVALUATION_ESTIMATED_CHARACTERS_PER_TOKEN)+128
  const desired=caseCount===1
    ? MASS_EVALUATION_MAX_OUTPUT_TOKENS
    : Math.min(MASS_EVALUATION_MAX_OUTPUT_TOKENS,Math.max(768,caseCount*192))
  const available=MASS_EVALUATION_MODEL_CONTEXT_TOKENS-estimatedPromptTokens
  const maxTokens=Math.min(desired,available)
  if(maxTokens<Math.max(256,caseCount*60))throw new Error(`mass_distilled_evaluation_context_budget_insufficient:cases=${caseCount}:estimatedPromptTokens=${estimatedPromptTokens}`)
  return maxTokens
}

function splitEvenly<T>(items: readonly T[], groups: number): T[][] {
  const out: T[][] = []
  const size = Math.ceil(items.length / groups)
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// Fewest contiguous, near-equal groups (at most maxGroups) whose every prompt fits the window. The two-case
// mass-holdout shape is intentionally started as 1+1 so a transient 502 on one case can use the existing single-
// group retry slot instead of entering the split-child path. Case order/content and every scoring threshold stay fixed.
export function planMassEvaluationGroups<T>(items: readonly T[], promptFor: (group: readonly T[]) => string, maxGroups: number): T[][] {
  if (!items.length) throw new Error('mass_distilled_evaluation_no_cases')
  const limit = Math.max(1, Math.min(Math.floor(maxGroups), items.length))
  const startGroups = items.length === 2 && limit >= 2 ? 2 : 1
  for (let groups = startGroups; groups <= limit; groups++) {
    const planned = splitEvenly(items, groups)
    const fits = planned.every(group => {
      try { massEvaluationOutputTokens(group.length, promptFor(group)); return true } catch { return false }
    })
    if (fits) return planned
  }
  throw new Error(`mass_distilled_evaluation_context_budget_insufficient:cases=${items.length}:maxGroups=${limit}`)
}
