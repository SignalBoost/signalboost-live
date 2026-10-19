import { BuilderBudgetError, type BuilderInferenceBudgetStore, type InferenceQuote } from './inference-budget.ts'
import { readBuilderRunLimits } from './inference-budget.ts'

type BudgetDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: { message: string } | null }> }
function failure(error: { message: string } | null): void {
  if (!error) return
  const code = /builder_budget_[a-z_]+/.exec(error.message)?.[0] || 'builder_budget_storage_unavailable'
  throw new BuilderBudgetError(code)
}

export async function readBuilderInferenceBudgetReceipt(db: any, job: { id: string; userId: string; objective: string; createdAt: string }) {
  const limits = readBuilderRunLimits(job.objective)
  if (!limits) return null
  const { data, error } = await db.from('builder_inference_budgets')
    .select('cap_nanos,reserved_nanos,accounted_nanos,deadline_at,call_count,blocked')
    .eq('job_id', job.id).eq('user_id', job.userId).maybeSingle()
  failure(error)
  const { data: calls, error: usageError } = await db.from('builder_inference_reservations')
    .select('reported_nanos').eq('job_id', job.id)
  failure(usageError)
  const reportsComplete = Array.isArray(calls) && calls.every((r: any) => r.reported_nanos !== null)
  return {
    maxInferenceUsd: limits.maxCostNanodollars / 1e9,
    accountedInferenceUsd: Number(data?.accounted_nanos ?? 0) / 1e9,
    pendingReservationUsd: Number(data?.reserved_nanos ?? 0) / 1e9,
    providerReportedEstimateUsd: reportsComplete ? calls.reduce((sum: number, r: any) => sum + Number(r.reported_nanos), 0) / 1e9 : null,
    modelCallCount: Number(data?.call_count ?? 0),
    modelCallCountBasis: 'durable_dispatch_reservations',
    elapsedMs: Math.max(0, Date.now() - Date.parse(job.createdAt)),
    deadlineAt: data?.deadline_at || new Date(Date.parse(job.createdAt) + limits.maxElapsedMs).toISOString(),
    priceCeilingBreached: data?.blocked === true,
    costBasis: 'published_token_rates_and_durable_reservations',
  }
}
export function builderInferenceBudgetSummary(receipt: Awaited<ReturnType<typeof readBuilderInferenceBudgetReceipt>>): string {
  return receipt
    ? `\n\nInference budget: $${receipt.maxInferenceUsd}; accounted $${receipt.accountedInferenceUsd}; pending reservations $${receipt.pendingReservationUsd}; reserved model calls ${receipt.modelCallCount}.`
    : ''
}
export function createBuilderInferenceBudgetStore(db: BudgetDb, job: { id: string; userId: string; claimGeneration: number }): BuilderInferenceBudgetStore {
  return {
    async reserve(callId: string, quote: InferenceQuote) {
      const { data, error } = await db.rpc('reserve_builder_inference', {
        p_job_id: job.id, p_user_id: job.userId, p_generation: job.claimGeneration,
        p_call_id: callId, p_upper_nanos: quote.upperNanodollars, p_quote: quote,
      })
      failure(error)
      if (data?.reserved !== true) throw new BuilderBudgetError(
        ['builder_budget_exhausted','builder_budget_time_exhausted'].includes(data?.reason) ? data.reason : 'builder_budget_reservation_unconfirmed')
    },
    async settle(callId, accounted, reported) {
      const { data, error } = await db.rpc('settle_builder_inference', {
        p_job_id: job.id, p_user_id: job.userId, p_call_id: callId,
        p_accounted_nanos: accounted, p_reported_nanos: reported,
      })
      failure(error)
      if (!data || data.blocked !== false) throw new BuilderBudgetError('builder_budget_provider_ceiling_breached')
    },
  }
}
