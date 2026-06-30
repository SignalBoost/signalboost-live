// saas/lib/ai/cos/decisionLog.ts
//
// INSTRUMENTATION LAYER — observes the reasoning core and persists each
// decision record. This is the seam between "COS decided X" and "X turned out
// to be good/bad", which is the labeled dataset the predictive layer needs.
//
// This module performs I/O. The reasoning core does NOT call it — logging is
// wired at the route boundary so the core stays pure and testable.
//
// tsconfig is non-strict: flat { ok, error? } results; never throws.

import { getAdminSupabase } from '@/utils/supabase/server'
import type { CosReasoningOutput } from './reasoningTypes'

const TABLE = 'cos_decisions'

export type CosDecisionStatus =
  | 'logged'    // COS produced the decision
  | 'approved'  // owner approved the prepared action
  | 'rejected'  // owner rejected it
  | 'executed'  // the action was carried out
  | 'measured'  // outcome metrics attached

// Record a fresh decision. Non-throwing; returns a flat result so callers can
// fire-and-forget without risking the user-facing response.
export async function logCosDecision(
  output: CosReasoningOutput,
  userId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = getAdminSupabase()
    const { error } = await db.from(TABLE).insert({
      decision_id:       output.decisionId,
      user_id:           userId ?? null,
      objective:         output.analysis.objective,
      channel:           output.decision.channel,
      state:             output.executionPlan.state,
      required_source:   output.sourceRouting.requiredSource,
      must_use_tool:     output.sourceRouting.mustUseTool,
      proposes_action:   output.executionPlan.proposesAction,
      required_approval: output.executionPlan.requiredApproval,
      approval_reasons:  output.executionPlan.approvalReasons,
      confidence:        output.decision.confidence,
      output:            output,
      status:            'logged',
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'logCosDecision failed' }
  }
}

// Attach the outcome later: approval, rejection, execution, or measured metrics.
// This is what turns a logged decision into a training label.
export async function updateCosDecisionOutcome(
  decisionId: string,
  patch: { status?: CosDecisionStatus; outcome?: Record<string, unknown> },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = getAdminSupabase()
    const now = new Date().toISOString()
    const update: Record<string, unknown> = { updated_at: now }
    if (patch.status) {
      update.status = patch.status
      if (patch.status === 'approved') update.approved_at = now
      if (patch.status === 'rejected') update.rejected_at = now
      if (patch.status === 'executed') update.executed_at = now
    }
    if (patch.outcome) update.outcome = patch.outcome
    const { error } = await db.from(TABLE).update(update).eq('decision_id', decisionId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'updateCosDecisionOutcome failed' }
  }
}

// Read recent decisions for the future Executive Console.
export async function listCosDecisions(
  opts?: { limit?: number; status?: CosDecisionStatus },
): Promise<{ ok: boolean; rows?: any[]; error?: string }> {
  try {
    const db = getAdminSupabase()
    let q = db
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(opts?.limit ?? 50)
    if (opts?.status) q = q.eq('status', opts.status)
    const { data, error } = await q
    if (error) return { ok: false, error: error.message }
    return { ok: true, rows: data ?? [] }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'listCosDecisions failed' }
  }
}
