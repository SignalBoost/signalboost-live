// saas/app/dashboard/marketing/press-drafts/page.tsx
'use client'

// PRESS DRAFTS — ONE PAGE, ONE JOB.
//
// The owner asked for this in as many words: "i need a page only for the press & media
// draft - like there is only for the email draft, nothing else." He is describing
// /dashboard/outreach/contacts, which does exactly one thing — show the drafts and let
// him decide on them — and comparing it to the press cockpit, which does five things at
// once and shows the drafts last.
//
// So this page is the press twin of Contacts. Deliberately nothing else on it: no
// provider connection forms, no company-facts editor, no platform statistics. Those are
// setup, they live in the cockpit, and setup is a thing you finish. An approval queue is
// a thing you return to daily, and the two do not belong on one screen.
//
// The vocabulary is imported from the Contacts copy module rather than written again —
// same words, same five languages. Having learned "Pending / Approved / Sent / Rejected"
// once, he should not have to learn a second set of names to approve a press release.
//
// It never sends by itself. Approve & dispatch is the only path out, it is one click on
// one draft, and it is the same governed engine the cockpit calls.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'
import { outreachContactsCopyFor } from '@/lib/i18n/outreachReleaseCopy'

type Campaign = {
  id: string
  status: string
  headline?: string
  publication_name?: string
  editor_contact?: string
  publication_contact?: string
  media_target_type?: string
  content_body?: string
  published_url?: string
}

type Note = { ok: boolean; text: string } | null
type Bucket = 'all' | 'pending' | 'approved' | 'sent' | 'rejected'

const TABS: Bucket[] = ['pending', 'approved', 'sent', 'rejected', 'all']

// Handed-to-provider states are, to the person approving, the same fact as approved:
// the decision is made and the release has left the queue.
function bucketOf(status: string): Exclude<Bucket, 'all'> {
  if (status === 'pending_owner_review') return 'pending'
  if (status === 'rejected') return 'rejected'
  if (status === 'published') return 'sent'
  return 'approved'
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#fde68a', approved: '#86efac', sent: '#7dd3fc', rejected: '#fb923c',
}

