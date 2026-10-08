// saas/lib/ai/cos/itmountsLabExperimentStationScope.ts
//
// What a University factory station may work on in this tick.
//
// Owner 2026-10-07: the always-on line is paused; testing uses deliberate experiments run the way a user runs them.
// - Line running (or the pause store unreadable, unchanged behaviour): the station runs its normal scheduled work.
// - Line paused and no live experiment grant: the station does nothing, exactly as before.
// - Line paused and one or more live experiment grants: the station works ONLY on those experiments' candidates.
//
// A grant is never taken from the request. It is a row in lab.experiment_execution_grants, written only by
// lab.start_experiment_university_run, which the authenticated Lab route calls inside a customer HarnessRun
// (platform-harness/adapters/lab-customer.ts). Each grant is checked here by decideUniversityStationExecution
// (identity shape, capability, non-expansion, expiry) before its candidate enters the scope.
import { decideUniversityStationExecution, type ExperimentExecutionAuthority } from './itmountsLabExperimentPausePolicy.ts'
import { readLinePauseSetting } from './cosUniversitySettings.ts'

export type ExperimentGrant = Readonly<{
  grantId: string
  organizationId: string
  experimentId: string
  universityRunId: string
  harnessRunId: string
  expiresAt: string
  candidateId: string
  campaignId: string
}>

export type UniversityStationScope =
  | Readonly<{ run: 'line' }>
  | Readonly<{ run: 'paused'; reason: 'no_live_experiment' | 'experiment_grants_unreadable'; denied: readonly Readonly<{ grantId: string; reason: string }>[] }>
  | Readonly<{
    run: 'experiment'
    candidateIds: readonly string[]
    campaignIds: readonly string[]
    grants: readonly ExperimentGrant[]
    denied: readonly Readonly<{ grantId: string; reason: string }>[]
  }>

type ScopeDb = {
  from: (table: string) => any
  rpc: (name: string, args?: Record<string, unknown>) => any
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HARNESS_RUN = /^lab-customer-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CANDIDATE = /^mass:[^,]{1,230}$/

const text = (value: unknown) => String(value ?? '').trim()

/** Decide which grants may drive the paused factory now. Pure: the database read is separate. */
export function scopeFromGrants(rows: readonly Record<string, unknown>[], now: Date): Extract<UniversityStationScope, { run: 'experiment' }> | Extract<UniversityStationScope, { run: 'paused' }> {
  const grants: ExperimentGrant[] = []
  const denied: Array<{ grantId: string; reason: string }> = []
  for (const row of rows) {
    const grant: ExperimentGrant = Object.freeze({
      grantId: text(row.grant_id),
      organizationId: text(row.organization_id),
      experimentId: text(row.experiment_id),
      universityRunId: text(row.university_run_id),
      harnessRunId: text(row.harness_run_id),
      expiresAt: text(row.expires_at),
      candidateId: text(row.candidate_id),
      campaignId: text(row.campaign_id),
    })
    if (row.capability !== 'university.distillation.execute' || row.authority_expanded !== false
      || !HARNESS_RUN.test(grant.harnessRunId) || !CANDIDATE.test(grant.candidateId) || !UUID.test(grant.campaignId)) {
      denied.push({ grantId: grant.grantId, reason: 'experiment_grant_malformed' })
      continue
    }
    const authority: ExperimentExecutionAuthority = Object.freeze({
      verifiedByHarness: true as const,
      organizationId: grant.organizationId,
      experimentId: grant.experimentId,
      universityRunId: grant.universityRunId,
      expiresAt: grant.expiresAt,
      capability: 'university.distillation.execute' as const,
      authorityExpanded: false as const,
    })
    const decision = decideUniversityStationExecution({
      paused: true,
      pauseKnown: true,
      invocation: 'explicit_experiment',
      authority,
      organizationId: grant.organizationId,
      experimentId: grant.experimentId,
      universityRunId: grant.universityRunId,
      now,
    })
    if (!decision.allowed) {
      denied.push({ grantId: grant.grantId, reason: decision.reason })
      continue
    }
    grants.push(grant)
  }
  if (!grants.length) return Object.freeze({ run: 'paused' as const, reason: 'no_live_experiment' as const, denied: Object.freeze(denied) })
  return Object.freeze({
    run: 'experiment' as const,
    candidateIds: Object.freeze([...new Set(grants.map(grant => grant.candidateId))]),
    campaignIds: Object.freeze([...new Set(grants.map(grant => grant.campaignId))]),
    grants: Object.freeze(grants),
    denied: Object.freeze(denied),
  })
}

export async function resolveUniversityStationScope(input: { db: ScopeDb | null | undefined; now?: Date }): Promise<UniversityStationScope> {
  const pause = await readLinePauseSetting(input.db as any)
  if (!pause.paused) return Object.freeze({ run: 'line' as const })
  if (!input.db) return Object.freeze({ run: 'paused' as const, reason: 'experiment_grants_unreadable' as const, denied: Object.freeze([]) })
  try {
    const { data, error } = await input.db.rpc('itmounts_lab_active_experiment_execution_grants')
    if (error) throw error
    return scopeFromGrants(Array.isArray(data) ? data : [], input.now || new Date())
  } catch {
    // Fail closed: an unreadable grant store never widens the paused factory.
    return Object.freeze({ run: 'paused' as const, reason: 'experiment_grants_unreadable' as const, denied: Object.freeze([]) })
  }
}

/** Short tag for station responses and production-path evidence, so a log shows which experiment a tick served. */
export function experimentScopeEvidence(scope: UniversityStationScope) {
  if (scope.run !== 'experiment') return null
  return Object.freeze({
    experiments: scope.grants.map(grant => grant.experimentId),
    candidateIds: scope.candidateIds,
    deniedGrants: scope.denied.length,
  })
}
