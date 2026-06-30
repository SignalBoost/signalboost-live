// saas/lib/ai/cos/reasoningTypes.ts
//
// Type contract for the COS reasoning core. Defines all three layers so the
// boundaries are visible: reflex (CosDecisionState, execution plan), static
// ideas (the belief types live in cosBeliefs.ts), judgment (the output).

export type CosChannel =
  | 'video'
  | 'outreach'
  | 'pricing_or_offer'
  | 'trust_content'
  | 'analysis_only';

export type CosSourceType =
  | 'live_public_website'
  | 'signalboost_public_website'
  | 'internal_database'
  | 'github_repo'
  | 'vercel_deployment'
  | 'analytics'
  | 'crm_or_leads'
  | 'owner_memory'
  | 'no_tool_required';

export type CosDecisionState =
  | 'BLOCKED'              // malformed/empty objective or missing required info
  | 'ANALYZE_ONLY'        // pure strategy; no tool, no action
  | 'RETRIEVE_AND_ANSWER' // read-only fact question; must fetch first, no approval
  | 'PREPARE_AND_HOLD'    // draft/plan a gated action, stop at approval
  | 'EXECUTE';            // safe action, no approval — UNREACHABLE in v1

export interface CosReasoningInput {
  objective: string;
  context?: {
    ownerId?: string;
    locale?: string;
    knownFacts?: Record<string, string>;
  };
}

export interface CosSourceRouting {
  requiredSource: CosSourceType;
  mustUseTool: boolean;
  reason: string;
}

export interface CosAnalysis {
  objective: string;
  constraints: string[];
  risks: string[];
  opportunities: string[];
  missingInfo: string[];
}

export interface CosDecision {
  recommendedAction: string;
  channel: CosChannel;
  messageFrame: string;
  confidence: number; // 0..1
  rationale: string[];
}

export interface CosExecutionPlan {
  state: CosDecisionState;
  shouldPrepareNow: boolean;
  shouldExecuteNow: boolean;
  requiredApproval: boolean;
  approvalReasons: string[];
  proposesAction: boolean;
  steps: string[];
  blockedBy: string[];
}

export interface CosFeedbackPlan {
  metricsToWatch: string[];
  successCriteria: string[];
  retrainingSignals: string[];
}

export interface CosReasoningOutput {
  ok: boolean;
  decisionId: string; // cos_<ts>_<rand> — the instrumentation seed for later learning
  inputSummary: string;
  analysis: CosAnalysis;
  decision: CosDecision;
  sourceRouting: CosSourceRouting;
  executionPlan: CosExecutionPlan;
  feedbackPlan: CosFeedbackPlan;
  report: string;
  error?: string;
}
