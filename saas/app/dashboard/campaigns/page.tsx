'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const GOLD = '#ffc300'

type Metrics = { sent?: number; opened?: number; clicked?: number; converted?: number; spend?: number; revenue?: number }
type Campaign = {
  id: string
  name: string
  type: string
  status: string
  channel?: string | null
  goal?: string | null
  audience?: string | null
  ab_variant?: 'A' | 'B' | null
  ab_group_id?: string | null
  metrics: Metrics
  starts_at?: string | null
  ends_at?: string | null
  notes?: string | null
  created_at: string
}

const TYPES = ['email', 'social', 'ads', 'outreach', 'other']
const STATUSES = ['draft', 'active', 'paused', 'completed']

const STATUS_UI: Record<string, { color: string; bg: string }> = {
  draft:     { color: 'rgba(255,255,255,.7)', bg: 'rgba(255,255,255,.08)' },
  active:    { color: '#86efac', bg: 'rgba(134,239,172,.14)' },
  paused:    { color: '#fde68a', bg: 'rgba(253,230,138,.14)' },
  completed: { color: '#7dd3fc', bg: 'rgba(125,211,252,.14)' },
}

function pct(n: number, d: number) {
  if (!d || d <= 0) return null
  return Math.round((n / d) * 100)
}

export default function CampaignsPage() {
  const { dict } = useI18n()
  const tr = (k: string, f: string) => t(dict, k, f)

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // create form
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('email')
  const [channel, setChannel] = useState('')
  const [goal, setGoal] = useState('')
  const [audience, setAudience] = useState('')
  const [abTest, setAbTest] = useState(false)
  const [saving, setSaving] = useState(false)

  // metrics editing
  const [editing, setEditing] = useState<string | null>(null)
  const [draftMetrics, setDraftMetrics] = useState<Metrics>({})

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/marketing/campaigns', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) setError(data?.error || 'Could not load campaigns.')
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : [])
    } catch {
      setError('Something went wrong loading campaigns.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function createCampaign() {
    if (!name.trim() || saving) return
    setSaving(true); setError('')
    try {
      // For an A/B test, create two paired variants sharing an ab_group_id.
      if (abTest) {
        const groupId = (crypto as any)?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
        for (const variant of ['A', 'B'] as const) {
          await fetch('/api/marketing/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `${name.trim()} (${variant})`,
              type, channel: channel.trim(), goal: goal.trim(), audience: audience.trim(),
              ab_variant: variant, ab_group_id: groupId,
            }),
          })
        }
      } else {
        const res = await fetch('/api/marketing/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), type, channel: channel.trim(), goal: goal.trim(), audience: audience.trim() }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data?.error || 'Could not create campaign.'); setSaving(false); return }
      }
      setName(''); setChannel(''); setGoal(''); setAudience(''); setAbTest(false); setShowForm(false)
      await load()
    } catch {
      setError('Could not create the campaign.')
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(id: string, status: string) {
    setCampaigns(prev => prev.map(c => (c.id === id ? { ...c, status } : c)))
    await fetch('/api/marketing/campaigns', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
  }

  async function saveMetrics(id: string) {
    await fetch('/api/marketing/campaigns', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, metrics: draftMetrics }),
    })
    setCampaigns(prev => prev.map(c => (c.id === id ? { ...c, metrics: draftMetrics } : c)))
    setEditing(null)
  }

  async function remove(id: string) {
    setCampaigns(prev => prev.filter(c => c.id !== id))
    await fetch(`/api/marketing/campaigns?id=${id}`, { method: 'DELETE' })
  }

  // Roll-up funnel totals across all campaigns
  const totals = useMemo(() => {
    const acc = { sent: 0, opened: 0, clicked: 0, converted: 0, spend: 0, revenue: 0 }
    for (const c of campaigns) {
      acc.sent += c.metrics?.sent || 0
      acc.opened += c.metrics?.opened || 0
      acc.clicked += c.metrics?.clicked || 0
      acc.converted += c.metrics?.converted || 0
      acc.spend += c.metrics?.spend || 0
      acc.revenue += c.metrics?.revenue || 0
    }
    return acc
  }, [campaigns])

  const roi = totals.spend > 0 ? Math.round(((totals.revenue - totals.spend) / totals.spend) * 100) : null
