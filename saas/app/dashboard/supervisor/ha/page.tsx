import Link from 'next/link'
import { loadLanguage } from '@/lib/i18n/loadLanguage'
import { getServerLanguage } from '@/lib/i18n/serverLanguage'

export default async function SupervisorHaPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const params = await searchParams
  const lang = await getServerLanguage(params?.lang)
  const dict = await loadLanguage(lang)
  const t = dict.supervisorHa as Record<string, string>
  const rows = [
    { label: t.coordinationStoreHealth, value: `${t.coordinationStore} · ${t.connected}` },
    { label: t.supervisorInstance, value: `${t.runtimeId}: runtime-a · ${t.lastHeartbeat}: —` },
    { label: t.providerWorker, value: `vercel · ${t.healthy} · ${t.apiRetry}` },
    { label: t.workItem, value: `${t.queued} / ${t.leased} / ${t.processing} / ${t.abandoned}` },
    { label: t.activeLease, value: `${t.leaseOwner}: ${t.noActiveLease} · ${t.fencingGeneration}: 0` },
    { label: t.abandonedBrowserExecutions, value: `${t.browserSessionLost} · ${t.newExecutionRequired}` },
  ]
  return <main style={{ padding: 24, color: '#fff' }}><h1>{t.durableCoordination}</h1><section>{rows.map(row => <article key={row.label} style={{ border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, padding: 16, marginTop: 12 }}><strong>{row.label}</strong><p>{row.value}</p></article>)}</section><footer style={{ marginTop: 24 }}><Link href="/dashboard/supervisor/providers">{t.providerWorker}</Link> · {t.leaseExpired} · {t.staleOwner} · {t.coordinationConflict} · {t.reconciliation} · {t.productionBrowserExecutionDisabled}</footer></main>
}
