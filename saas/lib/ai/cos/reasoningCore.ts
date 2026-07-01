// saas/lib/ai/cos/reasoningCore.ts
//
// REFLEX LAYER + assembly. Runs the fixed safety mechanism (approval floor +
// state machine) over the judgment layer (channel classification + source
// routing), and produces a single auditable decision record.
//
// Safety invariants that are mechanical, not policy you must remember:
//   - reads NEVER trip the approval floor; actions ALWAYS get checked.
//   - a SENSITIVE_CATEGORIES match ALWAYS requires approval — no exceptions.
//   - v2: an action matching NEITHER a sensitive category NOR a known-safe
//     internal action (SAFE_INTERNAL_ACTIONS) still conservatively defaults
//     to approval. Only actions provably internal-only (drafting, rendering,
//     scoring, queueing — nothing external, nothing spent) may EXECUTE
//     without stopping for the owner. This is what makes day-to-day COSA
//     operation autonomous while every external/irreversible action still
//     stops at the owner, exactly once, before it leaves the building.

import type {
  CosReasoningInput,
  CosReasoningOutput,
  CosChannel,
  CosDecisionState,
} from './reasoningTypes';
import {
  CHANNEL_BELIEFS,
  SENSITIVE_CATEGORIES,
  SAFE_INTERNAL_ACTIONS,
  ACTION_VERBS,
} from './cosBeliefs';
import { routeCosSource } from './sourceRouter';

