import type { ProviderConfigStore } from '../lib/engine/providerConfigStore.ts'
import {
  createProviderConnectionMetadata,
  type ProviderConnectionIdentity,
  type ProviderConnectionPersistencePort,
} from '../provider-hub-core/index.ts'

export function createSignalBoostProviderConnectionPort(
  store: Pick<ProviderConfigStore, 'getUserProviderConfig'>,
): ProviderConnectionPersistencePort {
  return {
    async getConnection(identity: ProviderConnectionIdentity) {
      const record = await store.getUserProviderConfig(identity.connectionId)
      if (!record) return null

      const maskedFields = Object.fromEntries(
        Object.keys(record.encrypted_keys ?? {}).map((name) => [name.replace(/(key|token|secret)/gi, 'field'), 'saved']),
      )

      return createProviderConnectionMetadata({
        ...identity,
        providerId: record.active_provider || identity.providerId,
        state: record.byok_enabled ? 'configured' : 'disconnected',
        authentication: {
          method: 'api_key',
          configured: Object.keys(record.encrypted_keys ?? {}).length > 0,
          maskedFields,
        },
        updatedAt: record.updated_at ?? record.created_at ?? new Date(0).toISOString(),
      })
    },
  }
}
