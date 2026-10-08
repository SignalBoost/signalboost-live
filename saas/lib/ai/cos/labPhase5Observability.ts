/**
 * Phase 5 observability: privacy-minimized, advisory-only evidence events.
 * Deliberately excludes partner IDs, tenant IDs, evidence locators, reviewer keys,
 * document content, signatures, provider credentials, and free-text errors.
 * Transport and persistence are injected by the trusted host. PRIVATE events must
 * remain inside the tenant boundary; never export them to a shared log collector.
 */
import { verifyPhase5PrivateCohort, type Phase5PartnerBundle } from './labPhase5VerifiedCohort.ts'

export type Phase5EvidenceSource = 'synthetic_ci' | 'private_pilot'
export type Phase5LaunchEvent = Readonly<{
  schema: 'itmounts-phase5-launch-v1'
  occurredAt: string
  source: Phase5EvidenceSource
  deploymentRevision: string
  phase: 'cohort_verification'
  partnerCount: number
  eligibleForIndependentReview: boolean
  blockerCodes: readonly string[]
  certified: false
  productionAuthorized: false
  marketplaceAuthorized: false
}>

export type Phase5LaunchSink = (event: Phase5LaunchEvent) => void | Promise<void>

const SAFE_REVISION = /^[a-f0-9]{7,64}$/i
const SAFE_CODE = /^[a-z0-9_]+$/
const normalizeBlocker = (value: string) => {
  const code = value.replace(/^partner_\d+:/, '')
  // Never copy arbitrary externally supplied strings into telemetry.
  return SAFE_CODE.test(code) ? code : 'unknown_blocker'
}

/** Does not emit anything until the trusted host explicitly supplies a sink. */
export async function observePhase5Cohort(
  bundles: readonly Phase5PartnerBundle[],
  context: Readonly<{ source: Phase5EvidenceSource; deploymentRevision: string; now?: string }>,
  sink: Phase5LaunchSink,
) {
  if (!SAFE_REVISION.test(context.deploymentRevision)) throw new Error('phase5_exact_revision_required')
  if (context.source !== 'synthetic_ci' && context.source !== 'private_pilot') throw new Error('phase5_source_invalid')
  const decision = verifyPhase5PrivateCohort(bundles)
  const event: Phase5LaunchEvent = Object.freeze({
    schema: 'itmounts-phase5-launch-v1',
    occurredAt: context.now ?? new Date().toISOString(),
    source: context.source,
    deploymentRevision: context.deploymentRevision,
    phase: 'cohort_verification',
    partnerCount: bundles.length,
    eligibleForIndependentReview: decision.eligibleForIndependentCohortSignoff,
    blockerCodes: Object.freeze([...new Set(decision.blockers.map(normalizeBlocker))]),
    certified: false,
    productionAuthorized: false,
    marketplaceAuthorized: false,
  })
  // Export failure propagates; the caller must not report successful observation.
  await sink(event)
  return Object.freeze({ decision, event })
}

/** A missing live observation is UNKNOWN, never silently healthy. */
export function assessPhase5LaunchHealth(events: readonly Phase5LaunchEvent[], revision: string, nowMs: number, maxAgeMs = 3600000) {
  if (!SAFE_REVISION.test(revision)) throw new Error('phase5_exact_revision_required')
  if (!Number.isFinite(nowMs) || maxAgeMs <= 0) throw new Error('phase5_clock_invalid')
  const live = events.filter(e => e.source === 'private_pilot' && e.deploymentRevision === revision)
    .filter(e => Number.isFinite(Date.parse(e.occurredAt)) && Date.parse(e.occurredAt) <= nowMs)
    .sort((a,b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
  const latest = live[0]
  const ageMs = latest ? nowMs - Date.parse(latest.occurredAt) : null
  const alerts: string[] = []
  if (!latest) alerts.push('phase5_no_live_evidence')
  else {
    if (ageMs! > maxAgeMs) alerts.push('phase5_observation_stale')
    if (!latest.eligibleForIndependentReview) alerts.push('phase5_evidence_blocked')
    if (latest.partnerCount < 2 || latest.partnerCount > 3) alerts.push('phase5_partner_cohort_incomplete')
  }
  return Object.freeze({
    status: !latest ? 'unknown' as const : alerts.length ? 'attention' as const : 'observed_advisory_only' as const,
    alerts: Object.freeze(alerts),
    lastObservedAt: latest?.occurredAt ?? null,
    certified: false as const,
    productionAuthorized: false as const,
  })
}
