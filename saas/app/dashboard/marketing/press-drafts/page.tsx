// saas/app/dashboard/marketing/press-drafts/page.tsx
'use client'

// PRESS DRAFTS — ONE PAGE, ONE JOB.
//
// This page is the press twin of the email Contacts queue. It shows drafts and lets the
// owner decide on them; provider setup and company facts remain in the provider cockpit.
//
// Sent and published are deliberately separate. A successful dispatch means the receiving
// provider accepted the submission. Publication is a later, independently evidenced event
// and is recorded only when the real live URL is available.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'
import { outreachContactsCopyFor } from '@/lib/i18n/outreachReleaseCopy'
import {
  pressCampaignBucketOf,
  type PressCampaignBucket,
} from '@/lib/marketing/pressCampaignBuckets'

type Campaign = {
  id: string
  status: string
  dispatch_state?: string
  headline?: string
  publication_name?: string
  editor_contact?: string
  publication_contact?: string
  media_target_type?: string
  content_body?: string
  published_url?: string
}

type Note = { ok: boolean; text: string } | null
type Bucket = PressCampaignBucket

const TABS: Bucket[] = ['pending', 'approved', 'sent', 'published', 'rejected', 'all']

const PUBLISHED_LABELS: Record<string, string> = {
  en: 'Published',
  es: 'Publicado',
  pt: 'Publicado',
  pl: 'Opublikowane',
  ru: 'Опубликовано',
}

const STATUS_COLOR: Record<Exclude<Bucket, 'all'>, string> = {
  pending: '#fde68a',
  approved: '#86efac',
  sent: '#7dd3fc',
  published: '#22c55e',
  rejected: '#fb923c',
}

function tabLabel(key: Bucket, queue: any, published: string): string {
  return key === 'published' ? published : String(queue[key] || key)
}

