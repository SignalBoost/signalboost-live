// saas/lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts
import { ESTIMATED_CHARACTERS_PER_TOKEN, RUNPOD_CONTEXT_WINDOW_TOKENS, estimateContextTokens } from '../context-window-manager.ts'

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
//
// 2026-09-17 21:46 UTC Production then returned HTTP 502 for a 5-case candidate request even though the endpoint was awake and
// preflight was healthy. Five cases can fit the model context but are still too large for the observed serverless transport.
// For 3-6 case holdouts, start with enough near-equal groups to keep each request at two cases or fewer. A 5-case holdout becomes
// 2+2+1 for baseline and candidate, which leaves exactly two calls for the fixed baseline/candidate suites and therefore stays
// inside the unchanged eight-call authorization ceiling. Larger shapes keep the existing context planner and fail closed if the
// bounded recovery cannot fit; this transport rule does not change cases, references, scoring, promotion, or authority.
//
// 2026-09-17 22:23-22:35 UTC Production then repeatedly returned HTTP 502 for a 7-case candidate request while the exact-artifact
// endpoint was awake and preflight was healthy. Seven cases cannot be reduced to two-or-fewer per request without exceeding the
// unchanged eight-call authorization ceiling, so use the full three-group holdout budget and balance it 3+2+2. Candidate uses
// all three groups. When the baseline is intentionally capped at two groups to preserve one recovery slot, it must still split
// 4+3 instead of collapsing back to one seven-case request. No retry, scoring, promotion, case, reference, or authority boundary
// is expanded.
// ENDPOINT-CALL CEILING — owner decision 2026-09-17, raised 8 -> 14.
//
// Production measured what the previous ceiling could not accommodate. On identical holdout cases the trained
// candidate averages 28.4s per request against the baseline's 16.9s (roughly 1.7x), and the serverless gateway
// abandons a request in a measured 35.2-40.4s band. The candidate therefore fails 27 of 71 requests while the
// baseline fails 14 of 172, and the 12-case fixed suites - whose cases are short - never fail at all. Case count
// is not what predicts failure; how long the answering model takes is.
//
// The repair is smaller requests for the slower model, which costs calls rather than weakening evaluation.
// At 8 the run had no room: 3 holdout baseline + 3 holdout candidate + 2 fixed consumed everything. 14 lets
// the candidate use one request per holdout case while retaining bounded recovery headroom.
//
// This is a CALL ceiling, not a SPEND ceiling. The $0.20 wake ceiling, one-runtime-wake limit, cases, references,
// scoring thresholds, exact-artifact binding, promotion gates, and Production-traffic prohibition are unchanged.
//
// One constant is imported by the evaluator, rolling authority, and cron claim validator so approval cannot drift.
// 2026-09-19: raised 14 -> 18 to pay for splitting the fixed suites. Production showed the twelve fixed
// cases sharing ONE request per model under a 1024-token output cap, which decayed scores by position in
// the batch: safety (first four) 1.000, transfer 0.625, retention (last four) 0.000, identically across
// every run. The captured judge response was well-formed and scored the tail zero honestly, so the tail
// ANSWERS were degenerate rather than the judge broken. Each suite now gets its own request per model,
// costing 6 fixed calls instead of 2. Without this raise a 13-case holdout would drop the slower candidate
// from 9 groups to 5 - about three cases per request for the model that already fails at the gateway's
// ~40s cut-off - so the fix for one false negative would have manufactured another.
//
// This remains a CALL ceiling, not a SPEND ceiling: the $0.20 wake ceiling, the one-runtime-wake limit,
// scoring thresholds, exact-artifact binding, promotion gates and the Production-traffic prohibition are
// unchanged. The claim SQL asserts the same number and must be migrated in step - a TS-only change is
// rejected by the database and every tick reports no_atomically_claimable.
// 2026-09-28: raised 18 -> 25 to make the two models answer under the SAME conditions. At 18 the baseline was
// capped at 2 groups while the candidate took the rest, so a 13-case holdout gave the candidate 9 requests
// (~1.4 cases each) and the baseline 2 (~6.5 cases each, about 85 output tokens per answer). holdout_improved is a
// direct comparison of their scores, so unequal answer room is a defect in the measurement itself. Equal shares
// inside 18 would have left only 5 groups each - precisely the "9 groups to 5" regression the note above warns
// about for the slower candidate - so the ceiling had to move. 25 is the minimum that keeps the candidate's proven
// 9 groups AND gives the baseline the same nine: 9 + 9 + 6 fixed + 1 recovery = 25.
//
// This remains a CALL ceiling, not a SPEND ceiling: the $0.20 wake ceiling, the one-runtime-wake limit, scoring
// thresholds, exact-artifact binding, promotion gates and the Production-traffic prohibition are unchanged. The
// claim SQL asserts the same number and is migrated in step - a TS-only change is rejected by the database and
// every tick reports no_atomically_claimable.
export const MASS_EVALUATION_ENDPOINT_CALLS = 25
export const MASS_EVALUATION_JUDGE_CALLS = 4

