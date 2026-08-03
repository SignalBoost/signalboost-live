// saas/app/dashboard/outreach/campaigns/page.tsx
//
// WHERE A BACKGROUND CAMPAIGN BECOMES VISIBLE.
//
// A campaign was started, a job id was handed back, and then nothing appeared in the outreach
// console. There was no way to tell whether the worker was still finding companies, had failed
// at discovery, or had never been picked up at all — three situations needing three different
// actions, all looking identical from outside.
//
// The worker was recording the answer the whole time. This page reads it.
//
// It starts nothing and sends nothing. The one thing it can do is CANCEL a campaign that is
// still running, because an operator watching a campaign go wrong needs a way to stop it that
// is not "wait".
'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { auditUiText } from '@/lib/i18n/auditUiCopy'

type Result = { name: string; url: string; outcome: string; detail: string; at: string }
type Diagnosis = { headline: string; meaning: string; stalled: boolean }
type Job = {
  id: string
  status: string
  region: string | null
  language: string
  requested_count: number
  processed: number
  drafts_created: number
  skipped: number
  last_error: string | null
  created_at: string
  updated_at: string
  results?: Result[]
  diagnosis?: Diagnosis
  summary?: string
}

const panel: React.CSSProperties = { border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, padding: 18, marginBottom: 16, background: 'rgba(255,255,255,.03)' }
const muted: React.CSSProperties = { color: '#9aa4b9', fontSize: 13, lineHeight: 1.5 }

function tone(job: Job): string {
  if (job.status === 'failed') return '#ff8ca2'
  if (job.diagnosis?.stalled) return '#ffcf7a'
  if (job.status === 'completed') return job.drafts_created ? '#71ffc1' : '#ffcf7a'
  return '#7dd3fc'
}

export default function OutreachCampaignsPage() {
  const { lang } = useTranslation()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  async function load() {
    setError('')
    try {
      const response = await fetch('/api/outreach/campaign-jobs', { cache: 'no-store', credentials: 'include' })
      // A gateway error returns HTML, not JSON; parsing it blindly throws a syntax error that
      // describes nothing about what actually failed.
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || `${auditUiText(lang, 'Request failed')} (${response.status})`)
      setJobs(Array.isArray(data?.jobs) ? data.jobs : [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : auditUiText(lang, 'The request did not complete'))
    } finally {
      setLoading(false)
    }
  }

  async function cancel(id: string) {
    if (!window.confirm(auditUiText(lang, 'Cancel this campaign? Drafts already created are kept.'))) return
    setBusyId(id)
    try {
      const response = await fetch('/api/outreach/campaign-jobs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', id }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || auditUiText(lang, 'The request did not complete'))
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : auditUiText(lang, 'The request did not complete'))
    } finally {
      setBusyId('')
    }
  }

  useEffect(() => {
    void load()
    // A running campaign advances every two minutes, so a page that never refreshes shows a
    // stale answer to the exact question it exists to answer.
    const timer = setInterval(() => void load(), 60_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <main style={{ padding: 24, maxWidth: 980 }}>
      <h1 style={{ marginTop: 0 }}>{auditUiText(lang, 'Background campaigns')}</h1>
      <p style={muted}>
        {auditUiText(lang, 'What each campaign worker is doing, what it has produced, and what stopped it. Drafts appear in Contacts for approval; nothing is ever sent from here.')}
      </p>

      {error ? <p role="alert" style={{ color: '#ffb3c1', fontWeight: 700 }}>{error}</p> : null}
      {loading ? <p style={muted}>{auditUiText(lang, 'Loading…')}</p> : null}
      {!loading && !jobs.length && !error ? (
        <section style={panel}><p style={muted}>{auditUiText(lang, 'No campaigns have been started yet.')}</p></section>
      ) : null}

      {jobs.map(job => (
        <section key={job.id} style={{ ...panel, borderColor: tone(job) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, color: tone(job) }}>{job.diagnosis?.headline || job.status}</h2>
            <span style={{ ...muted, fontFamily: 'ui-monospace, monospace' }}>#{job.id.slice(0, 8)}</span>
          </div>

          <p style={{ margin: '8px 0 0' }}>{job.diagnosis?.meaning}</p>

          <p style={{ ...muted, marginTop: 10 }}>
            {job.region || '—'} · {job.language} · {auditUiText(lang, 'requested')} {job.requested_count} ·{' '}
            {auditUiText(lang, 'processed')} {job.processed} · {auditUiText(lang, 'drafts')} {job.drafts_created} ·{' '}
            {auditUiText(lang, 'skipped')} {job.skipped}
          </p>

          {job.results?.length ? (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', color: '#7dd3fc' }}>{auditUiText(lang, 'What happened to each company')}</summary>
              <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 6 }}>
                {job.results.map(result => (
                  <li key={`${job.id}-${result.url}-${result.at}`} style={muted}>
                    <strong style={{ color: result.outcome === 'drafted' ? '#71ffc1' : result.outcome === 'error' ? '#ff8ca2' : '#ffcf7a' }}>{result.outcome}</strong>{' '}
                    {result.name} — {result.detail}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {['queued', 'discovering', 'running'].includes(job.status) ? (
            <button
              type="button"
              onClick={() => void cancel(job.id)}
              disabled={busyId === job.id}
              style={{ marginTop: 12, border: '1px solid rgba(255,255,255,.2)', background: 'transparent', color: '#fca5a5', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontWeight: 700 }}
            >
              {auditUiText(lang, 'Cancel this campaign')}
            </button>
          ) : null}
        </section>
      ))}
    </main>
  )
}
