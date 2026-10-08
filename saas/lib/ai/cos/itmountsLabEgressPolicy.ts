// Phase 3: fail-closed decision contract for customer Lab data leaving its tenant.
// Pure policy: callers MUST invoke it at every real export/telemetry/teacher/storage boundary.
// This is not itself evidence those integration points are wired.
export type LabPrivacyTier = 'PRIVATE' | 'AGGREGATE_METRICS' | 'RESEARCH_OPT_IN'
export type LabEgressKind = 'aggregate_metrics' | 'research_dataset' | 'raw_artifact' | 'model_weights' | 'training_records' | 'provider_credentials' | 'audit_logs'
export type LabEgressAuthority = Readonly<{
  verifiedByHarness: true
  sourceOrganizationId: string
  destinationOrganizationId: string | null
  explicitResearchConsent: boolean
  rightsCleared: boolean
  aggregateOnly: boolean
}>
export function authorizeLabEgress(tier: LabPrivacyTier, kind: LabEgressKind, authority: LabEgressAuthority): boolean {
  if (!authority || authority.verifiedByHarness !== true) return false
  // Runtime input can bypass TypeScript unions; unknown privacy tiers must never grant egress.
  if (!['PRIVATE', 'AGGREGATE_METRICS', 'RESEARCH_OPT_IN'].includes(tier)) return false
  if (!authority.sourceOrganizationId || !authority.destinationOrganizationId) return false
  // This cross-tenant policy never approves raw records, weights, secrets or diagnostic logs.
  if (['raw_artifact','model_weights','training_records','provider_credentials','audit_logs'].includes(kind)) return false
  if (authority.destinationOrganizationId === authority.sourceOrganizationId) return false
  if (tier === 'PRIVATE') return false
  if (kind === 'aggregate_metrics') return authority.aggregateOnly === true
  if (kind === 'research_dataset') return tier === 'RESEARCH_OPT_IN'
    && authority.explicitResearchConsent === true && authority.rightsCleared === true
  return false
}
