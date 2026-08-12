// saas/lib/supervisor/portable/host-context.ts
//
// THE ENTERPRISE INTEGRATION BOUNDARY for the Self-Healing Supervisor portable.
//
// A portable that is sold into another company's systems must never name, import,
// or assume the platform it happens to have been built on. It brings BEHAVIOR; the
// buyer brings INFRASTRUCTURE. This module defines the single contract through which
// a buyer supplies everything the portable needs from their environment: datastore,
// secrets, outbound notifications, identity of the approving humans, branding, and
// (optionally) the buyer-owned connector runtime used to discover and invoke tools.

import type {
  PortableCapabilityManifest,
  PortableRuntimeDiscovery,
  PortableConnectorInvocation,
  PortableConnectorExecutionResult,
} from '../../../provider-hub-core/index.ts'

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

/**
 * Buyer-owned tool boundary. The Portable sees only this vendor-neutral contract;
 * credentials, provider SDKs and connection configuration remain in the buyer host.
 */
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

export interface HostContext {
  secrets: SecretsProvider
  notifications: NotificationSink
  approvers: ApproverDirectory
  branding: HostBranding
  /** Optional for backward compatibility; required only by Portables that use connector capabilities. */
  connectors?: PortableConnectorRuntimePort
}

export function buildConsoleUrl(branding: HostBranding, path: string): string | undefined {
  if (!branding.consoleBaseUrl) return undefined
  const base = branding.consoleBaseUrl.replace(/\/+$/, '')
  const suffix = path.replace(/^\/+/, '')
  return base + '/' + suffix
}
