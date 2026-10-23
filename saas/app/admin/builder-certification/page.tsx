'use client'

import { useEffect, useRef, useState } from 'react'

type Standing = { ok?: boolean; summary?: { earnedLevel?: number; attempts?: number }; cases?: Array<{ id: string; level: number; purpose: string }>; error?: string }
type Job = { jobId?: string; status?: string; reply?: string; error?: string; progress?: { phase?: string; claimGeneration?: number; filesWritten?: number | null; lastTest?: { passed?: boolean; testsPassed?: number; testsFailed?: number } | null }; certification?: string }

const CASE_ID = 'builder_v2_end_to_end_reliability_v1'
const ACTIVE = new Set(['queued', 'running', 'paused'])
const STORAGE_KEY = 'builder-owner-level4-job-v1'

export default function OwnerBuilderCertificationPage() {
  const [standing, setStanding] = useState<Standing | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [jobId, setJobId] = useState('')
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) setJobId(saved)
    fetch('/api/admin/builder-certification', { cache: 'no-store' })
      .then(async response => {
        const result = await response.json() as Standing
        if (!response.ok || !result.ok) throw new Error(result.error || 'Certification status unavailable')
        setStanding(result)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Unable to read certification status'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!jobId) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const response = await fetch('/api/builder?jobId=' + encodeURIComponent(jobId) + '&observeOnly=true', { cache: 'no-store' })
        const result = await response.json() as Job
        if (!response.ok) throw new Error(result.error || 'Could not read Builder job')
        if (!active) return
        setJob(result)
        setError('')
        if (ACTIVE.has(result.status || '')) timer = setTimeout(poll, 4000)
      } catch (e) {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Job status unavailable')
        timer = setTimeout(poll, 10000)
      }
    }
    void poll()
    return () => { active = false; if (timer) clearTimeout(timer) }
  }, [jobId])

  async function start() {
    if (inFlight.current || starting || (jobId && ACTIVE.has(job?.status || 'queued'))) return
    if (!window.confirm('Start one live Level 4 Builder V2 test? This creates a real job and may incur inference costs.')) return
    inFlight.current = true
    setStarting(true)
    setError('')
    try {
      const response = await fetch('/api/admin/builder-certification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: CASE_ID }),
      })
      const result = await response.json() as Job
      if (!response.ok || !result.jobId) throw new Error(result.error || 'Certification job was not accepted')
      sessionStorage.setItem(STORAGE_KEY, result.jobId)
      setJob(result)
      setJobId(result.jobId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to submit certification job')
    } finally {
      inFlight.current = false
      setStarting(false)
    }
  }

  const current = standing?.cases?.some(c => c.id === CASE_ID)
  const busy = starting || (Boolean(jobId) && (job === null || ACTIVE.has(job.status || '')))
  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px', display: 'grid', gap: 20 }}>
      <a href="/dashboard/developer">← Builder workspace</a>
      <h1>Builder V2 · Live certification</h1>
      <p>This is the owner-only Level 4 test. The API controls access. A completed job is not automatically Level 4 certified: checkpoint, recovery, and PR evidence must also be independently verified.</p>
      {loading ? <p>Reading certification status…</p> : (
        <p>Earned level: <strong>{standing?.summary?.earnedLevel ?? 'Unknown'}</strong> · Recorded attempts: <strong>{standing?.summary?.attempts ?? 'Unknown'}</strong></p>
      )}
      {error ? <p role="alert" style={{ color: '#fca5a5' }}>{error}</p> : null}
      {current ? (
        <button type="button" onClick={() => void start()} disabled={busy || !standing?.ok}
          style={{ padding: '12px 18px', justifySelf: 'start', cursor: busy ? 'not-allowed' : 'pointer' }}>
          {starting ? 'Submitting…' : busy ? 'Level 4 job active' : 'Run one Level 4 test'}
        </button>
      ) : !loading ? <p>Level 4 is not available on this deployment.</p> : null}
      {jobId ? (
        <section aria-live="polite" style={{ padding: 18, border: '1px solid currentColor', borderRadius: 8 }}>
          <h2>Last submitted Level 4 job</h2>
          <p>Job ID: <code>{jobId}</code></p>
          <p>Status: <strong>{job?.status || 'Checking…'}</strong></p>
          {job?.progress ? <p>Phase: {job.progress.phase || 'Unknown'} · Claim: {job.progress.claimGeneration ?? '–'} · Files: {job.progress.filesWritten ?? '–'} · Passing tests: {job.progress.lastTest?.testsPassed ?? '–'}</p> : null}
          {job?.reply ? <p style={{ whiteSpace: 'pre-wrap' }}>{job.reply}</p> : null}
          <a href={'/dashboard/developer?jobId=' + encodeURIComponent(jobId)}>Open Builder workspace</a>
        </section>
      ) : null}
    </main>
  )
}
