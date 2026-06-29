// saas/app/dashboard/marketing-sales/review/ReviewClient.tsx
'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { msT, type Lang } from '@/marketing-sales-core'

type Draft = { id: string; lang: string; title: string; body: string }
type Item = { campaign: { id: string; objective: string; status: string; created_at?: string }; drafts: Draft[] }

export default function ReviewClient() {
  const { lang } = useI18n()
  const L = String(lang || 'en') as Lang
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [published, setPublished] = useState<Record<string, string>>({}) // campaignId -> liveUrl

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/marketing-sales/campaigns', { cache: 'no-store' })
      const data = await res.json()
      setItems(data?.ok && Array.isArray(data.data) ? data.data : [])
    } catch { setItems([]) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  // Approve then ship to the site connector — one action takes a campaign live.
  async function approveAndPublish(campaignId: string) {
    setBusy(campaignId)
    try {
      const dr = await fetch('/api/marketing-sales/decide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, decision: 'approve' }),
      })
      const dj = await dr.json()
      if (!dj?.ok) { await load(); return }
      const pr = await fetch('/api/marketing-sales/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, connectorId: 'site' }),
      })
      const pj = await pr.json()
      if (pj?.ok && pj?.data?.liveUrl) {
        setPublished((p) => ({ ...p, [campaignId]: pj.data.liveUrl }))
      } else {
        await load()
      }
    } finally { setBusy(null) }
  }

  async function decide(campaignId: string, decision: 'edits' | 'reject') {
    setBusy(campaignId)
    try {
      await fetch('/api/marketing-sales/decide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, decision }),
      })
      await load()
    } finally { setBusy(null) }
  }

  return (
    <main style={{ minHeight: 'calc(100vh - 80px)', padding: '28px 22px', maxWidth: 920, margin: '0 auto', color: 'rgba(226,232,240,.92)' }}>
      <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#1af0ff', margin: 0 }}>{msT(L, 'department')}</p>
      <h1 className="sb-h2" style={{ margin: '4px 0 18px' }}>{msT(L, 'pendingApproval')}</h1>

      {loading ? (
        <p style={{ opacity: .6 }}>…</p>
      ) : items.length === 0 ? (
        <p style={{ opacity: .6 }}>{msT(L, 'campaigns')}: 0</p>
      ) : (
        <section style={{ display: 'grid', gap: 14 }}>
          {items.map(({ campaign, drafts }) => {
            const liveUrl = published[campaign.id]
            const chosen = view[campaign.id] || (drafts.find((d) => d.lang === L)?.lang) || drafts[0]?.lang || 'en'
            const draft = drafts.find((d) => d.lang === chosen) || drafts[0]
            return (
              <article key={campaign.id} style={{ border: '1px solid rgba(255,255,255,.10)', borderRadius: 14, padding: 16, background: 'linear-gradient(160deg, rgba(15,23,42,.55), rgba(3,7,18,.65))' }}>
                <h2 className="sb-h3" style={{ margin: '0 0 8px' }}>{campaign.objective}</h2>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {drafts.map((d) => (
                    <button key={d.id} onClick={() => setView((v) => ({ ...v, [campaign.id]: d.lang }))}
                      style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                        border: `1px solid ${d.lang === chosen ? '#1af0ff' : 'rgba(255,255,255,.18)'}`,
                        background: d.lang === chosen ? 'rgba(26,240,255,.12)' : 'transparent', color: d.lang === chosen ? '#1af0ff' : 'rgba(226,232,240,.7)' }}>
                      {d.lang}
                    </button>
                  ))}
                </div>
                {draft ? (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ fontWeight: 700, margin: '0 0 4px' }}>{draft.title}</p>
                    <p style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', margin: 0, opacity: .85 }}>{draft.body}</p>
                  </div>
                ) : null}

                {liveUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: '#22c55e' }}>✓ {msT(L, 'published')}</span>
                    <a href={liveUrl} target="_blank" rel="noreferrer" style={{ color: '#1af0ff', fontWeight: 700, textDecoration: 'underline' }}>{msT(L, 'viewLive')} →</a>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button disabled={busy === campaign.id} onClick={() => approveAndPublish(campaign.id)}
                      style={{ background: '#ffc300', color: '#000', border: 'none', borderRadius: 999, padding: '9px 18px', fontWeight: 900, cursor: 'pointer', opacity: busy === campaign.id ? .6 : 1 }}>{msT(L, 'approveAndPublish')}</button>
                    <button disabled={busy === campaign.id} onClick={() => decide(campaign.id, 'edits')}
                      style={{ background: 'transparent', color: 'rgba(226,232,240,.85)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 999, padding: '9px 18px', fontWeight: 700, cursor: 'pointer' }}>{msT(L, 'requestEdits')}</button>
                    <button disabled={busy === campaign.id} onClick={() => decide(campaign.id, 'reject')}
                      style={{ background: 'transparent', color: '#f87171', border: '1px solid rgba(248,113,113,.4)', borderRadius: 999, padding: '9px 18px', fontWeight: 700, cursor: 'pointer' }}>{msT(L, 'reject')}</button>
                  </div>
                )}
              </article>
            )
          })}
        </section>
      )}
    </main>
  )
}
