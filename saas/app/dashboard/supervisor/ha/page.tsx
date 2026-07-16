import { loadLanguage } from '@/lib/i18n/loadLanguage'

export default async function SupervisorHaPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const params = await searchParams
  const dict = await loadLanguage(params?.lang || 'en')
  const t = dict.supervisorHa as Record<string, string>
  const rows = [
    { label: t.healthy, value: 'supervisor-a / runtime-a' },
    { label: t.providerWorker, value: 'vercel · healthy · auto_failover_ready' },
    { label: t.executionMethod, value: `${t.smartFailover} / ${t.apiRetry}` },
    { label: t.browserReason, value: t.productionBrowserExecutionDisabled },
    { label: t.workOwner, value: t.noActiveWork },
  ]
  return <main style={{ padding: 24, color: '#fff' }}><h1>{t.supervisorInstances}</h1><section>{rows.map(row => <article key={row.label} style={{ border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, padding: 16, marginTop: 12 }}><strong>{row.label}</strong><p>{row.value}</p></article>)}</section><footer style={{ marginTop: 24 }}>{t.leaseExpires} · {t.policyVersion} · {t.capabilityMaturity} · {t.staleOwnerRejected}</footer></main>
}
