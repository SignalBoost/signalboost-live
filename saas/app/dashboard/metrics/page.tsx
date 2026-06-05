'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const GOLD = '#ffc300'

type Lead = { status?: 'pending' | 'approved' | 'rejected' }

type Data = {
  plan: string
  credits: number | null
  name: string | null
  leads: Lead[]
  sendLimit: { remaining?: number; limit?: number } | null
  calendarCount: number | null
  dataItems: number | null
  dataSources: number | null
  errors: string[]
}

const EMPTY: Data = {
  plan: 'free', credits: null, name: null, leads: [], sendLimit: null,
  calendarCount: null, dataItems: null, dataSources: null, errors: [],
}

async function safeJson(url: string) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
}

export default function MetricsAnalyticsPage() {
  const { dict, lang } = useI18n()
  const tr = (key: string, fallback: string) => t(dict, key, fallback)

  const [data, setData] = useState<Data>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const next: Data = { ...EMPTY }
    const year = new Date().getFullYear()

    const [credits, queue, calendar, dataConn] = await Promise.allSettled([
      safeJson('/api/credits'),
      safeJson('/api/outreach/queue?limit=500'),
      safeJson(`/api/calendar/events?from=${year}-01-01&to=${year}-12-31`),
      safeJson('/api/data-connectors/history'),
    ])

    if (credits.status === 'fulfilled') {
      const c = credits.value
      if (typeof c.credits === 'number') next.credits = c.credits
      if (c.plan) next.plan = c.plan
      if (c.name) next.name = c.name
    } else next.errors.push('credits')

    if (queue.status === 'fulfilled') {
      next.leads = Array.isArray(queue.value.outreach) ? queue.value.outreach : []
      next.sendLimit = queue.value.sendLimit ?? null
    } else next.errors.push('outreach')

    if (calendar.status === 'fulfilled') {
      next.calendarCount = Array.isArray(calendar.value.events) ? calendar.value.events.length : 0
    } else next.errors.push('calendar')

    if (dataConn.status === 'fulfilled') {
      const grouped = dataConn.value.groupedItems || {}
      next.dataItems = Object.values(grouped).reduce((a: number, arr: any) => a + (Array.isArray(arr) ? arr.length : 0), 0)
      next.dataSources = Array.isArray(dataConn.value.sources) ? dataConn.value.sources.length : 0
    } else next.errors.push('data')

    setData(next)
    setLoading(false)
    setRefreshedAt(new Date())
  }, [])

  useEffect(() => { load() }, [load])

  const leadStats = useMemo(() => {
    const count = (s: string) => data.leads.filter(l => (l.status || 'pending') === s).length
    return {
      total: data.leads.length,
      pending: count('pending'),
      approved: count('approved'),
      rejected: count('rejected'),
    }
  }, [data.leads])

  const planLabel = tr(`plan.${data.plan}`, data.plan.charAt(0).toUpperCase() + data.plan.slice(1))

  const cards = [
    { label: tr('analytics.plan', 'Current plan'), value: planLabel, accent: GOLD, href: '/pricing' },
    { label: tr('analytics.credits', 'Credits remaining'), value: data.credits ?? '—', accent: '#7dd3fc', href: '/pricing' },
    { label: tr('analytics.leads', 'Outreach leads'), value: leadStats.total, accent: '#c4b5fd', href: '/dashboard/outreach' },
    { label: tr('analytics.approved', 'Approved leads'), value: leadStats.approved, accent: '#86efac', href: '/dashboard/outreach/contacts' },
    { label: tr('analytics.calendar', 'Calendar events'), value: data.calendarCount ?? '—', accent: '#fde68a', href: '/dashboard/calendar' },
    { label: tr('analytics.dataItems', 'Imported data items'), value: data.dataItems ?? '—', accent: '#fca5a5', href: '/dashboard/data' },
  ]

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <span className="sb-eyebrow">{tr('analytics.eyebrow', 'Analytics')}</span>
          <h1 className="sb-h2" style={{ marginTop: 8, marginBottom: 2 }}>{tr('analytics.title', 'Unified dashboard')}</h1>
          <p className="sb-body" style={{ margin: 0 }}>{tr('analytics.subtitle', 'Real metrics across your outreach, content, data, and account.')}</p>
        </div>
        <button onClick={load} disabled={loading} className="sb-button-secondary" style={{ opacity: loading ? 0.6 : 1 }}>
          {loading ? tr('analytics.refreshing', 'Refreshing…') : tr('analytics.refresh', 'Refresh')}
        </button>
      </div>

      {/* Metric cards */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 24 }}>
        {cards.map(c => (
          <Link key={c.label} href={c.href} className="sb-card" style={{ padding: 18, textDecoration: 'none', display: 'block' }}>
            <div style={{ fontSize: 30, fontWeight: 900, color: c.accent }}>{c.value}</div>
            <div className="sb-caption" style={{ marginTop: 4 }}>{c.label}</div>
          </Link>
        ))}
      </section>

      {/* Outreach funnel breakdown */}
      <section className="sb-card" style={{ padding: 20, marginBottom: 20 }}>
        <h2 className="sb-h3" style={{ marginTop: 0 }}>{tr('analytics.funnel', 'Outreach funnel')}</h2>
        {leadStats.total === 0 ? (
          <p className="sb-body" style={{ margin: 0 }}>
            {tr('analytics.noLeads', 'No leads yet.')} <Link href="/dashboard/outreach/discovery" style={{ color: '#7dd3fc' }}>{tr('analytics.startDiscovery', 'Start with Discovery')}</Link>.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,.06)' }}>
              {[
                { v: leadStats.pending, c: '#fde68a' },
                { v: leadStats.approved, c: '#86efac' },
                { v: leadStats.rejected, c: '#fca5a5' },
              ].map((s, i) => s.v > 0 && (
                <div key={i} style={{ width: `${(s.v / leadStats.total) * 100}%`, background: s.c }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
              <Stat color="#fde68a" label={tr('analytics.pending', 'Pending')} value={leadStats.pending} />
              <Stat color="#86efac" label={tr('analytics.approvedShort', 'Approved')} value={leadStats.approved} />
              <Stat color="#fca5a5" label={tr('analytics.rejected', 'Rejected')} value={leadStats.rejected} />
              {data.sendLimit?.limit != null && (
                <Stat color="#7dd3fc" label={tr('analytics.sendsLeft', 'Sends left today')} value={`${data.sendLimit.remaining ?? '—'} / ${data.sendLimit.limit}`} />
              )}
            </div>
          </>
        )}
      </section>

      {/* Data + content row */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
        <div className="sb-card" style={{ padding: 20 }}>
          <h2 className="sb-h3" style={{ marginTop: 0 }}>{tr('analytics.data', 'Data connectors')}</h2>
          <p className="sb-body" style={{ margin: '6px 0 12px' }}>
            {data.dataItems ?? '—'} {tr('analytics.itemsFrom', 'items from')} {data.dataSources ?? '—'} {tr('analytics.sources', 'sources')}.
          </p>
          <Link className="sb-button-secondary" href="/dashboard/data">{tr('analytics.manageData', 'Manage data')}</Link>
        </div>

        <div className="sb-card" style={{ padding: 20 }}>
          <h2 className="sb-h3" style={{ marginTop: 0 }}>{tr('analytics.optimizers', 'Optimization tools')}</h2>
          <p className="sb-body" style={{ margin: '6px 0 12px' }}>{tr('analytics.optimizersDesc', 'Audit and rebuild your website and podcast.')}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="sb-button-secondary" href="/dashboard/improve">🧭 {tr('analytics.website', 'Website')}</Link>
            <Link className="sb-button-secondary" href="/dashboard/podcast/studio">🎚️ {tr('analytics.podcast', 'Podcast')}</Link>
          </div>
        </div>
      </section>

      {data.errors.length > 0 && (
        <p className="sb-caption" style={{ marginTop: 18, opacity: .6 }}>
          {tr('analytics.partial', 'Some sources are temporarily unavailable:')} {data.errors.join(', ')}.
        </p>
      )}
      {refreshedAt && (
        <p className="sb-caption" style={{ marginTop: 8, opacity: .5 }}>
          {tr('analytics.updated', 'Updated')} {refreshedAt.toLocaleTimeString(lang)}
        </p>
      )}
    </main>
  )
}

function Stat({ color, label, value }: { color: string; label: string; value: number | string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,.75)' }}>{label}: <strong style={{ color: '#fff' }}>{value}</strong></span>
    </div>
  )
}
