// saas/app/dashboard/marketing-sales/console/ConsoleClient.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { msT, type Lang } from '@/marketing-sales-core'

type Row = {
  campaign: { id: string; objective: string; status: string; created_at?: string }
  draftCount: number
  liveUrl: string | null
  connector: string | null
  lastOk: boolean | null
  views: number
}

const STATUS_KEY: Record<string, Parameters<typeof msT>[1]> = {
  intake: 'statusIntake', drafting: 'statusDrafting', needs_approval: 'statusNeedsApproval',
  approved: 'statusApproved', publishing: 'statusPublishing', published: 'statusPublished',
  publish_failed: 'statusPublishFailed', edits_requested: 'statusEditsRequested',
  rejected: 'statusRejected', archived: 'statusArchived', measuring: 'statusMeasuring',
}
const STATUS_COLOR: Record<string, string> = {
  needs_approval: '#ffc300', approved: '#1af0ff', publishing: '#1af0ff', published: '#22c55e',
  publish_failed: '#f87171', rejected: '#f87171', edits_requested: '#fbbf24',
  intake: '#94a3b8', drafting: '#94a3b8', archived: '#64748b', measuring: '#a78bfa',
}

export default function ConsoleClient() {
  const { lang } = useI18n()
  const L = String(lang || 'en') as Lang
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/marketing-sales/console', { cache: 'no-store' })
        const data = await res.json()
        setRows(data?.ok && Array.isArray(data.data) ? data.data : [])
      } catch { setRows([]) } finally { setLoading(false) }
    })()
  }, [])

  const statuses = useMemo(() => Array.from(new Set(rows.map((r) => r.campaign.status))), [rows])
  const shown = filter === 'all' ? rows : rows.filter((r) => r.campaign.status === filter)

  const badge = (s: string) => (
    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', padding: '3px 9px', borderRadius: 999,
      color: STATUS_COLOR[s] || '#94a3b8', border: `1px solid ${STATUS_COLOR[s] || '#94a3b8'}55`, background: `${STATUS_COLOR[s] || '#94a3b8'}14` }}>
      {msT(L, STATUS_KEY[s] || 'campaigns')}
    </span>
  )

  return (
    <main style={{ minHeight: 'calc(100vh - 80px)', padding: '28px 22px', maxWidth: 1040, margin: '0 auto', color: 'rgba(226,232,240,.92)' }}>
      <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#1af0ff', margin: 0 }}>{msT(L, 'console')}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 className="sb-h2" style={{ margin: '4px 0 18px' }}>{msT(L, 'overview')}</h1>
        <a href="/dashboard/marketing-sales/review" style={{ color: '#1af0ff', fontWeight: 700, fontSize: 13 }}>{msT(L, 'pendingApproval')} →</a>
      </div>

      <p style={{ margin: '0 0 14px', fontSize: 13, opacity: .7 }}>
        👁 {rows.reduce((n, r) => n + (r.views || 0), 0)} · {rows.length} {msT(L, 'campaigns').toLowerCase()}
      </p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {['all', ...statuses].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${filter === s ? '#1af0ff' : 'rgba(255,255,255,.16)'}`,
              background: filter === s ? 'rgba(26,240,255,.12)' : 'transparent',
              color: filter === s ? '#1af0ff' : 'rgba(226,232,240,.7)' }}>
            {s === 'all' ? msT(L, 'all') : msT(L, STATUS_KEY[s] || 'campaigns')}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ opacity: .6 }}>…</p>
      ) : shown.length === 0 ? (
        <p style={{ opacity: .6 }}>{msT(L, 'campaigns')}: 0</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {shown.map((r) => (
            <div key={r.campaign.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center',
              border: '1px solid rgba(255,255,255,.10)', borderRadius: 12, padding: '12px 16px',
              background: 'linear-gradient(160deg, rgba(15,23,42,.5), rgba(3,7,18,.6))' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 700, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.campaign.objective}</p>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, opacity: .8 }}>
                  {badge(r.campaign.status)}
                  <span>{msT(L, 'languages')}: {r.draftCount}</span>
                  {r.connector ? <span>{msT(L, 'channel')}: {r.connector}</span> : null}
                  <span title="views">👁 {r.views || 0}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {r.liveUrl ? (
                  <a href={r.liveUrl} target="_blank" rel="noreferrer" style={{ color: '#1af0ff', fontWeight: 700, fontSize: 13, textDecoration: 'underline' }}>{msT(L, 'viewLive')} →</a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
