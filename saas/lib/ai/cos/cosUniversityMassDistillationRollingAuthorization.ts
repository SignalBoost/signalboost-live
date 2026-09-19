// saas/lib/ai/cos/cosUniversityMassDistillationRollingAuthorization.ts
export const COS_UNIVERSITY_MASS_DISTILLATION_ROLLING_POLICY = 'owner-rolling-24h-v1' as const
export const MASS_DISTILLATION_ROLLING_WINDOW_HOURS = 24 as const
// Owner direction 2026-09-16: no rolling 24-hour spend ceiling (null). Owner direction 2026-09-19:
// work-driven topology may run multiple independent campaigns concurrently, while every campaign
// and stage keeps its existing hard spend, rights, promotion and Production-traffic fences.
export const MASS_DISTILLATION_ROLLING_MAX_AUTHORIZED_COST_USD = null
export const MASS_DISTILLATION_ROLLING_BATCHES_PER_CAMPAIGN = 1 as const
export const MASS_DISTILLATION_DYNAMIC_MAX_CONCURRENT_CAMPAIGNS = 4 as const
export const MASS_DISTILLATION_DYNAMIC_AUTHORIZATIONS_PER_TICK = 4 as const

export type MassDistillationRollingAuthorization = Readonly<{
  ok: boolean
  authorized: boolean
  reason: string
  campaignId: string | null
  batchKey: string | null
  batchCount: number
  campaignMaximumAuthorizedCostUsd: number
  activeCampaigns: number
  maxConcurrentCampaigns: number
  capacityRemaining: number
  unsettledProviderJobs: number
  rollingWindowHours: number
  rollingMaximumAuthorizedCostUsd: number | null
  rollingCeilingRemoved: boolean
  rollingAuthorizedCostUsd: number
  rollingRemainingAuthorizedCostUsd: number | null
  nextBudgetReleaseAt: string | null
  authorizationRef: string | null
  automaticPromotionAuthorized: false
  runpodMutationAuthorized: false
  authorityExpanded: false
}>

function clean(value: unknown, limit = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function money(value: unknown): number {
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 1_000_000) / 1_000_000 : 0
}

function integer(value: unknown): number {
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : 0
}

function optionalIso(value: unknown): string | null {
  const text = clean(value, 80)
  return text && Number.isFinite(Date.parse(text)) ? text : null
}

export function normalizeMassDistillationRollingAuthorization(value: unknown): MassDistillationRollingAuthorization {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const ceilingRemoved = row.rollingCeilingRemoved === true
  const maximum = ceilingRemoved ? null : money(row.rollingMaximumAuthorizedCostUsd)
  const authorized = money(row.rollingAuthorizedCostUsd)
  const remaining = ceilingRemoved ? null : money(row.rollingRemainingAuthorizedCostUsd)
  return Object.freeze({
    ok: row.ok === true,
    authorized: row.authorized === true,
    reason: clean(row.reason, 120) || 'rolling_authorization_response_invalid',
    campaignId: clean(row.campaignId, 80) || null,
    batchKey: clean(row.batchKey, 128) || null,
    batchCount: integer(row.batchCount),
    campaignMaximumAuthorizedCostUsd: money(row.campaignMaximumAuthorizedCostUsd),
    activeCampaigns: integer(row.activeCampaigns),
    maxConcurrentCampaigns: integer(row.maxConcurrentCampaigns),
    capacityRemaining: integer(row.capacityRemaining),
    unsettledProviderJobs: integer(row.unsettledProviderJobs),
    rollingWindowHours: integer(row.rollingWindowHours),
    rollingMaximumAuthorizedCostUsd: maximum,
    rollingCeilingRemoved: ceilingRemoved,
    rollingAuthorizedCostUsd: authorized,
    rollingRemainingAuthorizedCostUsd: remaining,
    nextBudgetReleaseAt: optionalIso(row.nextBudgetReleaseAt),
    authorizationRef: clean(row.authorizationRef, 500) || null,
    automaticPromotionAuthorized: false,
    runpodMutationAuthorized: false,
    authorityExpanded: false,
  })
}

/**
 * Ask the database to authorize one already-prepared batch inside the owner's durable policy.
 * The database row lock serializes only admission. Once admitted, campaigns/providers execute
 * independently and an unrelated unsettled provider job does not globally block new work.
 */
export async function authorizeNextUniversityMassDistillationCampaign(): Promise<MassDistillationRollingAuthorization> {
  const { cosServiceDb } = await import('@/lib/cos-core/storage/supabase')
  const db = cosServiceDb()
  if (!db) return normalizeMassDistillationRollingAuthorization({
    ok: false,
    authorized: false,
    reason: 'service_database_unavailable',
  })
  const result = await db.rpc('authorize_next_cos_university_mass_distillation_campaign')
  if (result.error) throw result.error
  return normalizeMassDistillationRollingAuthorization(result.data)
}

/**
 * Fill currently available campaign capacity in one control-loop tick.
 *
 * This is work-driven admission, not a fixed pipeline sequence: keep claiming independent prepared
 * work until the database reports that capacity, budget or prepared supply is exhausted. The
 * database remains the authority for the actual concurrency and spend ceilings.
 */
export async function authorizeAvailableUniversityMassDistillationCampaigns(input: {
  maxAuthorizations?: number
} = {}) {
  const limit = Math.max(1, Math.min(8, Math.floor(
    input.maxAuthorizations ?? MASS_DISTILLATION_DYNAMIC_AUTHORIZATIONS_PER_TICK,
  )))
  const authorizations: MassDistillationRollingAuthorization[] = []
  let last = normalizeMassDistillationRollingAuthorization({
    ok: true,
    authorized: false,
    reason: 'not_attempted',
  })

  for (let index = 0; index < limit; index += 1) {
    last = await authorizeNextUniversityMassDistillationCampaign()
    if (!last.ok || !last.authorized) break
    authorizations.push(last)
    if (last.capacityRemaining === 0 && last.maxConcurrentCampaigns > 0) break
  }

  return Object.freeze({
    ok: last.ok,
    authorized: authorizations.length > 0,
    authorizedCount: authorizations.length,
    authorizations: Object.freeze(authorizations),
    reason: authorizations.length > 0 ? 'dynamic_capacity_filled' : last.reason,
    terminalReason: last.reason,
    activeCampaigns: last.activeCampaigns,
    maxConcurrentCampaigns: last.maxConcurrentCampaigns,
    capacityRemaining: last.capacityRemaining,
    unsettledProviderJobs: last.unsettledProviderJobs,
    rollingMaximumAuthorizedCostUsd: last.rollingMaximumAuthorizedCostUsd,
    rollingCeilingRemoved: last.rollingCeilingRemoved,
    rollingAuthorizedCostUsd: last.rollingAuthorizedCostUsd,
    rollingRemainingAuthorizedCostUsd: last.rollingRemainingAuthorizedCostUsd,
    automaticPromotionAuthorized: false as const,
    runpodMutationAuthorized: false as const,
    authorityExpanded: false as const,
  })
}
