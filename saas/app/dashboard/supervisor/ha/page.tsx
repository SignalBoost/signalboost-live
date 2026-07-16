import { createBrowserProviderPolicyReviewSnapshot, createDefaultBrowserProviderRegistry } from '@/lib/browser-provider'
import { loadLanguage } from '@/lib/i18n/loadLanguage'

function translateMetadataKey(dictionary: Record<string, unknown>, key: string): string {
  let value: unknown = dictionary
  for (const part of key.split('.')) {
    if (!value || typeof value !== 'object') return key
    value = (value as Record<string, unknown>)[part]
  }
  return typeof value === 'string' ? value : key
}

export default async function SupervisorHaPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const params = await searchParams
  const dict = await loadLanguage(params?.lang || 'en')
  const dictionary = dict as unknown as Record<string, unknown>
  const t = dict.supervisorHa as Record<string, string>
  const providerSnapshots = createDefaultBrowserProviderRegistry()
    .list()
    .map(createBrowserProviderPolicyReviewSnapshot)
  const rows = [
    { label: t.coordinationStoreHealth, value: `${t.coordinationStore} · ${t.connected}` },
    { label: t.supervisorInstance, value: `${t.runtimeId}: runtime-a · ${t.lastHeartbeat}: —` },
    { label: t.providerWorker, value: `vercel · ${t.healthy} · ${t.apiRetry}` },
    { label: t.workItem, value: `${t.queued} / ${t.leased} / ${t.processing} / ${t.abandoned}` },
    { label: t.activeLease, value: `${t.leaseOwner}: ${t.noActiveLease} · ${t.fencingGeneration}: 0` },
    { label: t.abandonedBrowserExecutions, value: `${t.browserSessionLost} · ${t.newExecutionRequired}` },
  ]

  return <main style={{ padding: 24, color: '#fff' }}>
    <h1>{t.durableCoordination}</h1>
    <section>{rows.map(row => <article key={row.label} style={{ border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, padding: 16, marginTop: 12 }}><strong>{row.label}</strong><p>{row.value}</p></article>)}</section>
    <section aria-labelledby="browser-provider-policy-review" style={{ marginTop: 24 }}>
      <h2 id="browser-provider-policy-review">{t.providerWorker} · {t.capabilityMaturity}</h2>
      {providerSnapshots.map(provider => <article key={provider.providerId} style={{ border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, padding: 16, marginTop: 12 }}>
        <h3>{translateMetadataKey(dictionary, provider.displayNameKey)}</h3>
        <p>{t.providerWorker}: <code>{provider.providerId}</code> · {translateMetadataKey(dictionary, `browserProvider.health.${provider.health.state}`)}</p>
        <p>{t.executionMethod}: {t.browserOnDemand} · {t.productionBrowserExecutionDisabled}</p>
        <ul>
          {provider.capabilities.map(capability => <li key={capability.capabilityId} style={{ marginTop: 12 }}>
            <strong>{translateMetadataKey(dictionary, capability.displayNameKey)}</strong>
            <div>{translateMetadataKey(dictionary, capability.descriptionKey ?? capability.displayNameKey)}</div>
            <small>{t.capabilityMaturity}: <code>{capability.maturity}</code> · {t.policyVersion}: <code>{capability.policyVersion}</code>{capability.requiresHumanApproval ? ` · ${t.humanApprovalRequired}` : ''}</small>
          </li>)}
        </ul>
      </article>)}
    </section>
    <footer style={{ marginTop: 24 }}>{t.leaseExpired} · {t.staleOwner} · {t.coordinationConflict} · {t.reconciliation} · {t.productionBrowserExecutionDisabled}</footer>
  </main>
}
