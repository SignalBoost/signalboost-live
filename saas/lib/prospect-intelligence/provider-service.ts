import type { ProspectProviderCapability, ProspectProviderContext, ProspectProviderResult } from './contracts.ts'
import './production-providers.ts'
import { executeProspectProvider, listProspectProviderAdapters, testProspectProvider } from './provider-runtime.ts'

export function availableProspectProviders() {
  return listProspectProviderAdapters()
}

export async function checkProspectProvider(providerId: string, context: ProspectProviderContext) {
  return testProspectProvider(providerId, context)
}

export async function runProspectProvider<TInput, TOutput>(args: {
  providerId: string
  capability: ProspectProviderCapability
  input: TInput
  context: ProspectProviderContext
}): Promise<ProspectProviderResult<TOutput>> {
  if (process.env.PROSPECT_LIVE_PROVIDER_EXECUTION !== '1') {
    return { ok: false, errorCode: 'PROSPECT_LIVE_PROVIDER_EXECUTION_DISABLED', provenance: [] }
  }
  return executeProspectProvider<TInput, TOutput>(args.providerId, args.capability, args.input, args.context)
}
