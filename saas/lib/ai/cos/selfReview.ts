// saas/lib/ai/cos/selfReview.ts
//
// SELF-CORRECTION LOOP — the Executive Review capability as a single-brain
// sequential loop: critique a draft, and only if it fails, revise from the
// critique and re-check. No multi-agent orchestration; no embeddings.
//
// Three core rules (factual grounding, constraint compliance, completeness)
// plus two SignalBoost guardrails (honest confidence, approval gate).
//
// LLM-backed (judgment); dependency-injected client so it stays testable.
// tsconfig non-strict: flat results; never throws to the caller.

import type Anthropic from '@anthropic-ai/sdk'

export interface CosReviewInput {
  objective: string
  draft: string
  evidence?: string // grounded data the draft was supposed to use
}

export interface CosReviewResult {
  ok: boolean
  passed: boolean
  failedRules: string[] // which named rules failed
  issues: string[]
  revisedGuidance: string
  error?: string
}

export interface CosCorrectionRound {
  draft: string
  review: CosReviewResult
}

export interface CosCorrectionResult {
  ok: boolean
  passed: boolean
  finalDraft: string
  rounds: CosCorrectionRound[] // full trace: each draft + its critique
  error?: string
}

const REVIEW_SYSTEM = `You are COS's internal reviewer — a senior operator checking a draft before it reaches the owner. Be skeptical and concrete. Judge the DRAFT only against the OBJECTIVE and the GROUNDED EVIDENCE provided. Evaluate these named rules:

FACTUAL_GROUNDING — Every current fact, number, or status in the draft must be supported by the grounded evidence. Answering from memory instead of evidence fails this rule; name the specific unsupported claim.
CONSTRAINT_COMPLIANCE — The draft must not assume a capability it lacks: it must not claim to have performed, or imply it can perform, a write/external/irreversible action from a read-only position.
COMPLETENESS — The draft must fully solve the explicit objective, not partially answer it or substitute a confident guess.
HONEST_CONFIDENCE — The draft must not overstate confidence, certainty, or capability beyond what the evidence supports.
APPROVAL_GATE — If the draft commits to or implies an irreversible or external action (sending, publishing, paying, deploying, deleting, contacting), it must flag that owner approval is required first.

Report your verdict by calling the report_review tool. Set passed to true only if NO rule is broken; list every broken rule by name in failedRules; put specific, actionable problems in issues; and put one short paragraph of fix guidance in revisedGuidance (empty string if it passed).`

const REVISE_SYSTEM = `You are COS revising your own draft after an internal review found problems. Produce a corrected draft that: fully addresses the objective; uses ONLY the grounded evidence for any current fact (if the evidence is missing a needed fact, say plainly that it must be fetched and do not invent it); states uncertainty honestly; and flags that owner approval is required before any irreversible or external action. Output ONLY the revised draft text — no preamble, no explanation.`

// Structured output via Anthropic native tool-forcing: the model must return its
// verdict as this tool's input, so it arrives as an already-shaped object — no
// free-text JSON to strip or parse. This is what makes the cheap critique model
// reliable.
const REVIEW_TOOL = {
  name: 'report_review',
  description: 'Report the structured review verdict for the draft.',
  input_schema: {
    type: 'object' as const,
    properties: {
      passed: { type: 'boolean', description: 'true only if no rule is broken' },
      failedRules: { type: 'array', items: { type: 'string' }, description: 'names of broken rules' },
      issues: { type: 'array', items: { type: 'string' }, description: 'specific, actionable problems' },
      revisedGuidance: { type: 'string', description: 'one short paragraph of fix guidance, empty if passed' },
    },
    required: ['passed', 'failedRules', 'issues', 'revisedGuidance'],
  },
}

function coerceReview(input: any): CosReviewResult {
  return {
    ok: true,
    passed: !!input?.passed,
    failedRules: Array.isArray(input?.failedRules) ? input.failedRules.map((s: any) => String(s)) : [],
    issues: Array.isArray(input?.issues) ? input.issues.map((s: any) => String(s)) : [],
    revisedGuidance: typeof input?.revisedGuidance === 'string' ? input.revisedGuidance : '',
  }
}

