import type { ProviderConfigStore } from '../lib/engine/providerConfigStore.ts'
import {
  createProviderConnectionMetadata,
  type ProviderConnectionIdentity,
  type ProviderConnectionPersistencePort,
} from '../provider-hub-core/index.ts'

export type SignalBoostConnectionIdentityResolver = (
  identity: ProviderConnectionIdentity,
) => string | null | Promise<string | null>

function toPublicFieldName(name: string): string {
  return name
    .replace(/Key$/i, 'Field')
    .replace(/Token$/i, 'Field')
    .replace(/Secret$/i, 'Field')
    .replace(/Password$/i, 'Field')
}

export function createSignalBoostProviderConnectionPort(
  store: Pick<ProviderConfigStore, 'getUserProviderConfig'>,
  resolveUserId: SignalBoostConnectionIdentityResolver,
): ProviderConnectionPersistencePort {
  return {
    async getConnection(identity: ProviderConnectionIdentity) {
      const userId = await resolveUserId(identity)
      if (!userId) return null

      const record = await store.getUserProviderConfig(userId)
      if (!record) return null
      if (record.user_id !== userId) return null
      if (record.active_provider && record.active_provider !== identity.providerId) return null

      const maskedFields = Object.fromEntries(
        Object.keys(record.encrypted_keys ?? {}).map((name) => [toPublicFieldName(name), 'saved']),
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
