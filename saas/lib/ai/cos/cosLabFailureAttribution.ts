/** Fail closed: provider stage alone cannot establish fault or financial liability. */
export type LabFailureAttribution = 'UNATTRIBUTED' | 'COMPETENCY_FAILURE' | 'CUSTOMER_INFRA_FAILURE' | 'PLATFORM_FAILURE'
export type LabFailureVerification = Readonly<{
  verdict: Exclude<LabFailureAttribution, 'UNATTRIBUTED'>
  verifierId: string
  evidenceRef: string
  evidenceHash: string
  independentlyVerified: boolean
}>

const SHA256 = /^[a-f0-9]{64}$/i

/** Pure decision; caller must independently authenticate verifier authority and evidence binding. */
export function resolveLabFailureAttribution(input: {
  providerStage: string
  verification?: LabFailureVerification | null
}): LabFailureAttribution {
  if (input.providerStage === 'COMPLETED') return 'UNATTRIBUTED' // A completed provider job can still fail evaluation.
  const v = input.verification
  if (!v || v.independentlyVerified !== true || !v.verifierId.trim() || !v.evidenceRef.trim() || !SHA256.test(v.evidenceHash)) return 'UNATTRIBUTED'
  if (!['COMPETENCY_FAILURE', 'CUSTOMER_INFRA_FAILURE', 'PLATFORM_FAILURE'].includes(v.verdict)) return 'UNATTRIBUTED'
  return v.verdict
}
