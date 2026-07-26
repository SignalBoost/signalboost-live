import type {
  ProviderConnectionIdentity,
  ProviderConnectionMetadata,
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
} from '../provider-hub-core/host-ports.ts'

export const SIGNALBOOST_READONLY_HOST_PORTS_VERSION = 'signalboost-readonly-host-ports-v1' as const

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

function assertScope(input: { tenantId: string; environmentId: string }, scope: { tenantId: string; environmentId: string }): void {
  if (input.tenantId !== scope.tenantId || input.environmentId !== scope.environmentId) {
    throw new Error('SignalBoost provider hub scope mismatch')
  }
}

function createIdentityPort(dependencies: SignalBoostReadonlyHostPortDependencies, scope: { tenantId: string; environmentId: string }): ProviderHubIdentityPort {
  return Object.freeze({
    async resolveActor(input) {
      assertScope(input, scope)
      const actor = await dependencies.resolveActor(input)
      if (!actor) return null
      assertScope(actor, scope)
      return Object.freeze({ ...actor, roles: Object.freeze([...actor.roles]) })
    },
    async resolveConnectionOwner(identity) {
      assertScope(identity, scope)
      const owner = await dependencies.resolveConnectionOwner(identity)
      return owner ? Object.freeze({ ownerId: required(owner.ownerId, 'ownerId') }) : null
    },
  })
}

function createVaultPort(): ProviderHubVaultPort {
  const disabled = async (): Promise<never> => {
    throw new Error('SignalBoost Provider Hub secret mutation is disabled')
  }
  return Object.freeze({ storeSecret: disabled, deleteSecret: disabled })
}

function createAuditPort(dependencies: SignalBoostReadonlyHostPortDependencies, scope: { tenantId: string; environmentId: string }): ProviderHubAuditPort {
  return Object.freeze({
    async append(event) {
      assertScope(event, scope)
      await dependencies.appendAudit(Object.freeze({ ...event }))
    },
  })
}

function createApprovalPort(scope: { tenantId: string; environmentId: string }): ProviderHubApprovalPort {
  return Object.freeze({
    async request(input) {
      assertScope(input.actor, scope)
      assertScope(input.connection, scope)
      const action = required(input.action, 'approval action')
      const approvalId = `pending:${scope.tenantId}:${scope.environmentId}:${input.connection.connectionId}:${action}`
      return Object.freeze({ approvalId, decision: 'pending' as const })
    },
  })
}

function createLicensingPort(dependencies: SignalBoostReadonlyHostPortDependencies, scope: { tenantId: string; environmentId: string }): ProviderHubLicensingPort {
  return Object.freeze({
    async checkEntitlement(input) {
      assertScope(input, scope)
      const capability = required(input.capability, 'capability')
      const result = await dependencies.checkEntitlement({ ...input, capability })
      return Object.freeze({ ...result })
    },
  })
}

function createUiPort(scope: { tenantId: string; environmentId: string }): ProviderHubUiPort {
  return Object.freeze({
    project(input) {
      assertScope(input.actor, scope)
      assertScope(input.connection, scope)
      const allowedActions = Object.freeze([...new Set(input.allowedActions.map(action => required(action, 'allowed action')))].sort())
      const notices = Object.freeze([...(input.notices ?? [])].map(notice => required(notice, 'notice')).sort())
      const connection: ProviderConnectionMetadata = Object.freeze({
        ...input.connection,
        authentication: Object.freeze({
          ...input.connection.authentication,
          maskedFields: Object.freeze({ ...input.connection.authentication.maskedFields }),
        }),
      })
      return Object.freeze({
        schemaVersion: PROVIDER_HUB_HOST_PORTS_VERSION,
        connection,
        allowedActions,
        notices,
      })
    },
  })
}

export function createSignalBoostReadonlyHostPorts(dependencies: SignalBoostReadonlyHostPortDependencies): ProviderHubHostPorts {
  const scope = Object.freeze({
    tenantId: required(dependencies.tenantId, 'tenantId'),
    environmentId: required(dependencies.environmentId, 'environmentId'),
  })

  return Object.freeze({
    identity: createIdentityPort(dependencies, scope),
    vault: createVaultPort(),
    persistence: Object.freeze({ async getConnection() { return null } }),
    audit: createAuditPort(dependencies, scope),
    approvals: createApprovalPort(scope),
    licensing: createLicensingPort(dependencies, scope),
    ui: createUiPort(scope),
  })
}
