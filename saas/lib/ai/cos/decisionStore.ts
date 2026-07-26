// saas/lib/ai/cos/decisionStore.ts
// The injected persistence seam for the COS decision/audit trail. The reasoning core and the
// route-boundary logger talk to THIS port, never to Supabase directly, so a Fortune-500 buyer
// drops the trail into THEIR datastore / SIEM by supplying one adapter — no engine change.
// On SignalBoost's own deployment createSupabaseDecisionLogStore() is the adapter and behaviour
// is identical to the previous direct cos_decisions calls.
import { getAdminSupabase } from '@/utils/supabase/server'
import type { CosReasoningOutput } from './reasoningTypes.ts'

export type CosDecisionStatus =
  | 'logged'    // COS produced the decision
  | 'approved'  // owner approved the prepared action
  | 'rejected'  // owner rejected it
  | 'executed'  // the action was carried out
  | 'measured'  // outcome metrics attached

export type DecisionResult = { ok: boolean; error?: string }
export type DecisionListResult = { ok: boolean; rows?: any[]; error?: string }

// A buyer implements these three methods against their own store; the COS never assumes Supabase.
export interface DecisionLogStore {
  log(output: CosReasoningOutput, userId?: string | null): Promise<DecisionResult>
  updateOutcome(decisionId: string, patch: { status?: CosDecisionStatus; outcome?: Record<string, unknown> }): Promise<DecisionResult>
  list(opts?: { limit?: number; status?: CosDecisionStatus }): Promise<DecisionListResult>
}

// ── SignalBoost's own adapter (the host implementation) ──
// The domain->column mapping lives HERE, inside the adapter, so a buyer's adapter maps to their
// own schema without the engine knowing any column names.
const TABLE = 'cos_decisions'

export function createSupabaseDecisionLogStore(): DecisionLogStore {
  return {
    async log(output: CosReasoningOutput, userId?: string | null): Promise<DecisionResult> {
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
    },

    async updateOutcome(decisionId, patch): Promise<DecisionResult> {
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
    },

    async list(opts): Promise<DecisionListResult> {
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
    },
  }
}
