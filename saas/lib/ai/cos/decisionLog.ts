// saas/lib/ai/cos/decisionLog.ts
//
// INSTRUMENTATION LAYER — observes the reasoning core and persists each decision record via an
// INJECTED store (see decisionStore.ts). The reasoning core does NOT call it — logging is wired
// at the route boundary so the core stays pure and testable.
//
// Every function accepts an optional DecisionLogStore; it defaults to SignalBoost's Supabase
// adapter, so existing callers are unchanged. A buyer passes their own store (or swaps the
// default) and the COS trail lands in their datastore/SIEM with no change to this module.
//
// tsconfig is non-strict: flat { ok, error? } results; never throws.
import type { CosReasoningOutput } from './reasoningTypes'
import { createSupabaseDecisionLogStore, type CosDecisionStatus, type DecisionLogStore } from './decisionStore'

export type { CosDecisionStatus } from './decisionStore'

const defaultStore = createSupabaseDecisionLogStore()

export async function logCosDecision(
  output: CosReasoningOutput,
  userId?: string | null,
  store: DecisionLogStore = defaultStore,
): Promise<{ ok: boolean; error?: string }> {
  return store.log(output, userId)
}

export async function updateCosDecisionOutcome(
  decisionId: string,
  patch: { status?: CosDecisionStatus; outcome?: Record<string, unknown> },
  store: DecisionLogStore = defaultStore,
): Promise<{ ok: boolean; error?: string }> {
  return store.updateOutcome(decisionId, patch)
}

export async function listCosDecisions(
  opts?: { limit?: number; status?: CosDecisionStatus },
  store: DecisionLogStore = defaultStore,
): Promise<{ ok: boolean; rows?: any[]; error?: string }> {
  return store.list(opts)
}
