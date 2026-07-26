import {
  createProviderConnectionMetadata,
  type ProviderConnectionIdentity,
  type ProviderConnectionMetadata,
} from '../../provider-hub-core/index.ts'
import {
  PROVIDER_HUB_HOST_PORTS_VERSION,
  type ProviderHubActorIdentity,
  type ProviderHubAuditEvent,
  type ProviderHubHostPorts,
  type ProviderHubUiProjection,
  type ProviderHubVaultReference,
} from '../../provider-hub-core/host-ports.ts'

export interface ReferenceDeploymentInput {
  actor: ProviderHubActorIdentity
  connection: ProviderConnectionMetadata
  entitledCapabilities?: readonly string[]
}

export interface ProviderHubReferenceDeployment {
  ports: ProviderHubHostPorts
  readonly auditEvents: readonly ProviderHubAuditEvent[]
}

function sameScope(actor: ProviderHubActorIdentity, identity: ProviderConnectionIdentity): boolean {
  return actor.tenantId === identity.tenantId && actor.environmentId === identity.environmentId
}

export function createProviderHubReferenceDeployment(
  input: ReferenceDeploymentInput,
): ProviderHubReferenceDeployment {
  const auditEvents: ProviderHubAuditEvent[] = []
  const entitled = new Set(input.entitledCapabilities ?? ['provider-hub.view'])
  let vaultVersion = 0

  const ports: ProviderHubHostPorts = {
    identity: {
      async resolveActor(candidate) {
        if (candidate.actorId !== input.actor.actorId) return null
        if (candidate.tenantId !== input.actor.tenantId) return null
        if (candidate.environmentId !== input.actor.environmentId) return null
        return input.actor
      },
      async resolveConnectionOwner(identity) {
        if (!sameScope(input.actor, identity)) return null
        if (identity.connectionId !== input.connection.connectionId) return null
        return { ownerId: input.actor.actorId }
      },
    },
    vault: {
      async storeSecret({ identity }) {
        if (!sameScope(input.actor, identity)) throw new Error('scope mismatch')
        vaultVersion += 1
        return Object.freeze({
          vaultRef: `reference-vault://${identity.tenantId}/${identity.connectionId}/${vaultVersion}`,
          tenantId: identity.tenantId,
          environmentId: identity.environmentId,
          connectionId: identity.connectionId,
          version: vaultVersion,
        }) satisfies ProviderHubVaultReference
      },
      async deleteSecret(reference) {
        if (reference.tenantId !== input.actor.tenantId) throw new Error('scope mismatch')
      },
    },
    persistence: {
      async getConnection(identity) {
        if (!sameScope(input.actor, identity)) return null
        if (identity.connectionId !== input.connection.connectionId) return null
        if (identity.providerId !== input.connection.providerId) return null
        return input.connection
      },
    },
    audit: {
      async append(event) {
        if (event.tenantId !== input.actor.tenantId) throw new Error('scope mismatch')
        auditEvents.push(Object.freeze({ ...event }))
      },
    },
    approvals: {
      async request() {
        return { approvalId: 'reference-approval-pending', decision: 'pending' }
      },
    },
    licensing: {
      async checkEntitlement({ tenantId, environmentId, capability }) {
        const scoped = tenantId === input.actor.tenantId && environmentId === input.actor.environmentId
        return scoped && entitled.has(capability)
          ? { entitled: true, entitlementRef: `reference-license://${tenantId}/${capability}` }
          : { entitled: false }
      },
    },
    ui: {
      project({ actor, connection, allowedActions, notices = [] }): ProviderHubUiProjection {
        if (!sameScope(actor, connection)) throw new Error('scope mismatch')
        return Object.freeze({
          schemaVersion: PROVIDER_HUB_HOST_PORTS_VERSION,
          connection,
          allowedActions: Object.freeze([...allowedActions]),
          notices: Object.freeze([...notices]),
        })
      },
    },
  }

  return Object.freeze({
    ports,
    get auditEvents() { return Object.freeze([...auditEvents]) },
  })
}

export function createReferenceConnection(): ProviderConnectionMetadata {
  return createProviderConnectionMetadata({
    tenantId: 'reference-tenant',
    environmentId: 'sandbox',
    connectionId: 'reference-connection',
    providerId: 'reference-provider',
    state: 'configured',
    authentication: {
      method: 'api_key',
      configured: true,
      maskedFields: { accountField: 'saved' },
    },
    updatedAt: '2026-07-26T00:00:00.000Z',
  })
}
