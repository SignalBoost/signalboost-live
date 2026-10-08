// Phase 3 BYOI controlled handoff. The host fetches the grant by verified tenant scope.
// Resolve the secret only after the complete organization/provider/artifact/capability check.
// No customer code executes in this boundary, and no credentials appear in its result.
import { assertCustomerProviderScope, type ScopedProviderGrant, type ScopedProviderRequest } from './itmountsLabByoiScope.ts'

export type LabByoiHost = {
  loadGrant(request: ScopedProviderRequest): Promise<ScopedProviderGrant | null>
  resolveSecret(reference: string): Promise<string>
  invokeProvider(input: { request: ScopedProviderRequest; credential: string }): Promise<{ receiptId: string }>
}
export async function executeLabByoi(request: ScopedProviderRequest, host: LabByoiHost): Promise<{ receiptId: string }> {
  if (!request || !request.organizationId || !request.providerId || !request.artifactId ||
      !['teacher.invoke','compute.execute','tool.invoke'].includes(request.capability) ||
      !Number.isSafeInteger(request.nowMs)) throw new Error('lab_byoi_scope_denied')
  const scopedRequest: ScopedProviderRequest = Object.freeze({
    organizationId: request.organizationId,
    providerId: request.providerId,
    capability: request.capability,
    artifactId: request.artifactId,
    nowMs: request.nowMs,
  })
  const grant = await host.loadGrant(scopedRequest)
  if (!grant) throw new Error('lab_byoi_scope_denied')
  const reference = assertCustomerProviderScope(grant, scopedRequest)
  const credential = await host.resolveSecret(reference)
  if (!credential) throw new Error('lab_byoi_credential_unavailable')
  const result = await host.invokeProvider({ request: scopedRequest, credential })
  if (!result || typeof result.receiptId !== 'string' || !result.receiptId.trim()) {
    throw new Error('lab_byoi_receipt_missing')
  }
  return { receiptId: result.receiptId }
}
