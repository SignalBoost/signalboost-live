// saas/lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts
// The mass endpoint serves vLLM with --max-model-len 8192. A fixed 420 output tokens per case overflowed
// that window in Production (2026-09-16: 8 cases, prompt >= 4833 tokens + 3360 output = 8193 > 8192,
// HTTP 400). The output budget now fits the window using a conservative prompt estimate, without adding
// endpoint calls (the approval allows exactly one call per suite and model).
// Estimate calibration (2026-09-16 17:23 and 17:32 UTC): the same 8-case batch that the provider tokenized
// to ~4833 prompt tokens is ~27,000 characters (~5.6 characters per token). Dividing by 3 estimated 9,138
// tokens and refused a request that fits. Dividing by 4 still over-estimates Qwen tokenization with margin.
export const MASS_EVALUATION_MODEL_CONTEXT_TOKENS = 8192
export const MASS_EVALUATION_ESTIMATED_CHARACTERS_PER_TOKEN = 4
export const MASS_EVALUATION_SYSTEM_PROMPT = 'You are being evaluated on final-answer quality only. Do not provide hidden chain-of-thought.'
export function massEvaluationOutputTokens(caseCount: number, userPrompt: string): number {
  const estimatedPromptTokens=Math.ceil((MASS_EVALUATION_SYSTEM_PROMPT.length+userPrompt.length)/MASS_EVALUATION_ESTIMATED_CHARACTERS_PER_TOKEN)+128
  const desired=Math.min(4096,Math.max(1024,caseCount*420))
  const available=MASS_EVALUATION_MODEL_CONTEXT_TOKENS-estimatedPromptTokens
  const maxTokens=Math.min(desired,available)
  if(maxTokens<Math.max(256,caseCount*120))throw new Error(`mass_distilled_evaluation_context_budget_insufficient:cases=${caseCount}:estimatedPromptTokens=${estimatedPromptTokens}`)
  return maxTokens
}
