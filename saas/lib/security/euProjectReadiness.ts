// Fail closed before advertising EU data storage: an allowlist is not a deployed database.
export const EU_REGION_PREFIXES = ['eu-', 'europe-'] as const
export type RegionalProjectEvidence = {
  projectRef: string
  projectRegion: string
  verifiedAt: string
}
export function verifyEuProjectEvidence(
  evidence: RegionalProjectEvidence | null,
  primaryProjectRef: string,
): { ready: boolean; reason: string } {
  if (!evidence) return { ready: false, reason: 'eu_project_not_verified' }
  if (!/^[a-z0-9]{20}$/.test(evidence.projectRef)) return { ready: false, reason: 'eu_project_ref_invalid' }
  if (evidence.projectRef === primaryProjectRef) return { ready: false, reason: 'eu_project_is_primary' }
  if (!EU_REGION_PREFIXES.some(prefix => evidence.projectRegion.startsWith(prefix))) {
    return { ready: false, reason: 'eu_project_region_not_european' }
  }
  if (!Number.isFinite(Date.parse(evidence.verifiedAt))) return { ready: false, reason: 'eu_region_evidence_not_dated' }
  return { ready: true, reason: 'eu_project_verified_region_only' }
}
