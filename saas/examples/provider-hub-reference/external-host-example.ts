import type { ProviderConnectionPersistencePort } from '../../provider-hub-core/index.ts'
import type {
  ProviderHubApprovalPort,
  ProviderHubAuditPort,
  ProviderHubHostPorts,
  ProviderHubIdentityPort,
  ProviderHubLicensingPort,
  ProviderHubUiPort,
  ProviderHubVaultPort,
} from '../../provider-hub-core/host-ports.ts'

export interface ExternalHostAdapters {
  identity: ProviderHubIdentityPort
  vault: ProviderHubVaultPort
  persistence: ProviderConnectionPersistencePort
  audit: ProviderHubAuditPort
  approvals: ProviderHubApprovalPort
  licensing: ProviderHubLicensingPort
  ui: ProviderHubUiPort
}

/**
 * Buyer-owned host composition example.
 *
 * The buyer supplies every adapter. Provider Hub receives only the versioned
 * contracts and never imports the buyer's framework, database, vault, cloud,
 * identity provider, billing system, or UI toolkit.
 */
export function createExternalHostProviderHub(adapters: ExternalHostAdapters): ProviderHubHostPorts {
  return Object.freeze({
    identity: adapters.identity,
    vault: adapters.vault,
    persistence: adapters.persistence,
    audit: adapters.audit,
    approvals: adapters.approvals,
    licensing: adapters.licensing,
    ui: adapters.ui,
  })
}
