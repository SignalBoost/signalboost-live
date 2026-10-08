// Phase 3: mandatory host boundary for cross-tenant Lab data egress.
// The trusted host MUST resolve tenant privacy, consent, and data rights from server-owned records,
// not from the request or model output. The authorized payload is delivered only after policy checks.
import { authorizeLabEgress, type LabPrivacyTier, type LabEgressKind, type LabEgressAuthority } from './itmountsLabEgressPolicy.ts'

export type LabEgressRequest = Readonly<{
  sourceOrganizationId: string
  destinationOrganizationId: string
  experimentId: string
  kind: LabEgressKind
}>
export type TrustedLabEgressDecision = Readonly<{
  experimentId: string
  tier: LabPrivacyTier
  authority: LabEgressAuthority
}>
export type LabEgressHost = {
  readTrustedDecision(request: LabEgressRequest): Promise<TrustedLabEgressDecision | null>
  deliver(request: LabEgressRequest): Promise<{ receiptId: string }>
}
export async function executeLabEgress(request: LabEgressRequest, host: LabEgressHost): Promise<{ receiptId: string }> {
  if (!request || !request.experimentId || !request.sourceOrganizationId
    || !request.destinationOrganizationId || request.sourceOrganizationId === request.destinationOrganizationId) {
    throw new Error('lab_egress_denied')
  }
  // Snapshot and freeze the approved request: host callbacks must not be able to retarget delivery.
  const scopedRequest: LabEgressRequest = Object.freeze({
    sourceOrganizationId: request.sourceOrganizationId,
    destinationOrganizationId: request.destinationOrganizationId,
    experimentId: request.experimentId,
    kind: request.kind,
  })
  let decision: TrustedLabEgressDecision | null
  try { decision = await host.readTrustedDecision(scopedRequest) }
  catch { throw new Error('lab_egress_authority_unavailable') }
  if (!decision || decision.experimentId !== scopedRequest.experimentId
    || decision.authority.sourceOrganizationId !== scopedRequest.sourceOrganizationId
    || decision.authority.destinationOrganizationId !== scopedRequest.destinationOrganizationId
    || !authorizeLabEgress(decision.tier, scopedRequest.kind, decision.authority)) {
    throw new Error('lab_egress_denied')
  }
  try {
    const result = await host.deliver(scopedRequest)
    if (!result?.receiptId?.trim()) throw new Error('lab_egress_receipt_missing')
    return { receiptId: result.receiptId }
  } catch { throw new Error('lab_egress_delivery_failed') }
}
