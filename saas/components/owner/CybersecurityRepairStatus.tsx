'use client'

import { useEffect, useState } from 'react'

type RepairStatus = Readonly<{
  ok?: boolean
  status?: string
  message?: string
  jobId?: string
  jobStatus?: string
  pullRequestNumber?: number | null
  mergeCommitSha?: string | null
}>

const ACTIVE = new Set(['queued', 'fixing', 'testing', 'paused', 'verifying', 'repair_started', 'starting'])
const FIXED = new Set(['fixed', 'healthy'])
const OWNER_STATUS_EVENT = 'itmounts:cybersecurity-owner-status'

function tone(status: string): string {
  if (status === 'fixed' || status === 'healthy') return 'border-emerald-300/35 bg-emerald-300/10 text-emerald-50'
  if (status === 'failed' || status === 'verification_failed' || status === 'repair_unavailable' || status === 'monitoring_failed') return 'border-red-300/35 bg-red-300/10 text-red-50'
  if (ACTIVE.has(status)) return 'border-cyan-300/35 bg-cyan-300/10 text-cyan-50'
  return 'border-white/15 bg-white/[0.05] text-slate-200'
}

export default function CybersecurityRepairStatus() {
  const [state, setState] = useState<RepairStatus | null>(null)
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: number | null = null
    let ownerCheckStarted = false

    const schedule = (status: string) => {
      if (timer != null) window.clearTimeout(timer)
      if (FIXED.has(status)) return
      timer = window.setTimeout(refresh, ACTIVE.has(status) ? 4_000 : 12_000)
    }

    const startProtectedCheck = async () => {
      if (ownerCheckStarted || cancelled) return
      ownerCheckStarted = true
      setState({ status: 'starting' })
      try {
        const response = await fetch('/api/owner/cybersecurity/remediate', {
          method: 'POST',
          cache: 'no-store',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        })
        const json = await response.json().catch(() => null) as RepairStatus | null
        if (cancelled) return
        const status = String(json?.status || (response.ok ? 'repair_started' : 'repair_unavailable'))
        setState(json || { status })
        schedule(status)
      } catch {
        if (!cancelled) {
          setState({ status: 'monitoring_failed' })
          schedule('monitoring_failed')
        }
      }
    }

    async function refresh() {
      try {
        const response = await fetch('/api/owner/cybersecurity/remediate', { method: 'GET', cache: 'no-store', credentials: 'include', headers: { Accept: 'application/json' } })
        if (response.status === 401 || response.status === 403) {
          if (!cancelled) { setAuthorized(false); setState(null) }
          return
        }
        const json = await response.json().catch(() => null) as RepairStatus | null
        if (cancelled) return
        setAuthorized(true)
        const status = String(json?.status || '')
        if (status === 'idle') {
          void startProtectedCheck()
          return
        }
        setState(json)
        schedule(status)
      } catch {
        if (!cancelled) timer = window.setTimeout(refresh, 12_000)
      }
    }

    const onManualOwnerStatus = (event: Event) => {
      const detail = (event as CustomEvent<RepairStatus | null>).detail
      if (cancelled || !detail) return
      setAuthorized(true)
      setState(detail)
      schedule(String(detail.status || ''))
    }

    window.addEventListener(OWNER_STATUS_EVENT, onManualOwnerStatus)
    void refresh()
    return () => {
      cancelled = true
      window.removeEventListener(OWNER_STATUS_EVENT, onManualOwnerStatus)
      if (timer != null) window.clearTimeout(timer)
    }
  }, [])

  if (authorized !== true || !state || state.status === 'idle') return null
  const status = String(state.status || 'unknown')
  const shortJob = state.jobId ? state.jobId.slice(0, 8) : ''
  const shortCommit = state.mergeCommitSha ? state.mergeCommitSha.slice(0, 8) : ''

  return (
    <section className="mx-auto mt-5 max-w-6xl px-5" aria-live="polite" data-owner-cybersecurity-repair-status={status}>
      <div className={`rounded-2xl border p-5 shadow-lg ${tone(status)}`}>
        <div className="flex flex-wrap items-center gap-2">
          <strong className="rounded-full border border-current/20 px-3 py-1 text-xs font-black uppercase tracking-[0.16em]">{status.replaceAll('_', ' ')}</strong>
          {shortJob ? <code className="text-xs opacity-70">{shortJob}</code> : null}
          {state.pullRequestNumber ? <a className="text-xs font-black underline" href={`https://github.com/SignalBoost/signalboost-live/pull/${state.pullRequestNumber}`}>#{state.pullRequestNumber}</a> : null}
          {shortCommit ? <code className="text-xs opacity-70">{shortCommit}</code> : null}
        </div>
        {state.message ? <p className="mt-3 text-sm font-semibold leading-6">{state.message}</p> : null}
      </div>
    </section>
  )
}
