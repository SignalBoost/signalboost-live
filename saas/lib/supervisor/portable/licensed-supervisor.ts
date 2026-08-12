// saas/lib/supervisor/portable/licensed-supervisor.ts
//
// The only buyer-facing factory for paid Self-Healing Supervisor paths. It
// refuses incomplete licence or execution configuration, constructs the
// entitlement gate once, and guards both planning and dispatch at execution.

import type { Thinker } from '../execution-contracts.ts'
import type { DispatchAuditSink } from '../executors/executor-types.ts'
import type { DispatchStore } from '../executors/dispatch-store.ts'
import type { ApiStepRunner } from '../executors/api-executor.ts'
import type { ApiCapabilityRegistry } from '../executors/api-capability-registry.ts'
import type { ApprovalContinuationVerifier } from '../executors/approval-continuation.ts'
import { createSupervisorDispatcher } from '../executors/create-supervisor-dispatcher.ts'
import type { HostContext } from './host-context.ts'
import { createConnectorAwareThinker } from './connector-aware-thinker.ts'
import {
  createEntitlementGate,
  guardWithEntitlement,
  type EntitlementGate,
  type EntitlementRefusal,
} from '../../../portable-license/index.ts'

export const SELF_HEALING_PRODUCT_ID = 'self-healing-supervisor'

export interface SelfHealingLicenseConfig {
  token: string
  issuer: string
  publicKeysPem: string[]
  productId?: string
}

export interface CreateLicensedSelfHealingSupervisorOptions<TThinker extends Thinker> {
  host: HostContext
  license: SelfHealingLicenseConfig
  audit: DispatchAuditSink
  dispatchStore: DispatchStore
  apiRunner: ApiStepRunner
  apiCapabilities: ApiCapabilityRegistry
  approvalVerifier: ApprovalContinuationVerifier
  thinker: TThinker
  /**
   * Enables deterministic buyer-tool evidence gathering before COS/Supervisor reasoning.
   * The buyer tenant id never leaves the buyer-hosted connector boundary.
   */
  connectorTenantId?: string
  onEntitlementRefusal?: (event: EntitlementRefusal) => void
}

export interface LicensedSelfHealingSupervisor<TThinker extends Thinker> {
  thinker: TThinker
  dispatcher: ReturnType<typeof createSupervisorDispatcher>
  entitlement: EntitlementGate
}

function required(value: unknown, name: string): void {
  if (value == null || (typeof value === 'string' && value.trim() === '')) throw new Error(`createLicensedSelfHealingSupervisor: ${name} is required`)
}

export function createLicensedSelfHealingSupervisor<TThinker extends Thinker>(
  options: CreateLicensedSelfHealingSupervisorOptions<TThinker>,
): LicensedSelfHealingSupervisor<TThinker> {
  required(options?.host, 'host')
  required(options?.audit, 'audit')
  required(options?.dispatchStore, 'dispatchStore')
  required(options?.apiRunner, 'apiRunner')
  required(options?.apiCapabilities, 'apiCapabilities')
  required(options?.approvalVerifier, 'approvalVerifier')
  required(options?.thinker, 'thinker')
  required(options?.license, 'license')
  required(options.license.token, 'license.token')
  required(options.license.issuer, 'license.issuer')
  if (!Array.isArray(options.license.publicKeysPem) || options.license.publicKeysPem.length === 0 || options.license.publicKeysPem.some(key => !key.trim())) {
    throw new Error('createLicensedSelfHealingSupervisor: license.publicKeysPem requires at least one public key')
  }
  if (options.connectorTenantId && !options.host.connectors) {
    throw new Error('createLicensedSelfHealingSupervisor: host.connectors is required when connectorTenantId is configured')
  }

  const entitlement = createEntitlementGate({
    productId: options.license.productId ?? SELF_HEALING_PRODUCT_ID,
    token: options.license.token,
    issuer: options.license.issuer,
    publicKeysPem: [...options.license.publicKeysPem],
  })

  // Connector evidence sits INSIDE the entitlement guard. Therefore an unlicensed
  // call is refused before capability discovery or any buyer-tool read can occur.
  const evidenceAwareThinker = options.connectorTenantId
    ? createConnectorAwareThinker({ host: options.host, tenantId: options.connectorTenantId, thinker: options.thinker })
    : options.thinker

  const thinker = guardWithEntitlement(evidenceAwareThinker, {
    gate: entitlement,
    classify: { proposeRepairPlan: { actionClass: 'execute', feature: 'repair.plan' } },
    onRefusal: options.onEntitlementRefusal,
  })

  const dispatcher = guardWithEntitlement(createSupervisorDispatcher({
    host: options.host,
    audit: options.audit,
    dispatchStore: options.dispatchStore,
    apiRunner: options.apiRunner,
    apiCapabilities: options.apiCapabilities,
    approvalVerifier: options.approvalVerifier,
  }), {
    gate: entitlement,
    classify: { dispatch: { actionClass: 'dispatch', feature: 'repair.dispatch' } },
    onRefusal: options.onEntitlementRefusal,
  })

  return Object.freeze({ thinker, dispatcher, entitlement })
}
