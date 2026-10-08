// Phase 3: precondition contract for one-time human approval redemption.
// Intentionally does not execute: the Governed Socket's human-only interlock stays intact.
// A durable trusted transaction MUST atomically consume the approval before any host action.
import { createHash } from 'node:crypto'
import type { ProviderUseScope } from './labTenantProviderGrantGuard.ts'

export type ProviderApprovalBinding = Readonly<{
  approvalId: string
  organizationId: string
  permanentArtifactId: string
  providerId: string
  capability: string
  harnessRunId: string
  actionId: string
  secretReference: string
  actionDigest: string
  expiresAt: string
  approvedByHuman: boolean
  consumedAt: string | null
  revokedAt: string | null
}>
export type ProviderApprovalRequest = Readonly<{
  scope: ProviderUseScope
  harnessRunId: string
  actionId: string
  secretReference: string
  actionDigest: string
}>
const SHA256=/^[a-f0-9]{64}$/
const APPROVAL_ID=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,127}$/
/** Hash only deterministic, nonsensitive action metadata, never credential values. */
export function providerApprovalActionDigest(input: Readonly<{
  scope: ProviderUseScope
  harnessRunId: string
  actionId: string
  secretReference: string
}>): string {
  return createHash('sha256').update(JSON.stringify([
    'itmounts:phase3:provider-approval:v1',
    input.scope.organizationId,input.scope.permanentArtifactId,
    input.scope.providerId,input.scope.capability,
    input.harnessRunId,input.actionId,input.secretReference,
  ])).digest('hex')
}
export function approvalMatchesProviderAction(
  request: ProviderApprovalRequest, approval: ProviderApprovalBinding | null, now: Date,
): boolean {
  if (!approval || !request?.scope || !Number.isFinite(now.getTime())
    || !APPROVAL_ID.test(approval.approvalId)
    || approval.approvedByHuman !== true || approval.consumedAt !== null
    || approval.revokedAt !== null || !SHA256.test(request.actionDigest)
    || !SHA256.test(approval.actionDigest)) return false
  const expiry=Date.parse(approval.expiresAt)
  if (!Number.isFinite(expiry) || expiry<=now.getTime()) return false
  const s=request.scope
  return approval.organizationId===s.organizationId
    && approval.permanentArtifactId===s.permanentArtifactId
    && approval.providerId===s.providerId
    && approval.capability===s.capability
    && approval.harnessRunId===request.harnessRunId
    && approval.actionId===request.actionId
    && approval.secretReference===request.secretReference
    && approval.actionDigest===request.actionDigest
    && request.actionDigest===providerApprovalActionDigest(request)
}
