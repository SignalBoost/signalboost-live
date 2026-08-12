// saas/lib/supervisor/portable/host-context.ts
//
// THE ENTERPRISE INTEGRATION BOUNDARY for the Self-Healing Supervisor portable.

import type {
  PortableCapabilityManifest,
  PortableRuntimeDiscovery,
  PortableConnectorInvocation,
  PortableConnectorExecutionResult,
} from '../../../provider-hub-core/index.ts'
import type { CosConnectorRecipe } from '../../ai/cos/connectorDelegation.ts'

export interface SecretsProvider {
  getSecret(name: string): Promise<string | undefined>
}

export interface PortableNotification {
  kind: 'approval_required'
  category: 'financial' | 'destructive' | 'credential_security'
  title: string
  reason: string
  stepId: string
  stepAction: string
  stepDescription: string
  incidentId: string
  dispatchId: string
  consoleUrl?: string
  recipient?: Approver
}

export interface NotificationSink {
  notify(notification: PortableNotification): Promise<void> | void
}

export interface Approver {
  id: string
  displayName?: string
  address: string
}

export interface ApproverDirectory {
  approversFor(category: PortableNotification['category']): Promise<Approver[]> | Approver[]
}

export interface HostBranding {
  productName: string
  consoleBaseUrl?: string
  locale?: string
}

export interface PortableConnectorRuntimePort {
  discover(input: {
    tenantId: string
    environmentId: string
    manifest: PortableCapabilityManifest
  }): Promise<PortableRuntimeDiscovery>
  invoke(input: {
    manifest: PortableCapabilityManifest
    invocation: PortableConnectorInvocation
  }): Promise<PortableConnectorExecutionResult>
}

/** Buyer-owned durable operational memory. The host decides whether this is SQL, KV, object storage, etc. */
export interface PortableRecipeMemoryPort {
  get(key: string): Promise<CosConnectorRecipe | undefined>
  set(key: string, recipe: CosConnectorRecipe): Promise<void>
}

export interface HostContext {
  secrets: SecretsProvider
  notifications: NotificationSink
  approvers: ApproverDirectory
  branding: HostBranding
  connectors?: PortableConnectorRuntimePort
  /** Optional durable memory for learned successful connector recipes. */
  recipeMemory?: PortableRecipeMemoryPort
}

export function buildConsoleUrl(branding: HostBranding, path: string): string | undefined {
  if (!branding.consoleBaseUrl) return undefined
  const base = branding.consoleBaseUrl.replace(/\/+$/, '')
  const suffix = path.replace(/^\/+/, '')
  return base + '/' + suffix
}
