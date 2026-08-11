'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { auditUiText } from '@/lib/i18n/auditUiCopy'

type Readiness = {
  ok?: boolean
  enabled?: boolean
  questions?: number
  sourceAdapters?: string[]
  error?: string
}

type LearningResult = {
  ok?: boolean
  curriculumQuestions?: number
  sourceAdapters?: string[]
  result?: {
    gapsConsidered?: number
    documentsAcquired?: number
    accepted?: number
    rejected?: Record<string, number>
    externalCostUsd?: number
  }
  error?: string
}

export default function CosLearningPage() {
  const { lang } = useTranslation()
  const copy = (english: string) => auditUiText(lang, english)
  const [status, setStatus] = useState<Readiness | null>(null)
  const [result, setResult] = useState<LearningResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setError('')
    try {
      const response = await fetch('/api/admin/cos-learning/foundational', { cache: 'no-store' })
      const body = await response.json()
      setStatus(body)
      if (!response.ok) setError(body?.error || copy('Learning request failed.'))
    } catch {
      setError(copy('Learning request failed.'))
    }
  }

  async function run() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/admin/cos-learning/foundational', { method: 'POST' })
      const body = await response.json()
      setResult(body)
      if (!response.ok) setError(body?.error || copy('Learning request failed.'))
      await load()
    } catch {
      setError(copy('Learning request failed.'))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { void load() }, [])

  const r = result?.result
  return (
    <div className="min-h-[calc(100vh-80px)] bg-bg px-6 pb-16 pt-8 text-text">
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">{copy('COS Foundational Learning')}</h1>
          <p className="mt-1 text-sm text-text-muted">{copy('Populate COS with governed, provenance-bearing knowledge from approved live sources.')}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Card label={status?.enabled ? copy('Live learning enabled') : copy('Live learning disabled')} value={status?.enabled ? '✓' : '—'} />
          <Card label={copy('Study questions')} value={String(status?.questions ?? '—')} />
          <Card label={copy('Source adapters')} value={String(status?.sourceAdapters?.length ?? '—')} />
        </div>

        <div className="flex flex-wrap gap-3">
          <button onClick={run} disabled={busy || !status?.enabled} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">
            {busy ? copy('Learning in progress…') : copy('Run Foundational Learning')}
          </button>
          <button onClick={load} disabled={busy} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold">
            {copy('Refresh status')}
          </button>
        </div>

        {error && <div className="rounded-md border border-danger/40 bg-surface p-4 text-sm text-danger">{error}</div>}

        <section className="rounded-md border border-border bg-surface p-4">
          {r ? (
            <div className="grid gap-3 md:grid-cols-4">
              <Card label={copy('Questions processed')} value={String(r.gapsConsidered ?? 0)} />
              <Card label={copy('Documents acquired')} value={String(r.documentsAcquired ?? 0)} />
              <Card label={copy('Knowledge accepted')} value={String(r.accepted ?? 0)} />
              <Card label={copy('External cost')} value={`$${Number(r.externalCostUsd ?? 0).toFixed(4)}`} />
              {r.rejected && Object.keys(r.rejected).length > 0 && (
                <div className="md:col-span-4 text-xs text-text-muted">{copy('Rejected')}: {Object.entries(r.rejected).map(([k,v]) => `${k}: ${v}`).join(' · ')}</div>
              )}
            </div>
          ) : <p className="text-sm text-text-muted">{copy('No learning run has been completed on this page yet.')}</p>}
        </section>
      </div>
    </div>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-border bg-surface p-4"><div className="text-xs text-text-muted">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div></div>
}