export async function reviewCosDraft(
  client: Anthropic,
  model: string,
  input: CosReviewInput,
): Promise<CosReviewResult> {
  if (!input?.objective?.trim() || !input?.draft?.trim()) {
    return { ok: false, passed: false, failedRules: [], issues: [], revisedGuidance: '', error: 'objective and draft are required' }
  }
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 700,
      temperature: 0,
      system: REVIEW_SYSTEM,
      tools: [REVIEW_TOOL as any],
      tool_choice: { type: 'tool', name: 'report_review' } as any,
      messages: [
        {
          role: 'user',
          content:
            `OBJECTIVE:\n${input.objective}\n\n` +
            `GROUNDED EVIDENCE:\n${input.evidence && input.evidence.trim() ? input.evidence : '(none provided — any current-fact claim in the draft is therefore unsupported)'}\n\n` +
            `DRAFT TO REVIEW:\n${input.draft}`,
        },
      ],
    })
    const toolUse = ((res as any).content || []).find((b: any) => b && b.type === 'tool_use' && b.name === 'report_review')
    if (!toolUse || !toolUse.input) {
      return { ok: false, passed: false, failedRules: [], issues: [], revisedGuidance: '', error: 'no structured verdict returned' }
    }
    return coerceReview(toolUse.input)
  } catch (e: any) {
    return { ok: false, passed: false, failedRules: [], issues: [], revisedGuidance: '', error: e?.message || 'review failed' }
  }
}

export async function reviseCosDraft(
  client: Anthropic,
  model: string,
  input: { objective: string; evidence?: string; draft: string; guidance: string },
): Promise<{ ok: boolean; draft: string; error?: string }> {
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 1200,
      temperature: 0.2,
      system: REVISE_SYSTEM,
      messages: [
        {
          role: 'user',
          content:
            `OBJECTIVE:\n${input.objective}\n\n` +
            `GROUNDED EVIDENCE:\n${input.evidence && input.evidence.trim() ? input.evidence : '(none provided)'}\n\n` +
            `PREVIOUS DRAFT:\n${input.draft}\n\n` +
            `REVIEW NOTES TO FIX:\n${input.guidance}`,
        },
      ],
    })
    const text = ((res as any).content || []).filter((b: any) => b && b.type === 'text').map((b: any) => b.text).join('\n').trim()
    if (!text) return { ok: false, draft: input.draft, error: 'empty revision' }
    return { ok: true, draft: text }
  } catch (e: any) {
    return { ok: false, draft: input.draft, error: e?.message || 'revision failed' }
  }
}

// The loop: critique → (only on failure) revise → re-critique. Bounded.
export async function runSelfCorrection(
  client: Anthropic,
  model: string,                    // revision model (the strong one)
  input: CosReviewInput,
  maxRevisions = 1,
  reviewModel = 'claude-haiku-4-5', // critique model (cheap; runs on every turn)
): Promise<CosCorrectionResult> {
  const rounds: CosCorrectionRound[] = []
  let currentDraft = input.draft

  let review = await reviewCosDraft(client, reviewModel, { ...input, draft: currentDraft })
  rounds.push({ draft: currentDraft, review })

  let revisions = 0
  while (review.ok && !review.passed && revisions < maxRevisions) {
    const rev = await reviseCosDraft(client, model, {
      objective: input.objective,
      evidence: input.evidence,
      draft: currentDraft,
      guidance: review.revisedGuidance,
    })
    if (!rev.ok) break
    currentDraft = rev.draft
    review = await reviewCosDraft(client, reviewModel, { ...input, draft: currentDraft })
    rounds.push({ draft: currentDraft, review })
    revisions++
  }

  return { ok: review.ok, passed: review.passed, finalDraft: currentDraft, rounds, error: review.error }
}