return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <span className="sb-eyebrow">{tr('campaigns.eyebrow', 'Marketing')}</span>
          <h1 className="sb-h2" style={{ marginTop: 8, marginBottom: 2 }}>{tr('campaigns.title', 'Campaigns')}</h1>
          <p className="sb-body" style={{ margin: 0 }}>{tr('campaigns.subtitle', 'Plan campaigns, run A/B tests, and track the funnel from sent to converted.')}</p>
        </div>
        <button onClick={() => setShowForm(s => !s)} className="sb-button-primary">
          {showForm ? tr('campaigns.close', 'Close') : tr('campaigns.new', '+ New campaign')}
        </button>
      </div>

      {error && <p className="sb-caption" style={{ color: '#fca5a5', marginBottom: 12 }}>{error}</p>}

      {/* Funnel roll-up */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: 22 }}>
        {[
          { label: tr('campaigns.sent', 'Sent'), value: totals.sent, accent: '#fff' },
          { label: tr('campaigns.opened', 'Opened'), value: totals.opened, accent: '#fde68a', rate: pct(totals.opened, totals.sent) },
          { label: tr('campaigns.clicked', 'Clicked'), value: totals.clicked, accent: '#c4b5fd', rate: pct(totals.clicked, totals.opened) },
          { label: tr('campaigns.converted', 'Converted'), value: totals.converted, accent: '#86efac', rate: pct(totals.converted, totals.clicked) },
          { label: tr('campaigns.roi', 'ROI'), value: roi === null ? '—' : `${roi}%`, accent: roi !== null && roi >= 0 ? '#86efac' : '#fca5a5' },
        ].map(c => (
          <div key={c.label} className="sb-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: c.accent }}>{c.value}</div>
            <div className="sb-caption">{c.label}{'rate' in c && c.rate !== null && c.rate !== undefined ? ` · ${c.rate}%` : ''}</div>
          </div>
        ))}
      </section>

      {/* Create form */}
      {showForm && (
        <section className="sb-card" style={{ padding: 20, marginBottom: 22 }}>
          <h2 className="sb-h3" style={{ marginTop: 0 }}>{tr('campaigns.create', 'Create a campaign')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            <input className="sb-input" style={{ padding: 12 }} placeholder={tr('campaigns.name', 'Campaign name')} value={name} onChange={e => setName(e.target.value)} />
            <select className="sb-input" style={{ padding: 12 }} value={type} onChange={e => setType(e.target.value)}>
              {TYPES.map(ty => <option key={ty} value={ty}>{tr(`campaigns.type.${ty}`, ty.charAt(0).toUpperCase() + ty.slice(1))}</option>)}
            </select>
            <input className="sb-input" style={{ padding: 12 }} placeholder={tr('campaigns.channel', 'Channel (e.g. Instagram)')} value={channel} onChange={e => setChannel(e.target.value)} />
            <input className="sb-input" style={{ padding: 12 }} placeholder={tr('campaigns.audience', 'Audience')} value={audience} onChange={e => setAudience(e.target.value)} />
            <input className="sb-input" style={{ padding: 12, gridColumn: '1 / -1' }} placeholder={tr('campaigns.goal', 'Goal')} value={goal} onChange={e => setGoal(e.target.value)} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={abTest} onChange={e => setAbTest(e.target.checked)} />
            {tr('campaigns.abTest', 'Create as an A/B test (two paired variants, A and B)')}
          </label>
          <div style={{ marginTop: 14 }}>
            <button onClick={createCampaign} disabled={saving || !name.trim()} className="sb-button-primary" style={{ opacity: saving || !name.trim() ? 0.6 : 1 }}>
              {saving ? tr('campaigns.saving', 'Saving…') : tr('campaigns.add', 'Add campaign')}
            </button>
          </div>
        </section>
      )}

      {loading && <p className="sb-body">{tr('campaigns.loading', 'Loading campaigns…')}</p>}

      {!loading && campaigns.length === 0 && (
        <div className="sb-card" style={{ padding: 28, textAlign: 'center' }}>
          <p className="sb-body" style={{ margin: 0 }}>{tr('campaigns.empty', 'No campaigns yet. Create your first one to start tracking.')}</p>
        </div>
      )}

      {/* Campaign list */}
      <div style={{ display: 'grid', gap: 14 }}>
        {campaigns.map(c => {
          const m = c.metrics || {}
          const isEditing = editing === c.id
          const su = STATUS_UI[c.status] || STATUS_UI.draft
          return (
            <article key={c.id} className="sb-card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ color: '#fff', fontSize: 16 }}>{c.name}</strong>
                    {c.ab_variant && (
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(196,181,253,.16)', color: '#c4b5fd' }}>
                        {tr('campaigns.variant', 'Variant')} {c.ab_variant}
                      </span>
                    )}
                  </div>
                  <div className="sb-caption" style={{ marginTop: 4 }}>
                    {tr(`campaigns.type.${c.type}`, c.type)}{c.channel ? ` · ${c.channel}` : ''}{c.goal ? ` · ${c.goal}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={c.status}
                    onChange={e => updateStatus(c.id, e.target.value)}
                    style={{ fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 999, background: su.bg, color: su.color, border: '1px solid rgba(255,255,255,.12)', cursor: 'pointer' }}
                  >
                    {STATUSES.map(s => <option key={s} value={s} style={{ background: '#0f1117', color: '#fff' }}>{tr(`campaigns.status.${s}`, s)}</option>)}
                  </select>
                  <button onClick={() => remove(c.id)} title={tr('campaigns.delete', 'Delete')} style={{ background: 'transparent', border: '1px solid rgba(252,165,165,.3)', color: '#fca5a5', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>✕</button>
                </div>
              </div>

              {/* Funnel metrics */}
              <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 14 }}>
                {!isEditing ? (
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Metric label={tr('campaigns.sent', 'Sent')} value={m.sent || 0} />
                    <Metric label={tr('campaigns.opened', 'Opened')} value={m.opened || 0} rate={pct(m.opened || 0, m.sent || 0)} />
                    <Metric label={tr('campaigns.clicked', 'Clicked')} value={m.clicked || 0} rate={pct(m.clicked || 0, m.opened || 0)} />
                    <Metric label={tr('campaigns.converted', 'Converted')} value={m.converted || 0} rate={pct(m.converted || 0, m.clicked || 0)} />
                    <Metric label={tr('campaigns.spend', 'Spend')} value={m.spend || 0} prefix="$" />
                    <Metric label={tr('campaigns.revenue', 'Revenue')} value={m.revenue || 0} prefix="$" />
                    <button onClick={() => { setEditing(c.id); setDraftMetrics({ ...m }) }} className="sb-button-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>
                      {tr('campaigns.editMetrics', 'Update metrics')}
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10 }}>
                      {(['sent', 'opened', 'clicked', 'converted', 'spend', 'revenue'] as const).map(key => (
                        <label key={key} style={{ fontSize: 12, color: 'rgba(255,255,255,.7)' }}>
                          {tr(`campaigns.${key}`, key)}
                          <input
                            type="number" min={0}
                            className="sb-input"
                            style={{ padding: 8, marginTop: 4, width: '100%', boxSizing: 'border-box' }}
                            value={(draftMetrics as any)[key] ?? ''}
                            onChange={e => setDraftMetrics(d => ({ ...d, [key]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                          />
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                      <button onClick={() => saveMetrics(c.id)} className="sb-button-primary" style={{ fontSize: 13, padding: '8px 18px' }}>{tr('campaigns.save', 'Save')}</button>
                      <button onClick={() => setEditing(null)} className="sb-button-secondary" style={{ fontSize: 13, padding: '8px 18px' }}>{tr('campaigns.cancel', 'Cancel')}</button>
                    </div>
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </main>
  )
}

function Metric({ label, value, rate, prefix }: { label: string; value: number; rate?: number | null; prefix?: string }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{prefix || ''}{value}{rate !== null && rate !== undefined ? <span style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', fontWeight: 600 }}> · {rate}%</span> : null}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>{label}</div>
    </div>
  )
}
