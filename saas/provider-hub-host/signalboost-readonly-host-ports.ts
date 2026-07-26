import {
  createProviderConnectionMetadata,
  type ProviderConnectionIdentity,
} from '../provider-hub-core/index.ts'
import {
  PROVIDER_HUB_HOST_PORTS_VERSION,
  type ProviderHubActorIdentity,
  type ProviderHubApprovalPort,
  type ProviderHubAuditEvent,
  type ProviderHubAuditPort,
  type ProviderHubHostPorts,
  type ProviderHubIdentityPort,
  type ProviderHubLicensingPort,
  type ProviderHubUiPort,
  type ProviderHubVaultPort,
  type ProviderHubVaultReference,
} from '../provider-hub-core/host-ports.ts'

export const SIGNALBOOST_READONLY_HOST_PORTS_VERSION = 'signalboost-readonly-host-ports-v1' as const

type SignalBoostScope = Readonly<{ tenantId: string; environmentId: string }>

export interface SignalBoostReadonlyHostPortDependencies {
  tenantId: string
  environmentId: string
  resolveActor(input: { actorId: string; tenantId: string; environmentId: string }): Promise<ProviderHubActorIdentity | null>
  resolveConnectionOwner(identity: ProviderConnectionIdentity): Promise<{ ownerId: string } | null>
  appendAudit(event: Readonly<ProviderHubAuditEvent>): Promise<void>
  checkEntitlement(input: { tenantId: string; environmentId: string; capability: string }): Promise<{ entitled: boolean; entitlementRef?: string }>
}

function required(value: unknown, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`SignalBoost provider hub ${field} is required`)
  return normalized
}

function assertScope(input: { tenantId: string; environmentId: string }, scope: SignalBoostScope): void {
  if (input.tenantId !== scope.tenantId || input.environmentId !== scope.environmentId) {
    throw new Error('SignalBoost provider hub scope mismatch')
  }
}

function createIdentityPort(dependencies: SignalBoostReadonlyHostPortDependencies, scope: SignalBoostScope): ProviderHubIdentityPort {
  const port: ProviderHubIdentityPort = {
    async resolveActor(input: { actorId: string; tenantId: string; environmentId: string }) {
      assertScope(input, scope)
      const actor = await dependencies.resolveActor(input)
      if (!actor) return null
      assertScope(actor, scope)
      if (actor.actorId !== input.actorId) throw new Error('SignalBoost provider hub actor mismatch')
      return Object.freeze({
        actorId: required(actor.actorId, 'actorId'),
        tenantId: scope.tenantId,
        environmentId: scope.environmentId,
        roles: Object.freeze([...actor.roles].map(role => required(role, 'role')).sort()),
      })
    },
    async resolveConnectionOwner(identity: ProviderConnectionIdentity) {
      assertScope(identity, scope)
      const owner = await dependencies.resolveConnectionOwner(identity)
      return owner ? Object.freeze({ ownerId: required(owner.ownerId, 'ownerId') }) : null
    },
  }
  return Object.freeze(port)
}

function createVaultPort(): ProviderHubVaultPort {
  const port: ProviderHubVaultPort = {
    async storeSecret(_input): Promise<ProviderHubVaultReference> {
      throw new Error('SignalBoost Provider Hub secret mutation is disabled')
    },
    async deleteSecret(_reference): Promise<void> {
      throw new Error('SignalBoost Provider Hub secret mutation is disabled')
    },
  }
  return Object.freeze(port)
}

function createAuditPort(dependencies: SignalBoostReadonlyHostPortDependencies, scope: SignalBoostScope): ProviderHubAuditPort {
  const port: ProviderHubAuditPort = {
    async append(event: Readonly<ProviderHubAuditEvent>) {
      assertScope(event, scope)
      await dependencies.appendAudit(Object.freeze({
        eventId: required(event.eventId, 'eventId'),
        eventType: required(event.eventType, 'eventType'),
        actorId: required(event.actorId, 'actorId'),
        tenantId: scope.tenantId,
        environmentId: scope.environmentId,
        connectionId: required(event.connectionId, 'connectionId'),
        occurredAt: required(event.occurredAt, 'occurredAt'),
        ...(event.evidenceRef ? { evidenceRef: required(event.evidenceRef, 'evidenceRef') } : {}),
      }))
    },
  }
  return Object.freeze(port)
}

function createApprovalPort(scope: SignalBoostScope): ProviderHubApprovalPort {
  const port: ProviderHubApprovalPort = {
    async request(input) {
      assertScope(input.actor, scope)
      assertScope(input.connection, scope)
      const action = required(input.action, 'approval action')
      const approvalId = `pending:${scope.tenantId}:${scope.environmentId}:${input.connection.connectionId}:${action}`
      return Object.freeze({ approvalId, decision: 'pending' as const })
    },
  }
  return Object.freeze(port)
}

function createLicensingPort(dependencies: SignalBoostReadonlyHostPortDependencies, scope: SignalBoostScope): ProviderHubLicensingPort {
  const port: ProviderHubLicensingPort = {
    async checkEntitlement(input) {
      assertScope(input, scope)
      const capability = required(input.capability, 'capability')
      const result = await dependencies.checkEntitlement({ ...input, capability })
      return Object.freeze({
        entitled: Boolean(result.entitled),
        ...(result.entitlementRef ? { entitlementRef: required(result.entitlementRef, 'entitlementRef') } : {}),
      })
    },
  }
  return Object.freeze(port)
}

function createUiPort(scope: SignalBoostScope): ProviderHubUiPort {
  const port: ProviderHubUiPort = {
    project(input) {
      assertScope(input.actor, scope)
      assertScope(input.connection, scope)
      const allowedActions = Object.freeze([...new Set(input.allowedActions.map(action => required(action, 'allowed action')))].sort())
      const notices = Object.freeze([...(input.notices ?? [])].map(notice => required(notice, 'notice')).sort())
      const connection = createProviderConnectionMetadata({
        tenantId: input.connection.tenantId,
        environmentId: input.connection.environmentId,
        connectionId: input.connection.connectionId,
        providerId: input.connection.providerId,
        state: input.connection.state,
        authentication: {
          method: input.connection.authentication.method,
          configured: input.connection.authentication.configured,
          maskedFields: { ...input.connection.authentication.maskedFields },
        },
        updatedAt: input.connection.updatedAt,
      })
      return Object.freeze({
        schemaVersion: PROVIDER_HUB_HOST_PORTS_VERSION,
        connection,
        allowedActions,
        notices,
      })
    },
  }
  return Object.freeze(port)
}

export function createSignalBoostReadonlyHostPorts(dependencies: SignalBoostReadonlyHostPortDependencies): ProviderHubHostPorts {
  const scope: SignalBoostScope = Object.freeze({
    tenantId: required(dependencies.tenantId, 'tenantId'),
    environmentId: required(dependencies.environmentId, 'environmentId'),
  })

  const ports: ProviderHubHostPorts = {
    identity: createIdentityPort(dependencies, scope),
    vault: createVaultPort(),
    persistence: Object.freeze({ async getConnection(_identity: ProviderConnectionIdentity) { return null } }),
    audit: createAuditPort(dependencies, scope),
    approvals: createApprovalPort(scope),
    licensing: createLicensingPort(dependencies, scope),
    ui: createUiPort(scope),
  }
  return Object.freeze(ports)
}