function DraftCard({ campaign, onChanged, labels }: { campaign: Campaign; onChanged: () => void; labels: any }) {
  const [open, setOpen] = useState(false)
  const [copy, setCopy] = useState(campaign.content_body || '')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)

  const bucket = bucketOf(campaign.status)
  const color = STATUS_COLOR[bucket] || '#94a3b8'
  // Unfilled facts the generator deliberately left visible rather than inventing. Shown
  // as a warning ABOVE the release, because sending one of these is the mistake this
  // whole screen exists to prevent.
  const gaps = useMemo(
    () => Array.from(new Set((campaign.content_body || '').match(/\[[A-Z][A-Z0-9 _/-]{2,40}\]/g) || [])),
    [campaign.content_body],
  )

  async function act(action: 'dispatch' | 'record_url' | 'save_copy') {
    setBusy(true); setNote(null)
    try {
      const res = await fetch('/api/agency/press-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action,
          campaignId: campaign.id,
          ...(action === 'record_url' ? { publishedUrl: url } : {}),
          ...(action === 'save_copy' ? { contentBody: copy } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || json.reason || labels.errAction)
      setNote({ ok: true, text: action === 'dispatch' ? labels.dispatched : labels.recorded })
      onChanged()
    } catch (err: any) {
      setNote({ ok: false, text: err?.message || labels.errAction })
    } finally { setBusy(false) }
  }

  return (
    <article className="sb-panel" style={{ borderColor: `${color}55`, opacity: bucket === 'rejected' ? 0.6 : 1, display: 'grid', gap: 10 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
        <div>
          <h3 className="sb-heading" style={{ margin: 0, fontSize: 16 }}>{campaign.publication_name || campaign.editor_contact || labels.noContact}</h3>
          <p className="sb-caption" style={{ margin: '4px 0 0' }}>
            {labels.recipient}: {campaign.editor_contact || campaign.publication_contact || labels.noContact}
          </p>
          {campaign.headline ? <p className="sb-caption" style={{ margin: '6px 0 0', opacity: 0.75 }}>{campaign.headline}</p> : null}
        </div>
        <span style={{ color, fontWeight: 850, fontSize: 12, whiteSpace: 'nowrap' }}>{labels.statuses[bucket] || bucket}</span>
      </header>

      {gaps.length ? <p style={{ color: '#fb923c', fontSize: 12, fontWeight: 850, margin: 0 }}>{labels.gaps} {gaps.join(' ')}</p> : null}

      <div className="sb-cta-row">
        {bucket === 'pending' ? (
          <>
            <button type="button" className="sb-button-secondary" onClick={() => setOpen((v) => !v)}>{open ? labels.hide : labels.show}</button>
            <button type="button" className="sb-button-primary" disabled={busy} onClick={() => void act('dispatch')}>{busy ? labels.working : labels.approve}</button>
          </>
        ) : null}
        {campaign.published_url ? (
          <a className="sb-button-secondary" href={campaign.published_url} target="_blank" rel="noreferrer">{labels.openLink}</a>
        ) : bucket === 'rejected' ? null : (
          <>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={labels.recordUrl} className="sb-input" style={{ maxWidth: 260 }} />
            <button type="button" className="sb-button-secondary" disabled={busy || !/^https?:\/\//i.test(url)} onClick={() => void act('record_url')}>{busy ? labels.working : labels.record}</button>
          </>
        )}
      </div>

      {open ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {/* The release reads like a document, not a form field crammed into a card: full
              width, generous line height, and tall enough that an owner can judge the whole
              piece without scrolling a letterbox. This mirrors the email outreach queue,
              which is the surface the owner already trusts. */}
          <textarea value={copy} onChange={(e) => setCopy(e.target.value)} rows={22} className="sb-input" style={{ resize: 'vertical', fontSize: 14, lineHeight: 1.65, width: '100%', maxWidth: 'none', padding: '16px 18px' }} />
          <div className="sb-cta-row">
            <button type="button" className="sb-button-secondary" disabled={busy || !copy.trim()} onClick={() => void act('save_copy')}>{busy ? labels.working : labels.saveCopy}</button>
          </div>
        </div>
      ) : null}

      {note ? <p className="sb-caption" style={{ color: note.ok ? '#22c55e' : '#fca5a5', margin: 0 }}>{note.text}</p> : null}
    </article>
  )
}

export default function PressDraftsPage() {
  const { lang } = useI18n()
  const queue = outreachContactsCopyFor(lang)
  const labels = {
    ...queue,
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
    gaps: uiText('generatedUi.u_d17f5a09efdf59c8'),
    title: uiText('generatedUi.u_96b03fffbcb2271e'),
    refresh: uiText('generatedUi.u_0e91610117029a62'),
  }

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [filter, setFilter] = useState<Bucket>('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/agency/press-media', { cache: 'no-store', credentials: 'include' })
      const json = await res.json().catch(() => ({ ok: false }))
      if (!res.ok || !json.ok) throw new Error(json.error || labels.errLoad)
      setCampaigns(Array.isArray(json.campaigns) ? json.campaigns : [])
    } catch (err: any) {
      setError(err?.message || labels.errLoad)
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: campaigns.length, pending: 0, approved: 0, sent: 0, rejected: 0 }
    for (const c of campaigns) base[bucketOf(c.status)] += 1
    return base
  }, [campaigns])

  const visible = useMemo(
    () => (filter === 'all' ? campaigns : campaigns.filter((c) => bucketOf(c.status) === filter)),
    [campaigns, filter],
  )

  return (
    <main className="sb-page" style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 22px', display: 'grid', gap: 16 }}>
      <header style={{ display: 'grid', gap: 10 }}>
        <h1 className="sb-heading" style={{ margin: 0 }}>{labels.title}</h1>
        <div className="sb-cta-row">
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              className={filter === key ? 'sb-button-primary' : 'sb-button-secondary'}
              onClick={() => setFilter(key)}
            >{queue[key]} · {counts[key]}</button>
          ))}
          <button type="button" className="sb-button-secondary" onClick={() => void load()}>{loading ? queue.loading : labels.refresh}</button>
        </div>
      </header>

      {error ? <p role="alert" className="sb-caption" style={{ color: '#fca5a5' }}>{error}</p> : null}

      <section style={{ display: 'grid', gap: 12 }}>
        {visible.map((c) => <DraftCard key={c.id} campaign={c} onChanged={load} labels={labels} />)}
        {/* An empty view is a state, not a blank screen — say which view is empty and where
            new drafts come from, so the page is never a dead end. */}
        {!loading && !visible.length ? (
          <div className="sb-panel" style={{ display: 'grid', gap: 10, justifyItems: 'start' }}>
            <p className="sb-body" style={{ margin: 0 }}>{queue.empty}</p>
            <Link className="sb-button-secondary" href="/dashboard/marketing/press-providers">{uiText('generatedUi.u_f5c310e7295dd07d')}</Link>
          </div>
        ) : null}
      </section>
    </main>
  )
}