export const MASS_EVALUATION_MODEL_CONTEXT_TOKENS = RUNPOD_CONTEXT_WINDOW_TOKENS
export const MASS_EVALUATION_ESTIMATED_CHARACTERS_PER_TOKEN = ESTIMATED_CHARACTERS_PER_TOKEN
export const MASS_EVALUATION_SYSTEM_PROMPT = 'You are being evaluated on final-answer quality only. Do not provide hidden chain-of-thought. /no_think'
export const MASS_EVALUATION_MAX_OUTPUT_TOKENS = 1024
// Production 2026-09-28: the same positional decay the fixed suites were split to cure is still live on HOLDOUT.
// The planner below minimizes CALLS, so above seven cases it starts at ONE group and only splits when a prompt
// stops fitting the context window - never because answers ran out of room. Measured against real exam prompts:
// 4 cases -> 384 output tokens per answer, 8 -> 128, 16 -> 64, while the 18-call budget sat almost unused (4 cases
// spends 2). 64-128 tokens cannot hold a graded exam answer, so the tail truncates and is scored wrong rather than
// broken, which is the answer_missing:<hash>:finish=length family and a plausible share of the both-zero holdouts.
// The floor is not a new number: massEvaluationOutputTokens already computes caseCount*192 as its DESIRED budget
// and then silently clamps it to 1024, so a big group asks for room the cap cannot give. The planner now simply
// honors the per-case budget this module already declares, spending calls that are already authorized. This changes only
// how cases are grouped across already-approved calls: the call ceiling, the $0.20 wake ceiling, case order and
// content, references, judge behavior, scoring thresholds and every promotion gate are untouched.
export const MASS_EVALUATION_MIN_ANSWER_TOKENS = 192
export function massEvaluationOutputTokens(caseCount: number, userPrompt: string): number {
  const estimatedPromptTokens=estimateContextTokens(MASS_EVALUATION_SYSTEM_PROMPT + userPrompt)+128
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
  const base = Math.floor(items.length / groups)
  const extra = items.length % groups
  let offset = 0
  for (let i = 0; i < groups; i += 1) {
    const size = base + (i < extra ? 1 : 0)
    if (size > 0) out.push(items.slice(offset, offset + size))
    offset += size
  }
  return out
}

// Fewest contiguous, near-equal groups (at most maxGroups) whose every prompt fits the window. The two-case
// mass-holdout shape is intentionally started as 1+1 so a transient 502 on one case can use the existing single-
// group retry slot instead of entering the split-child path. Production also proves 5-case and 7-case candidate
// requests can 502 despite fitting context, so 3-6 case holdouts start with groups no larger than two whenever
// maxGroups permits, while 7-case holdouts use the available transport budget: 3+2+2 with maxGroups=3 and 4+3
// with maxGroups=2. A caller may also supply minGroups when Production evidence requires smaller requests while staying
// inside an independently computed call budget. Case order/content and every scoring threshold stay fixed.
export function planMassEvaluationGroups<T>(items: readonly T[], promptFor: (group: readonly T[]) => string, maxGroups: number, minGroups = 1): T[][] {
  if (!items.length) throw new Error('mass_distilled_evaluation_no_cases')
  const limit = Math.max(1, Math.min(Math.floor(maxGroups), items.length))
  const floor = Math.max(1, Math.min(Math.floor(minGroups), limit))
  const desiredTransportGroups = items.length >= 3 && items.length <= 7
    ? Math.min(Math.ceil(items.length / 2), 3)
    : 1
  const transportGroups = Math.min(desiredTransportGroups, limit)
  const startGroups = Math.max(floor, items.length === 2 && limit >= 2 ? 2 : transportGroups)
  // Two passes in one sweep. `smallestFitting` reproduces the historical answer exactly - the fewest groups whose
  // prompts fit the window - and is returned unchanged when no split inside `maxGroups` can give each answer
  // MASS_EVALUATION_MIN_ANSWER_TOKENS of output room. So nothing that plans today can become infeasible; a roomier
  // plan is preferred only when the already-authorized call budget can pay for it.
  let smallestFitting: T[][] | null = null
  for (let groups = startGroups; groups <= limit; groups++) {
    const planned = splitEvenly(items, groups)
    let fits = true
    let roomy = true
    for (const group of planned) {
      let tokens = 0
      try { tokens = massEvaluationOutputTokens(group.length, promptFor(group)) } catch { fits = false; break }
      if (tokens < group.length * MASS_EVALUATION_MIN_ANSWER_TOKENS) roomy = false
    }
    if (!fits) continue
    if (!smallestFitting) smallestFitting = planned
    if (roomy) return planned
  }
  if (smallestFitting) return smallestFitting
  throw new Error(`mass_distilled_evaluation_context_budget_insufficient:cases=${items.length}:maxGroups=${limit}`)
}
