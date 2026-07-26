import { createProviderConnectionMetadata, type ProviderConnectionMetadata } from '../provider-hub-core/index.ts'
import type { UserProviderConfig } from '../lib/engine/providerConfigStore.ts'

export const PROVIDER_HUB_STATUS_SURFACE_VERSION = 'provider-hub-status-surface-v1' as const
export type ProviderHubSurfaceMode = 'self_service' | 'enterprise_admin'

export interface ProviderHubStatusSurface {
  schemaVersion: typeof PROVIDER_HUB_STATUS_SURFACE_VERSION
  mode: ProviderHubSurfaceMode
  connection: ProviderConnectionMetadata | null
  allowedActions: readonly string[]
  notices: readonly string[]
}

function publicFieldName(name: string): string {
  return name.replace(/Key$/i, 'Field').replace(/Token$/i, 'Field').replace(/Secret$/i, 'Field').replace(/Password$/i, 'Field')
}

export function createProviderHubStatusSurface(input: {
  mode: ProviderHubSurfaceMode
  tenantId: string
  environmentId: string
  connectionId: string
  record: UserProviderConfig | null
}): ProviderHubStatusSurface {
  const connection = input.record
    ? createProviderConnectionMetadata({
        tenantId: input.tenantId,
        environmentId: input.environmentId,
        connectionId: input.connectionId,
        providerId: input.record.active_provider || 'unconfigured',
        state: input.record.byok_enabled ? 'configured' : 'disconnected',
        authentication: {
          method: 'api_key',
          configured: Object.keys(input.record.encrypted_keys ?? {}).length > 0,
          maskedFields: Object.fromEntries(Object.keys(input.record.encrypted_keys ?? {}).map(name => [publicFieldName(name), 'saved'])),
        },
        updatedAt: input.record.updated_at ?? input.record.created_at ?? new Date(0).toISOString(),
      })
    : null

  return Object.freeze({
    schemaVersion: PROVIDER_HUB_STATUS_SURFACE_VERSION,
    mode: input.mode,
    connection,
    allowedActions: Object.freeze(['view', 'manual_setup']),
    notices: Object.freeze(connection ? [] : ['No provider connection is configured.']),
  })
}
