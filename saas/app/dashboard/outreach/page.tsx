'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/components/i18n/I18nProvider'
import {
  outreachCopyFor,
  type OutreachChannelKey,
} from '@/lib/i18n/outreachCopy'

type Lead = {
  id: string
  business_name?: string
  business_url?: string
  status?: 'pending' | 'approved' | 'rejected' | 'sent'
  created_at?: string
  channel?: string
  outreach_channel?: string
  campaign_channel?: string
  media_channel?: string
  metadata?: {
    channel?: string
    outreach_channel?: string
    campaign_channel?: string
  }
}

type ToolCard = {
  icon: string
  key: 'discovery' | 'approvals' | 'pipeline' | 'engine' | 'monitor'
  href: string
  accent: string
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#fde68a',
  approved: '#86efac',
  rejected: '#fca5a5',
  sent: '#7dd3fc',
}

const TOOL_CARDS: ToolCard[] = [
  { icon: '🔎', key: 'discovery', href: '/dashboard/outreach/discovery', accent: '#ffc300' },
  { icon: '✅', key: 'approvals', href: '/dashboard/outreach/contacts', accent: '#1af0ff' },
  { icon: '📊', key: 'pipeline', href: '/dashboard/outreach/pipeline', accent: '#7dd3fc' },
  { icon: '⚙️', key: 'engine', href: '/dashboard/outreach/outreach', accent: '#a78bfa' },
  { icon: '🛰️', key: 'monitor', href: '/admin/outreach', accent: '#86efac' },
]

const CHANNEL_CARDS: Array<{
  key: OutreachChannelKey
  icon: string
  href: string
}> = [
  { key: 'email', icon: '📧', href: '/dashboard/outreach/discovery?channel=email' },
  { key: 'social', icon: '💬', href: '/dashboard/outreach/social' },
  { key: 'video', icon: '🎥', href: '/dashboard/cosa/video-pipeline' },
  { key: 'onlinePress', icon: '📰', href: '/dashboard/marketing/press-outreach' },
  { key: 'printPress', icon: '🗞️', href: '/dashboard/marketing/press-print?channel=print-newspapers' },
  { key: 'tradePress', icon: '🧾', href: '/dashboard/marketing/press-print?channel=trade-press' },
  { key: 'manual', icon: '🤝', href: '/admin/outreach' },
]

function leadChannel(lead: Lead): string {
  return (
    lead.channel
    || lead.outreach_channel
    || lead.campaign_channel
    || lead.media_channel
    || lead.metadata?.channel
    || lead.metadata?.outreach_channel
    || lead.metadata?.campaign_channel
    || ''
  )
}

export default function OutreachHubPage() {
  return (
    <Suspense fallback={<main style={{ color: 'var(--text-primary)' }} />}>
      <OutreachHubContent />
    </Suspense>
  )
}

