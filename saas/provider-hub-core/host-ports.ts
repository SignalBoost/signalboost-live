import type {
  ProviderConnectionIdentity,
  ProviderConnectionMetadata,
  ProviderConnectionPersistencePort,
} from './index.ts'

export const PROVIDER_HUB_HOST_PORTS_VERSION = 'provider-hub-host-ports-v1' as const

export interface ProviderHubActorIdentity {
  actorId: string
  tenantId: string
  environmentId: string
  roles: readonly string[]
}

export interface ProviderHubIdentityPort {
  resolveActor(input: { actorId: string; tenantId: string; environmentId: string }): Promise<ProviderHubActorIdentity | null>
  resolveConnectionOwner(identity: ProviderConnectionIdentity): Promise<{ ownerId: string } | null>
}

export interface ProviderHubVaultReference {
  vaultRef: string
  tenantId: string
  environmentId: string
  connectionId: string
  version: number
}

export interface ProviderHubVaultPort {
  storeSecret(input: {
    identity: ProviderConnectionIdentity
    secretEnvelope: unknown
  }): Promise<ProviderHubVaultReference>
  deleteSecret(reference: ProviderHubVaultReference): Promise<void>
}

export interface ProviderHubAuditEvent {
  eventId: string
  eventType: string
  actorId: string
  tenantId: string
  environmentId: string
  connectionId: string
  occurredAt: string
  evidenceRef?: string
}

export interface ProviderHubAuditPort {
  append(event: Readonly<ProviderHubAuditEvent>): Promise<void>
}

export type ProviderHubApprovalDecision = 'approved' | 'denied' | 'pending'

export interface ProviderHubApprovalPort {
  request(input: {
    actor: ProviderHubActorIdentity
    connection: ProviderConnectionIdentity
    action: string
    reason: string
  }): Promise<{ approvalId: string; decision: ProviderHubApprovalDecision }>
}

export interface ProviderHubLicensingPort {
  checkEntitlement(input: {
    tenantId: string
    environmentId: string
    capability: string
  }): Promise<{ entitled: boolean; entitlementRef?: string }>
}

export interface ProviderHubUiProjection {
  schemaVersion: typeof PROVIDER_HUB_HOST_PORTS_VERSION
  connection: ProviderConnectionMetadata
  allowedActions: readonly string[]
  notices: readonly string[]
}

export interface ProviderHubUiPort {
  project(input: {
    actor: ProviderHubActorIdentity
    connection: ProviderConnectionMetadata
    allowedActions: readonly string[]
    notices?: readonly string[]
  }): ProviderHubUiProjection
}

export interface ProviderHubHostPorts {
  identity: ProviderHubIdentityPort
  vault: ProviderHubVaultPort
  persistence: ProviderConnectionPersistencePort
  audit: ProviderHubAuditPort
  approvals: ProviderHubApprovalPort
  licensing: ProviderHubLicensingPort
  ui: ProviderHubUiPort
}
