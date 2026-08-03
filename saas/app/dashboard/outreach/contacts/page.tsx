// saas/app/dashboard/outreach/contacts/page.tsx
'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import {
  outreachContactsCopyFor,
  type OutreachReleaseStatus as Status,
} from '@/lib/i18n/outreachReleaseCopy'

type Filter = 'all' | Status

type Lead = {
  id: string
  business_name?: string
  business_url?: string
  source_platform?: string
  status?: Status
  outreach_message?: string
  // What the send route will actually email — the draft plus the team signature and
  // the platform link. Falls back to the raw draft for any row the API predates.
  outbound_message?: string
  contact_email?: string | null
  created_at?: string
}

const FILTERS: Filter[] = ['all', 'pending', 'approved', 'sent', 'rejected', 'archived']
const COLORS: Record<Status, string> = { pending: '#fde68a', approved: '#86efac', sent: '#7dd3fc', rejected: '#fca5a5', archived: '#9ca3af' }

function fill(template: string, values: Record<string, number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template)
}

export default function OutreachContactsPage() {
  const { lang } = useI18n()
  const copy = outreachContactsCopyFor(lang)
  const [leads, setLeads] = useState<Lead[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [duplicateId, setDuplicateId] = useState('')
  const [busyId, setBusyId] = useState('')
  const [batchBusy, setBatchBusy] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // WHY A PER-ROW MESSAGE EXISTS AT ALL. Every failure used to be reported in one banner at
  // the TOP of the page. Acting on a row below the fold — and the list paginates at three, so
  // most rows are below it — put the explanation somewhere the operator never looked. The
  // reported symptom was "the delete button does not work": the confirmation appeared, the row
  // stayed, and the reason was on screen but two thousand pixels away. A control that reports
  // its outcome somewhere the operator is not looking is indistinguishable from a broken one.
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)
  const [page, setPage] = useState(0)
  const pageSize = 3

  // A request with no deadline can hang indefinitely — a dropped connection or a
  // suspended tab leaves the promise unsettled, `finally` never runs, and the screen
  // sits on "Loading contacts…" forever with no error and no way out. This one was
  // observed stuck for three hours. Thirty seconds is far longer than the query needs.
  const LOAD_TIMEOUT_MS = 30_000

  async function remove(id: string) {
    if (!window.confirm(copy.deleteConfirm)) return
    setBusyId(id)
    setError('')
    setNotice('')
    setRowError(null)
    try {
      const response = await fetch(`/api/outreach/queue?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
      // A gateway error or a crash returns HTML rather than JSON, so a blind parse throws a
      // syntax error that describes nothing. Same defence the load path already uses.
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        // The two refusals that are not faults and deserve their own words: an already-sent
        // message keeps its record as evidence, and a row someone else removed is already gone.
        if (response.status === 409 || data?.sent) throw new Error(data?.error || copy.deleteSentBlocked)
        if (response.status === 404) throw new Error(data?.error || copy.updateError)
        throw new Error(data?.error || `${copy.updateError} [${response.status}]`)
      }

      // Drop it locally as well as reloading. The reload is authoritative, but removing the row
      // immediately means the operator sees the result of their click rather than a list that
      // looks unchanged while a request is in flight.
      setLeads(current => current.filter(item => item.id !== id))
      await load()
    } catch (reason: any) {
      const message = reason?.message || copy.updateError
      // Both places on purpose: at the row, where the operator is looking, and in the banner,
      // which survives a re-render of the list.
      setRowError({ id, message })
      setError(message)
    } finally {
      setBusyId('')
    }
  }

  async function load() {
    setLoading(true)
    setError('')
    const controller = new AbortController()
    const deadline = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS)
    try {
      const response = await fetch('/api/outreach/queue?limit=100', { cache: 'no-store', credentials: 'include', signal: controller.signal })
      // A gateway error or a crash returns HTML, not JSON. Parsing it blindly threw a
      // syntax error that told the operator nothing about what actually failed.
      const raw = await response.text()
      let data: any = null
      try { data = JSON.parse(raw) } catch { data = null }
      if (!response.ok) throw new Error(data?.error || `${copy.loadError} [${response.status}]`)
      if (!data) throw new Error(`${copy.loadError} [${response.status}]`)
      setLeads(Array.isArray(data?.outreach) ? data.outreach : [])
    } catch (reason: any) {
      const timedOut = reason?.name === 'AbortError'
      setError(timedOut ? `${copy.loadError} [timeout]` : (reason?.message || copy.loadError))
      setLeads([])
    } finally {
      clearTimeout(deadline)
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  const visible = useMemo(
    () => filter === 'all' ? leads : leads.filter(row => (row.status || 'pending') === filter),
    [filter, leads],
  )
  const counts = useMemo(() => ({
    all: leads.length,
    pending: leads.filter(row => (row.status || 'pending') === 'pending').length,
    approved: leads.filter(row => row.status === 'approved').length,
    sent: leads.filter(row => row.status === 'sent').length,
    rejected: leads.filter(row => row.status === 'rejected').length,
  }), [leads])
  const pages = Math.max(1, Math.ceil(visible.length / pageSize))

  // Keep the reader where they were. Approving row 13 of 100 used to jump the list
  // back to page 1 (and switch tabs), so working through a queue three rows at a time
  // meant clicking Next four times after every single decision. The only legitimate
  // reason to move the page is that the page stopped existing — when a filter change
  // or a decision shrinks the list past the current position, clamp to the last page.
  useEffect(() => {
    setPage(current => (current > pages - 1 ? Math.max(0, pages - 1) : current))
  }, [pages])

  async function decide(id: string, status: 'approved' | 'rejected' | 'archived', force = false) {
    setBusyId(id)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/outreach/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, force }),
      })
      const data = await response.json()
      if (!response.ok || !data?.outreach) throw new Error(data?.error || copy.updateError)

      // A duplicate-recipient refusal is not a failure to report as an error: it is the
      // guard working. Offer the deliberate override instead.
      if (data?.release?.duplicateRecipient) { setDuplicateId(id); setNotice(data.release.error || copy.duplicateRecipient) }
      else if (status === 'archived') setNotice(copy.archived)
      else if (status === 'rejected') setNotice(copy.rejectedNotice)
      else if (data?.release?.ok && data?.release?.alreadySent) setNotice(copy.alreadySent)
      else if (data?.release?.ok) setNotice(copy.sentNotice)
      else setNotice(`${copy.notSent}${data?.release?.error ? ` ${data.release.error}` : ''}`)

      // Deliberately does NOT switch filter or reset the page: the notice above
      // already reports what happened, and the owner is mid-way through a queue.
      await load()
    } catch (reason: any) {
      setError(reason?.message || copy.updateError)
    } finally {
      setBusyId('')
    }
  }

  async function sendBatch() {
    if (!counts.approved) {
      setNotice(copy.noBatch)
      return
    }
    if (!window.confirm(copy.batchConfirm)) return

    setBatchBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/admin/outreach/send-ready?send=1&limit=10', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !data?.ok) throw new Error(data?.error || copy.updateError)
      setNotice(fill(copy.batchDone, { sent: data.sent || 0, skipped: data.skipped || 0 }))
      // Same reasoning as decide(): report the result, keep their position.
      await load()
    } catch (reason: any) {
      setError(reason?.message || copy.updateError)
    } finally {
      setBatchBusy(false)
    }
  }

  return (
    <main style={{ color: 'var(--text-primary)' }}>
      <header className="sb-console" style={{ paddingBottom: 12 }}>
        <div className="sb-console__row">
          <div>
            <span className="sb-eyebrow">🗂️ {copy.eyebrow}</span>
            <h1 style={{ fontSize: 22, margin: '4px 0' }}>{copy.title}</h1>
            <p className="sb-caption" style={{ maxWidth: 760 }}>{copy.subtitle}</p>
          </div>
          <div style={{ display: 'grid', gap: 10, justifyItems: 'end' }}>
            <div className="sb-telemetry" style={{ marginTop: 0, borderTop: 0 }}>
              {FILTERS.map(key => (
                <div key={key} style={{ paddingTop: 0 }}>
                  <b style={{ color: key === 'all' ? '#ffc300' : key === 'rejected' ? COLORS.rejected : key === 'sent' ? COLORS.sent : undefined }}>{counts[key]}</b>
                  <span>{copy[key]}</span>
                </div>
              ))}
            </div>
            <div className="sb-cta-row">
              <button type="button" className="sb-button-primary" disabled={batchBusy || !counts.approved} onClick={() => void sendBatch()}>{batchBusy ? copy.batching : copy.batch}</button>
              <Link className="sb-button-secondary" href="/admin/outreach/delivery">📬 {copy.delivery}</Link>
              <Link className="sb-button-primary" href="/dashboard/outreach/discovery">{copy.discover}</Link>
            </div>
          </div>
        </div>
      </header>

      <div className="sb-cta-row" style={{ marginBottom: 16 }}>
        {FILTERS.map(key => (
          <button key={key} type="button" className={filter === key ? 'sb-button-primary' : 'sb-button-secondary'} onClick={() => { setFilter(key); setPage(0) }}>{copy[key]}</button>
        ))}
      </div>

      {notice ? <div className="sb-ai-feedback" style={{ marginBottom: 14 }}><strong>{notice}</strong></div> : null}
      {loading ? <p className="sb-body">{copy.loading}</p> : null}
      {error ? (
        <p role="alert" className="sb-caption" style={{ color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{error}</span>
          <button type="button" className="sb-button-secondary" onClick={() => { void load() }} style={{ padding: '4px 12px', fontSize: 12 }}>{copy.retry}</button>
        </p>
      ) : null}
      {!loading && !error && !visible.length ? (
        <div className="sb-empty">
          <p className="sb-body">{copy.empty}</p>
          <Link className="sb-button-primary" href="/dashboard/outreach/discovery">{copy.analyze}</Link>
        </div>
      ) : null}

      <section style={{ display: 'grid', gap: 12 }}>
        {visible.slice(page * pageSize, page * pageSize + pageSize).map(lead => {
          const status = lead.status || 'pending'
          const busy = busyId === lead.id
          return (
            <article key={lead.id} style={{ borderTop: '1px solid rgba(255,255,255,.07)', borderLeft: `2px solid ${COLORS[status]}`, padding: '12px 0 12px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h2 className="sb-h3" style={{ margin: 0 }}>
                    {lead.business_name || copy.unnamed}
                    <span title={lead.id} style={{ marginLeft: 8, fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,.45)', fontWeight: 400 }}>#{String(lead.id).slice(0, 8)}</span>
                  </h2>
                  {lead.business_url ? <a href={lead.business_url} target="_blank" rel="noreferrer" className="sb-caption" style={{ color: '#7dd3fc' }}>{lead.business_url}</a> : null}
                  <p className="sb-caption" style={{ color: lead.contact_email ? '#1af0ff' : '#f59e0b', fontWeight: 700 }}>{lead.contact_email ? `${copy.recipient}: ${lead.contact_email}` : copy.noRecipient}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {lead.source_platform === 'strategist' ? <span style={{ color: '#c4b5fd' }}>{copy.strategist}</span> : null}
                  <span style={{ border: `1px solid ${COLORS[status]}`, color: COLORS[status], borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 800 }}>{copy.statuses[status]}</span>
                </div>
              </div>

              {lead.outreach_message ? (
                <div>
                  <p className="sb-body" style={expandedId === lead.id ? { whiteSpace: 'pre-wrap' } : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{lead.outbound_message || lead.outreach_message}</p>
                  <button type="button" onClick={() => setExpandedId(expandedId === lead.id ? null : lead.id)} style={{ background: 'none', border: 0, color: '#7dd3fc', cursor: 'pointer' }}>{expandedId === lead.id ? copy.hide : copy.show}</button>
                </div>
              ) : null}

              <div className="sb-cta-row" style={{ marginTop: 10 }}>
                <button type="button" className="sb-button-primary" disabled={busy || status === 'sent' || !lead.contact_email} onClick={() => void decide(lead.id, 'approved')}>{status === 'sent' ? copy.sent : status === 'approved' ? copy.sendApproved : copy.approveSend}</button>
                <button type="button" className="sb-button-secondary" disabled={busy || status === 'sent' || status === 'rejected'} onClick={() => void decide(lead.id, 'rejected')}>{status === 'rejected' ? copy.rejected : copy.reject}</button>
                {duplicateId === lead.id ? (
                  <button type="button" className="sb-button-primary" disabled={busy} onClick={() => { setDuplicateId(''); void decide(lead.id, 'approved', true) }}>{copy.sendAnyway}</button>
                ) : null}
                <button type="button" className="sb-button-secondary" disabled={busy || status === 'archived'} onClick={() => void decide(lead.id, 'archived')}>{status === 'archived' ? copy.archived : copy.archive}</button>
                {/*
                  ENABLED ON A SENT ROW ON PURPOSE. It used to be disabled there, which is
                  correct policy expressed as a dead control: the operator clicks, nothing
                  happens, and nothing says why. Now the click is allowed and the refusal
                  explains itself beside the row. The record is still never deleted — the API
                  refuses it, which is where that rule belongs.
                */}
                <button type="button" className="sb-button-secondary" disabled={busy} onClick={() => { if (status === 'sent') { setRowError({ id: lead.id, message: copy.deleteSentBlocked }); return } void remove(lead.id) }} style={{ color: '#fca5a5' }}>{copy.deleteLabel}</button>
                <Link className="sb-button-secondary" href="/dashboard/outreach/outreach">{copy.openEngine}</Link>
              </div>

              {rowError && rowError.id === lead.id ? (
                <p role="alert" className="sb-caption" style={{ margin: '8px 0 0', color: '#fca5a5', fontWeight: 700 }}>{rowError.message}</p>
              ) : null}
            </article>
          )
        })}
      </section>

      {pages > 1 ? (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16 }}>
          <button type="button" className="sb-button-secondary" disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>{copy.previous}</button>
          <span>{page + 1} / {pages}</span>
          <button type="button" className="sb-button-secondary" disabled={page + 1 >= pages} onClick={() => setPage(value => Math.min(pages - 1, value + 1))}>{copy.next}</button>
        </div>
      ) : null}
    </main>
  )
}