function OutreachHubContent() {
  const { lang } = useI18n()
  const copy = outreachCopyFor(lang)
  const searchParams = useSearchParams()
  const selectedChannel = searchParams.get('channel') || ''
  const [leads, setLeads] = useState<Lead[]>([])
  const [sendLimit, setSendLimit] = useState<{ remaining?: number; limit?: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const response = await fetch('/api/outreach/queue?limit=100', { cache: 'no-store' })
        const data = await response.json()

        if (!active) return
        if (!response.ok) {
          setError(data?.error || copy.loadError)
          setLeads([])
          return
        }

        setLeads(Array.isArray(data?.outreach) ? data.outreach : [])
        setSendLimit(data?.sendLimit ?? null)
      } catch {
        if (active) {
          setError(copy.genericLoadError)
          setLeads([])
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [copy.genericLoadError, copy.loadError])

  const scopedLeads = useMemo(
    () => selectedChannel
      ? leads.filter((lead) => leadChannel(lead) === selectedChannel)
      : leads,
    [leads, selectedChannel],
  )

  const count = (status: string) =>
    scopedLeads.filter((lead) => (lead.status || 'pending') === status).length

  const stats = [
    { label: copy.totalLeads, value: scopedLeads.length, accent: '#f8fafc' },
    { label: copy.pending, value: count('pending'), accent: STATUS_COLOR.pending },
    { label: copy.approved, value: count('approved'), accent: STATUS_COLOR.approved },
    { label: copy.rejected, value: count('rejected'), accent: STATUS_COLOR.rejected },
  ]

  const remaining = typeof sendLimit?.remaining === 'number' ? sendLimit.remaining : null
  const dailyLimit = typeof sendLimit?.limit === 'number' ? sendLimit.limit : null
  const recent = scopedLeads.slice(0, 6)

  return (
    <main style={{ color: 'var(--text-primary)', display: 'grid', gap: 22 }}>
      <header
        className="sb-console"
        style={{
          height: 'auto',
          maxHeight: 'none',
          overflowY: 'visible',
          background: 'linear-gradient(145deg, rgba(3,7,18,.96), rgba(15,23,42,.84))',
        }}
      >
        <span className="sb-eyebrow">📡 {copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p className="sb-body" style={{ maxWidth: 920 }}>{copy.subtitle}</p>
        <p style={definitionStyle}>{copy.definition}</p>
        <p style={approvalStyle}>🛡️ {copy.approvalNotice}</p>

        {selectedChannel ? (
          <p className="sb-caption" style={{ color: '#7dd3fc', marginTop: 12 }}>
            {copy.selectedChannel}: {selectedChannel}
          </p>
        ) : null}

        <div className="sb-telemetry">
          {stats.map((stat) => (
            <div key={stat.label}>
              <b style={{ color: stat.accent }}>{stat.value}</b>
              <span>{stat.label}</span>
            </div>
          ))}
          {remaining !== null && dailyLimit !== null ? (
            <div>
              <b className="gold">{remaining}/{dailyLimit}</b>
              <span>{copy.sendsLeft}</span>
            </div>
          ) : null}
        </div>
      </header>

      <section style={twoColumnGrid} aria-label={copy.aiModeTitle}>
        <article style={{ ...panelStyle, borderColor: 'rgba(26,240,255,.34)' }}>
          <span className="sb-eyebrow">🤖 {copy.aiModeTitle}</span>
          <h2 className="sb-h3" style={{ marginTop: 10 }}>{copy.aiModeTitle}</h2>
          <p className="sb-body">{copy.aiModeBody}</p>
          <div style={promptStyle}>
            <strong>{copy.aiModePromptLabel}</strong>
            <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{copy.aiModePrompt}</p>
          </div>
          <Link href="/dashboard/assistant" className="sb-button-primary" style={buttonLinkStyle}>
            {copy.aiModeCta}
          </Link>
        </article>

        <article style={{ ...panelStyle, borderColor: 'rgba(255,195,0,.34)' }}>
          <span className="sb-eyebrow">🤝 {copy.manualModeTitle}</span>
          <h2 className="sb-h3" style={{ marginTop: 10 }}>{copy.manualModeTitle}</h2>
          <p className="sb-body">{copy.manualModeBody}</p>
          <Link href="/admin/outreach" className="sb-button-primary" style={buttonLinkStyle}>
            {copy.manualModeCta}
          </Link>
        </article>
      </section>

      <section style={panelStyle}>
        <span className="sb-eyebrow">{copy.workflowTitle}</span>
        <h2 className="sb-h3" style={{ marginTop: 10 }}>{copy.workflowTitle}</h2>
        <ol style={{ margin: '14px 0 0', paddingLeft: 22, lineHeight: 1.8, color: 'rgba(248,250,252,.78)' }}>
          {copy.workflowSteps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </section>

      <section aria-label={copy.toolsTitle}>
        <h2 className="sb-h3">{copy.toolsTitle}</h2>
        <div style={cardGrid}>
          {TOOL_CARDS.map((tool) => {
            const item = copy.tools[tool.key]
            return (
              <Link
                key={tool.key}
                href={tool.href}
                style={{
                  ...linkCardStyle,
                  borderLeftColor: tool.accent,
                }}
              >
                <span aria-hidden style={{ fontSize: 22 }}>{tool.icon}</span>
                <h3 style={{ margin: '8px 0 5px', color: '#fff', fontSize: 16 }}>{item.title}</h3>
                <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{item.description}</p>
              </Link>
            )
          })}
        </div>
      </section>

      <section aria-label={copy.channelsTitle}>
        <h2 className="sb-h3">{copy.channelsTitle}</h2>
        <div style={channelGrid}>
          {CHANNEL_CARDS.map((channel) => {
            const item = copy.channels[channel.key]
            return (
              <Link key={channel.key} href={channel.href} style={channelLinkStyle}>
                <span aria-hidden style={{ fontSize: 21 }}>{channel.icon}</span>
                <span>
                  <strong style={{ color: '#fff' }}>{item.label}</strong>
                  <small style={{ display: 'block', marginTop: 4, color: 'rgba(226,232,240,.68)', lineHeight: 1.45 }}>
                    {item.description}
                  </small>
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      <section style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 className="sb-h3" style={{ margin: 0 }}>{copy.recentLeads}</h2>
          <Link href="/dashboard/outreach/contacts" className="sb-caption" style={{ color: '#7dd3fc' }}>
            {copy.viewAll}
          </Link>
        </div>

        {loading ? <p className="sb-body">{copy.loading}</p> : null}
        {error && !loading ? <p className="sb-caption" style={{ color: '#fca5a5' }}>{error}</p> : null}

        {!loading && recent.length === 0 ? (
          <p className="sb-body">
            {copy.noLeads}{' '}
            <Link href="/dashboard/outreach/discovery" style={{ color: '#7dd3fc' }}>
              {copy.startDiscovery}
            </Link>.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {recent.map((lead) => {
              const status = lead.status || 'pending'
              return (
                <div key={lead.id} style={leadRowStyle}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.business_name || lead.business_url || copy.unnamedBusiness}
                  </span>
                  <span style={{ color: STATUS_COLOR[status] || '#cbd5e1', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                    {copy.statuses[status] || status}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

const twoColumnGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))',
  gap: 16,
}

const cardGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
  gap: 14,
}

const channelGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))',
  gap: 12,
}

const panelStyle: CSSProperties = {
  height: 'auto',
  maxHeight: 'none',
  overflowY: 'visible',
  border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 20,
  padding: 20,
  background: 'linear-gradient(145deg, rgba(3,7,18,.88), rgba(15,23,42,.70))',
  backdropFilter: 'blur(16px)',
}

const linkCardStyle: CSSProperties = {
  display: 'block',
  minHeight: 150,
  height: 'auto',
  maxHeight: 'none',
  overflowY: 'visible',
  border: '1px solid rgba(255,255,255,.10)',
  borderLeft: '3px solid #1af0ff',
  borderRadius: 16,
  padding: 17,
  background: 'rgba(15,23,42,.62)',
  textDecoration: 'none',
}

const channelLinkStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '34px minmax(0,1fr)',
  gap: 10,
  alignItems: 'start',
  height: 'auto',
  maxHeight: 'none',
  overflowY: 'visible',
  border: '1px solid rgba(167,139,250,.22)',
  borderRadius: 15,
  padding: 15,
  background: 'rgba(15,23,42,.56)',
  textDecoration: 'none',
}

const definitionStyle: CSSProperties = {
  maxWidth: 980,
  margin: '14px 0 0',
  padding: '13px 15px',
  borderLeft: '3px solid #a78bfa',
  background: 'rgba(167,139,250,.08)',
  color: 'rgba(248,250,252,.84)',
  lineHeight: 1.65,
}

const approvalStyle: CSSProperties = {
  maxWidth: 980,
  margin: '12px 0 0',
  color: '#bbf7d0',
  fontSize: 13,
  lineHeight: 1.55,
}

const promptStyle: CSSProperties = {
  marginTop: 14,
  padding: 14,
  border: '1px solid rgba(26,240,255,.18)',
  borderRadius: 14,
  background: 'rgba(2,6,23,.48)',
  color: 'rgba(248,250,252,.78)',
  lineHeight: 1.55,
}

const buttonLinkStyle: CSSProperties = {
  display: 'inline-flex',
  marginTop: 16,
  textDecoration: 'none',
}

const leadRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  padding: '11px 0',
  borderBottom: '1px solid rgba(255,255,255,.08)',
}