function DraftCard({ campaign, onChanged, labels }: { campaign: Campaign; onChanged: () => void; labels: any }) {
  const [open, setOpen] = useState(false)
  const [copy, setCopy] = useState(campaign.content_body || '')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)

  const bucket = pressCampaignBucketOf(campaign)
  const color = STATUS_COLOR[bucket]
  const gaps = useMemo(
    () => Array.from(new Set((campaign.content_body || '').match(/\[[A-Z][A-Z0-9 _/-]{2,40}\]/g) || [])),
    [campaign.content_body],
  )

  async function act(action: 'dispatch' | 'record_url' | 'update_copy') {
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch('/api/agency/press-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action,
          campaign_id: campaign.id,
          ...(action === 'record_url' ? { published_url: url } : {}),
          ...(action === 'update_copy' ? { copy } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || json.reason || labels.errAction)
      setNote({
        ok: true,
        text: action === 'dispatch'
          ? labels.dispatched
          : action === 'record_url'
            ? labels.recorded
            : labels.savedCopy,
      })
      onChanged()
    } catch (err: any) {
      setNote({ ok: false, text: err?.message || labels.errAction })
    } finally {
      setBusy(false)
    }
  }

  return (
    <article
      className="sb-panel"
      style={{
        borderColor: `${color}55`,
        opacity: bucket === 'rejected' ? 0.6 : 1,
        display: 'grid',
        gap: 10,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
        <div>
          <h3 className="sb-heading" style={{ margin: 0, fontSize: 16 }}>
            {campaign.publication_name || campaign.editor_contact || labels.noContact}
          </h3>
          <p className="sb-caption" style={{ margin: '4px 0 0' }}>
            {labels.recipient}: {campaign.editor_contact || campaign.publication_contact || labels.noContact}
          </p>
          {campaign.headline ? (
            <p className="sb-caption" style={{ margin: '6px 0 0', opacity: 0.75 }}>
              {campaign.headline}
            </p>
          ) : null}
        </div>
        <span style={{ color, fontWeight: 850, fontSize: 12, whiteSpace: 'nowrap' }}>
          {labels.statuses[bucket] || bucket}
        </span>
      </header>

      {gaps.length ? (
        <p style={{ color: '#fb923c', fontSize: 12, fontWeight: 850, margin: 0 }}>
          {labels.gaps} {gaps.join(' ')}
        </p>
      ) : null}

      <div className="sb-cta-row">
        {bucket === 'pending' ? (
          <>
            <button type="button" className="sb-button-secondary" onClick={() => setOpen((v) => !v)}>
              {open ? labels.hide : labels.show}
            </button>
            <button
              type="button"
              className="sb-button-primary"
              disabled={busy}
              onClick={() => void act('dispatch')}
            >
              {busy ? labels.working : labels.approve}
            </button>
          </>
        ) : null}

        {campaign.published_url ? (
          <a
            className="sb-button-secondary"
            href={campaign.published_url}
            target="_blank"
            rel="noreferrer"
          >
            {labels.openLink}
          </a>
        ) : bucket === 'rejected' ? null : (
          <>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={labels.recordUrl}
              className="sb-input"
              style={{ maxWidth: 260 }}
            />
            <button
              type="button"
              className="sb-button-secondary"
              disabled={busy || !/^https?:\/\//i.test(url)}
              onClick={() => void act('record_url')}
            >
              {busy ? labels.working : labels.record}
            </button>
          </>
        )}
      </div>

      {open ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <textarea
            value={copy}
            onChange={(e) => setCopy(e.target.value)}
            rows={22}
            className="sb-input"
            style={{
              resize: 'vertical',
              fontSize: 14,
              lineHeight: 1.65,
              width: '100%',
              maxWidth: 'none',
              padding: '16px 18px',
            }}
          />
          <div className="sb-cta-row">
            <button
              type="button"
              className="sb-button-secondary"
              disabled={busy || !copy.trim()}
              onClick={() => void act('update_copy')}
            >
              {busy ? labels.working : labels.saveCopy}
            </button>
          </div>
        </div>
      ) : null}

      {note ? (
        <p
          role="status"
          className="sb-body"
          style={{ color: note.ok ? '#22c55e' : '#fca5a5', margin: 0, fontWeight: 750 }}
        >
          {note.text}
        </p>
      ) : null}
    </article>
  )
}

export default function PressDraftsPage() {
  const { lang } = useI18n()
  const queue = outreachContactsCopyFor(lang)
  const publishedLabel = PUBLISHED_LABELS[lang] || PUBLISHED_LABELS.en
  const labels = {
    ...queue,
    statuses: { ...queue.statuses, published: publishedLabel },
    published: publishedLabel,
    approve: uiText('generatedUi.u_05287cb5947ec007'),
    openLink: uiText('generatedUi.u_14269d3cc697c30f'),
    recordUrl: uiText('generatedUi.u_d777b661aaf1cd1c'),
    record: uiText('generatedUi.u_4d824351a59edcac'),
    noContact: uiText('generatedUi.u_004aed77d2a51b49'),
    dispatched: uiText('generatedUi.u_160a54db2e9e66c5'),
    recorded: uiText('generatedUi.u_f1f216cbe0837cce'),
    errAction: uiText('generatedUi.u_f71340014e775e6f'),
    errLoad: uiText('generatedUi.u_06c424b9a52e6aed'),
    working: uiText('generatedUi.u_5474eef8d0f179c7'),
    saveCopy: uiText('generatedUi.u_6b9aff7e65760726'),
    savedCopy: uiText('generatedUi.u_a18751e424e40a4d'),
    gaps: uiText('generatedUi.u_d17f5a09efdf59c8'),
    title: uiText('generatedUi.u_96b03fffbcb2271e'),
    refresh: uiText('generatedUi.u_0e91610117029a62'),
  }

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [filter, setFilter] = useState<Bucket>('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/agency/press-media', {
        cache: 'no-store',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({ ok: false }))
      if (!res.ok || !json.ok) throw new Error(json.error || labels.errLoad)
      setCampaigns(Array.isArray(json.campaigns) ? json.campaigns : [])
    } catch (err: any) {
      setError(err?.message || labels.errLoad)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const counts = useMemo(() => {
    const base: Record<Bucket, number> = {
      all: campaigns.length,
      pending: 0,
      approved: 0,
      sent: 0,
      published: 0,
      rejected: 0,
    }
    for (const campaign of campaigns) base[pressCampaignBucketOf(campaign)] += 1
    return base
  }, [campaigns])

  const visible = useMemo(
    () => filter === 'all'
      ? campaigns
      : campaigns.filter((campaign) => pressCampaignBucketOf(campaign) === filter),
    [campaigns, filter],
  )

  return (
    <main
      className="sb-page"
      style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 22px', display: 'grid', gap: 16 }}
    >
      <header style={{ display: 'grid', gap: 10 }}>
        <h1 className="sb-heading" style={{ margin: 0 }}>{labels.title}</h1>
        <div className="sb-cta-row">
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              className={filter === key ? 'sb-button-primary' : 'sb-button-secondary'}
              onClick={() => setFilter(key)}
            >
              {tabLabel(key, queue, labels.published)} · {counts[key]}
            </button>
          ))}
          <button type="button" className="sb-button-secondary" onClick={() => void load()}>
            {loading ? queue.loading : labels.refresh}
          </button>
        </div>
      </header>

      {error ? (
        <p role="alert" className="sb-caption" style={{ color: '#fca5a5' }}>{error}</p>
      ) : null}

      <section style={{ display: 'grid', gap: 12 }}>
        {visible.map((campaign) => (
          <DraftCard key={campaign.id} campaign={campaign} onChanged={load} labels={labels} />
        ))}

        {!loading && !visible.length ? (
          <div className="sb-panel" style={{ display: 'grid', gap: 10, justifyItems: 'start' }}>
            <p className="sb-body" style={{ margin: 0 }}>{queue.empty}</p>
            <Link className="sb-button-secondary" href="/dashboard/marketing/press-providers">
              {uiText('generatedUi.u_f5c310e7295dd07d')}
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  )
}
