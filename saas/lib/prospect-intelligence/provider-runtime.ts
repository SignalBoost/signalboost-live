import type {
  ProspectProviderAdapter,
  ProspectProviderCapability,
  ProspectProviderContext,
  ProspectProviderHealth,
  ProspectProviderResult,
  ProspectSecretReference,
} from './contracts.ts'

export type ProspectSecretResolver = (reference: ProspectSecretReference) => Promise<string | undefined>

let secretManagerResolver: ProspectSecretResolver | null = null

export function setProspectSecretManagerResolver(resolver: ProspectSecretResolver | null) {
  secretManagerResolver = resolver
}

export async function resolveProspectSecret(reference: ProspectSecretReference): Promise<string | undefined> {
  if (reference.kind === 'environment') {
    const value = process.env[reference.reference]
    return value && value.trim() ? value.trim() : undefined
  }
  return secretManagerResolver ? secretManagerResolver(reference) : undefined
}

export async function resolveProspectSecrets(context: ProspectProviderContext): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {}
  for (const reference of context.secretReferences) {
    const value = await resolveProspectSecret(reference)
    if (value) resolved[reference.reference] = value
  }
  return resolved
}

const adapters = new Map<string, ProspectProviderAdapter>()

export function registerProspectProviderAdapter(adapter: ProspectProviderAdapter) {
  adapters.set(adapter.providerId, adapter)
}

export function registerProspectProviderAdapters(values: readonly ProspectProviderAdapter[]) {
  for (const adapter of values) registerProspectProviderAdapter(adapter)
}

export function listProspectProviderAdapters() {
  return [...adapters.values()].map(adapter => ({
    providerId: adapter.providerId,
    displayName: adapter.displayName,
    capabilities: adapter.capabilities,
  }))
}

export async function testProspectProvider(providerId: string, context: ProspectProviderContext): Promise<ProspectProviderHealth> {
  const adapter = adapters.get(providerId)
  if (!adapter) return { state: 'unconfigured', checkedAt: new Date().toISOString(), messageKey: 'prospect.provider.unknown' }
  return adapter.testConnection(context)
}

export async function executeProspectProvider<TInput, TOutput>(
  providerId: string,
  capability: ProspectProviderCapability,
  input: TInput,
  context: ProspectProviderContext,
): Promise<ProspectProviderResult<TOutput>> {
  const adapter = adapters.get(providerId)
  if (!adapter) return { ok: false, errorCode: 'PROSPECT_PROVIDER_UNKNOWN', provenance: [] }
  if (!adapter.capabilities.includes(capability)) {
    return { ok: false, errorCode: 'PROSPECT_PROVIDER_CAPABILITY_UNSUPPORTED', provenance: [] }
  }
  return adapter.execute<TInput, TOutput>(capability, input, context)
}
