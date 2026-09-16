export const COS_UNIVERSITY_MASS_DISTILLATION_ROLLING_POLICY = 'owner-rolling-24h-v1' as const
export const MASS_DISTILLATION_ROLLING_WINDOW_HOURS = 24 as const
export const MASS_DISTILLATION_ROLLING_MAX_AUTHORIZED_COST_USD = 25 as const
export const MASS_DISTILLATION_ROLLING_BATCHES_PER_CAMPAIGN = 1 as const

export type MassDistillationRollingAuthorization = Readonly<{
  ok: boolean
  authorized: boolean
  reason: string
  campaignId: string | null
  batchKey: string | null
  batchCount: number
  campaignMaximumAuthorizedCostUsd: number
  rollingWindowHours: number
  rollingMaximumAuthorizedCostUsd: number
  rollingAuthorizedCostUsd: number
  rollingRemainingAuthorizedCostUsd: number
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
  const maximum = money(row.rollingMaximumAuthorizedCostUsd)
  const authorized = money(row.rollingAuthorizedCostUsd)
  const remaining = money(row.rollingRemainingAuthorizedCostUsd)
  return Object.freeze({
    ok: row.ok === true,
    authorized: row.authorized === true,
    reason: clean(row.reason, 120) || 'rolling_authorization_response_invalid',
    campaignId: clean(row.campaignId, 80) || null,
    batchKey: clean(row.batchKey, 128) || null,
    batchCount: integer(row.batchCount),
    campaignMaximumAuthorizedCostUsd: money(row.campaignMaximumAuthorizedCostUsd),
    rollingWindowHours: integer(row.rollingWindowHours),
    rollingMaximumAuthorizedCostUsd: maximum,
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
 * Ask the database to authorize at most one already-prepared batch inside the owner's durable
 * rolling policy. The database row lock, 24-hour maximum-authority sum, existing per-stage reserve
 * RPCs, and one-active-campaign fence remain the source of truth; this caller cannot widen them.
 */
export async function authorizeNextUniversityMassDistillationCampaign(): Promise<MassDistillationRollingAuthorization> {
  // Delay the server-store import so the pure response contract remains independently testable.
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