function decisionId(): string {
  return `cos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isQuestion(text: string): boolean {
  if (text.includes('?')) return true;
  return /^(how|what|why|which|who|where|when|do|does|did|is|are|should|can|could|would)\b/.test(text);
}

function detectProposesAction(text: string): boolean {
  if (isQuestion(text)) return false;
  return ACTION_VERBS.some((v) => text.includes(v));
}

function classifyChannel(text: string): CosChannel {
  let best: CosChannel = 'analysis_only';
  let bestScore = 0;
  for (const ch of CHANNEL_BELIEFS) {
    if (ch.signals.length === 0) continue;
    const score = ch.signals.filter((s) => text.includes(s)).length;
    if (score > bestScore) {
      bestScore = score;
      best = ch.id;
    }
  }
  return best;
}

function channelBelief(channel: CosChannel) {
  return CHANNEL_BELIEFS.find((c) => c.id === channel) ?? CHANNEL_BELIEFS[CHANNEL_BELIEFS.length - 1];
}

// Fixed mechanism. Owner tunes WHICH actions are sensitive (in cosBeliefs);
// this function can escalate to requiredApproval=true from a sensitive match,
// or clear it ONLY for a known-safe internal action. Anything matching
// neither list stays conservative: default to approval.
function approvalFloor(text: string, proposesAction: boolean): { requiredApproval: boolean; approvalReasons: string[] } {
  if (!proposesAction) return { requiredApproval: false, approvalReasons: [] };

  // Sensitivity is a one-way ratchet: a match here can NEVER be cleared below.
  const sensitiveReasons = SENSITIVE_CATEGORIES
    .filter((c) => c.signals.some((s) => text.includes(s)))
    .map((c) => c.id);
  if (sensitiveReasons.length > 0) return { requiredApproval: true, approvalReasons: sensitiveReasons };

  // Not sensitive — is it a known-safe, internal-only COSA operation?
  // Nothing external happens, nothing is spent, nothing leaves the private
  // queue, so it may execute without stopping for the owner.
  const safeMatch = SAFE_INTERNAL_ACTIONS.find((a) => a.signals.some((s) => text.includes(s)));
  if (safeMatch) return { requiredApproval: false, approvalReasons: [] };

  // Unclassified action → conservative reflex: default to approval.
  return { requiredApproval: true, approvalReasons: ['unclassified action — defaulting to approval'] };
}

function deriveState(
  blocked: boolean,
  proposesAction: boolean,
  requiredApproval: boolean,
  mustUseTool: boolean,
): CosDecisionState {
  if (blocked) return 'BLOCKED';
  if (proposesAction) return requiredApproval ? 'PREPARE_AND_HOLD' : 'EXECUTE';
  return mustUseTool ? 'RETRIEVE_AND_ANSWER' : 'ANALYZE_ONLY';
}

function validateObjective(objective: string): string[] {
  const blockedBy: string[] = [];
  const trimmed = (objective || '').trim();
  if (trimmed.length === 0) blockedBy.push('missing or empty objective');
  else if (!/[a-zA-Z]/.test(trimmed)) blockedBy.push('malformed objective (no readable text)');
  else if (trimmed.length > 2000) blockedBy.push('objective too long (over 2000 chars)');
  return blockedBy;
}

function normalizeInput(input: CosReasoningInput | string): CosReasoningInput {
  if (typeof input === 'string') return { objective: input };
  return input ?? { objective: '' };
}

export function runCosReasoning(rawInput: CosReasoningInput | string): CosReasoningOutput {
  const input = normalizeInput(rawInput);
  const objective = typeof input.objective === 'string' ? input.objective : '';
  const text = ` ${objective.toLowerCase().trim()} `;

  const id = decisionId();
  const inputSummary = objective.trim().slice(0, 140) || '(empty)';

  const blockedBy = validateObjective(objective);
  const blocked = blockedBy.length > 0;

  const channel = blocked ? 'analysis_only' : classifyChannel(text);
  const cb = channelBelief(channel);
  const sourceRouting = routeCosSource(objective);
  const proposesAction = blocked ? false : detectProposesAction(text);
  const { requiredApproval, approvalReasons } = blocked
    ? { requiredApproval: false, approvalReasons: [] as string[] }
    : approvalFloor(text, proposesAction);

  const state = deriveState(blocked, proposesAction, requiredApproval, sourceRouting.mustUseTool);
  const shouldPrepareNow = !blocked;
  const shouldExecuteNow = state === 'EXECUTE';

  // ---- analysis ----
  const constraints = [
    'COS may PREPARE and EXECUTE known-safe internal actions on its own; anything sensitive or unclassified requires explicit owner approval.',
    'COS may not answer current-fact questions from memory; it must use the routed source.',
  ];
  const risks: string[] = [];
  if (sourceRouting.mustUseTool) risks.push('Answering without the routed source would risk an inaccurate, from-memory answer.');
  if (approvalReasons.length > 0) risks.push(`Gated action categories: ${approvalReasons.join(', ')}.`);
  if (/dns|domain|production|deploy|env|vercel/.test(text)) risks.push('Infrastructure change risk — a mistake can take production down.');
  if (/delete|drop|wipe|purge|remove/.test(text)) risks.push('Destructive risk — records could be lost.');

  const opportunities: string[] = [];
  if (channel !== 'analysis_only') opportunities.push(`A well-framed ${channel} action could move ${cb.metricsToWatch[0]}.`);

  const missingInfo: string[] = [...blockedBy];
  if (!blocked && channel === 'analysis_only' && sourceRouting.requiredSource === 'no_tool_required' && !proposesAction) {
    missingInfo.push('Objective is broad; clarify the desired outcome for a sharper recommendation.');
  }

  // ---- decision ----
  let confidence = blocked ? 0 : 0.4;
  if (!blocked && channel !== 'analysis_only') confidence += 0.2;
  if (!blocked && sourceRouting.requiredSource !== 'no_tool_required') confidence += 0.2;
  confidence = Math.min(confidence, 0.9);

  const recommendedAction = blocked
    ? 'Reject and request a valid objective.'
    : proposesAction
      ? requiredApproval
        ? `Prepare a ${channel} plan/draft and hold for owner approval.`
        : `Execute this internal ${channel} action directly — no external effect, no owner approval required.`
      : sourceRouting.mustUseTool
        ? `Fetch from ${sourceRouting.requiredSource}, then answer.`
        : `Answer directly as ${channel}.`;

  const rationale = [
    `Channel classified as "${channel}" (${cb.describes}).`,
    sourceRouting.reason,
    proposesAction ? 'Objective proposes an action.' : 'Objective is a question/analysis, not an action.',
    requiredApproval ? `Approval required: ${approvalReasons.join(', ')}.` : 'No owner approval required — either a read, or a known-safe internal action.',
  ];

  // ---- execution plan ----
  const steps: string[] = [];
  if (blocked) {
    steps.push('Do nothing; ask the owner for a valid objective.');
  } else {
    if (sourceRouting.mustUseTool) steps.push(`Step 1 — consult source "${sourceRouting.requiredSource}" (tool required).`);
    if (proposesAction) {
      steps.push(`Step ${steps.length + 1} — draft the ${channel} action using frame: ${cb.messageFrame}`);
      if (requiredApproval) {
        steps.push(`Step ${steps.length + 1} — STOP and present to owner for approval. Do not execute.`);
      } else {
        steps.push(`Step ${steps.length + 1} — execute directly; internal-only, nothing external affected.`);
      }
    } else {
      steps.push(`Step ${steps.length + 1} — produce the answer/recommendation.`);
    }
  }

  // ---- feedback plan ----
  const feedbackPlan = {
    metricsToWatch: cb.metricsToWatch,
    successCriteria: blocked
      ? ['A valid objective is supplied.']
      : requiredApproval
        ? [`Owner approves the prepared ${channel} action.`, 'The answer is grounded in the routed source, not memory.']
        : ['The internal action completes without error.', 'The answer is grounded in the routed source, not memory.'],
    retrainingSignals: [
      'Owner overrides the channel or source COS chose.',
      'Owner rejects a prepared action.',
      'Prepared or executed action underperforms its metrics after release.',
    ],
  };

  // ---- report ----
  const report = [
    `COS Decision ${id}`,
    ``,
    `What I understood: ${inputSummary}`,
    `Decision channel: ${channel}`,
    `Source of truth required: ${sourceRouting.requiredSource}`,
    `Must use a tool before answering: ${sourceRouting.mustUseTool ? 'YES' : 'no'}`,
    `Can I prepare now: ${shouldPrepareNow ? 'YES' : 'no'}`,
    `Owner approval required before execution: ${requiredApproval ? `YES (${approvalReasons.join(', ')})` : 'no'}`,
    `State: ${state}`,
    ``,
    sourceRouting.mustUseTool
      ? `I will NOT answer from memory. I must check "${sourceRouting.requiredSource}" first.`
      : `No live source needed; this is a reasoning-only answer.`,
    proposesAction && requiredApproval
      ? `I can prepare a draft/plan, but I will hold for your approval before executing.`
      : proposesAction
        ? `This is an internal-only action — executing directly, no external effect.`
        : ``,
    blocked ? `Blocked: ${blockedBy.join('; ')}.` : ``,
  ].filter(Boolean).join('\n');

  return {
    ok: !blocked,
    decisionId: id,
    inputSummary,
    analysis: { objective, constraints, risks, opportunities, missingInfo },
    decision: { recommendedAction, channel, messageFrame: cb.messageFrame, confidence, rationale },
    sourceRouting,
    executionPlan: {
      state,
      shouldPrepareNow,
      shouldExecuteNow,
      requiredApproval,
      approvalReasons,
      proposesAction,
      steps,
      blockedBy,
    },
    feedbackPlan,
    report,
    error: blocked ? blockedBy.join('; ') : undefined,
  };
}
