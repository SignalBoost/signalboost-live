'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { COS_LEARNING_COPY, type CosLearningLanguage } from '@/lib/i18n/cosLearningCopy'

type Readiness = { ok?: boolean; enabled?: boolean; questions?: number; sourceAdapters?: string[]; recommendedBatchSize?: number; retainedKnowledge?: number | null; authRequired?: boolean; error?: string }
type CycleResult = { gapsConsidered?: number; documentsAcquired?: number; accepted?: number; rejected?: Record<string, number>; sourceErrors?: Record<string, number>; externalCostUsd?: number }
type LearningResult = { ok?: boolean; curriculumQuestions?: number; sourceAdapters?: string[]; retainedKnowledge?: number | null; batch?: { offset?: number; size?: number; nextOffset?: number; done?: boolean }; result?: CycleResult; authRequired?: boolean; error?: string }
type EmbeddingResult = { ok?: boolean; completed?: boolean; attempted?: number; embedded?: number; failed?: number; remaining?: number | null; total?: number | null; rejected?: number | null; eligible?: number | null; eligibleEmbedded?: number | null; batches?: number; batchSize?: number; durationMs?: number; authRequired?: boolean; error?: string }

const CANONICAL_HOST = 'saas.signalboostapp.com'
const CANONICAL_URL = `https://${CANONICAL_HOST}/dashboard/cos-learning`

async function readResponse(response: Response): Promise<any> {
  const text = await response.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return { error: `${response.status} ${response.statusText}: ${text.slice(0, 500)}` } }
}

function mergeCounts(target: Record<string, number>, source?: Record<string, number>) {
  for (const [key, value] of Object.entries(source ?? {})) target[key] = (target[key] ?? 0) + Number(value || 0)
}

function canonicalHostAvailable(): boolean {
  if (typeof window === 'undefined') return true
  const host = window.location.hostname.toLowerCase()
  return host === CANONICAL_HOST || host === 'localhost' || host === '127.0.0.1'
}

export default function CosLearningPage() {
  const { lang } = useTranslation()
  const copy = COS_LEARNING_COPY[(lang in COS_LEARNING_COPY ? lang : 'en') as CosLearningLanguage]
  const [status, setStatus] = useState<Readiness | null>(null)
  const [result, setResult] = useState<LearningResult | null>(null)
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingResult | null>(null)
  const [embeddingRun, setEmbeddingRun] = useState<EmbeddingResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [embeddingBusy, setEmbeddingBusy] = useState(false)
  const [hostMismatch, setHostMismatch] = useState(false)
  const [authRequired, setAuthRequired] = useState(false)
  const [error, setError] = useState('')

  function responseError(response: Response, body: { authRequired?: boolean; error?: string }, fallback: string): Error {
    if (response.status === 401 || body?.authRequired) {
      setAuthRequired(true)
      return new Error(copy.ownerSessionRequired)
    }
    return new Error(body?.error || fallback)
  }

  async function load() {
    setError('')
    if (!canonicalHostAvailable()) {
      setHostMismatch(true)
      setAuthRequired(false)
      setError(copy.canonicalHostRequired)
      return
    }
    setHostMismatch(false)
    setAuthRequired(false)
    try {
      const [learningResponse, embeddingResponse] = await Promise.all([
        fetch('/api/admin/cos-learning/foundational', { cache: 'no-store', credentials: 'include' }),
        fetch('/api/admin/cos-learning/backfill-embeddings', { cache: 'no-store', credentials: 'include' }),
      ])
      const [learningBody, embeddingBody] = await Promise.all([readResponse(learningResponse), readResponse(embeddingResponse)])
      setStatus(learningBody)
      setEmbeddingStatus(embeddingBody)
      if (!learningResponse.ok) throw responseError(learningResponse, learningBody, copy.requestFailed)
      if (!embeddingResponse.ok) throw responseError(embeddingResponse, embeddingBody, copy.embeddingBackfillFailed)
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.requestFailed)
    }
  }

  async function run() {
    setBusy(true)
    setError('')
    const aggregate: CycleResult = { gapsConsidered: 0, documentsAcquired: 0, accepted: 0, rejected: {}, sourceErrors: {}, externalCostUsd: 0 }
    try {
      const total = Math.max(1, status?.questions ?? 25)
      const limit = Math.max(1, Math.min(5, status?.recommendedBatchSize ?? 3))
      let offset = 0
      while (offset < total) {
        const response = await fetch('/api/admin/cos-learning/foundational', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ offset, limit }) })
        const body = await readResponse(response) as LearningResult
        if (!response.ok || !body.ok) throw responseError(response, body, copy.requestFailed)
        const r = body.result ?? {}
        aggregate.gapsConsidered = Number(aggregate.gapsConsidered || 0) + Number(r.gapsConsidered || 0)
        aggregate.documentsAcquired = Number(aggregate.documentsAcquired || 0) + Number(r.documentsAcquired || 0)
        aggregate.accepted = Number(aggregate.accepted || 0) + Number(r.accepted || 0)
        aggregate.externalCostUsd = Number(aggregate.externalCostUsd || 0) + Number(r.externalCostUsd || 0)
        mergeCounts(aggregate.rejected!, r.rejected)
        mergeCounts(aggregate.sourceErrors!, r.sourceErrors)
        offset = Number(body.batch?.nextOffset ?? (offset + limit))
        if (body.retainedKnowledge != null) setStatus(s => ({ ...s, retainedKnowledge: body.retainedKnowledge }))
        setResult({ ok: true, curriculumQuestions: total, sourceAdapters: body.sourceAdapters, retainedKnowledge: body.retainedKnowledge, result: { ...aggregate, rejected: { ...aggregate.rejected }, sourceErrors: { ...aggregate.sourceErrors } }, batch: { offset: 0, size: offset, nextOffset: offset, done: offset >= total } })
        if (body.batch?.done) break
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.requestFailed)
    } finally {
      setBusy(false)
    }
  }

  async function embedAll() {
    setEmbeddingBusy(true)
    setError('')
    setEmbeddingRun(null)
    try {
      const response = await fetch('/api/admin/cos-learning/backfill-embeddings', { method: 'POST', credentials: 'include' })
      const body = await readResponse(response) as EmbeddingResult
      setEmbeddingRun(body)
      setEmbeddingStatus(body)
      if (!response.ok || !body.ok) throw responseError(response, body, copy.embeddingBackfillFailed)
      if (Number(body.failed || 0) > 0 && body.error) setError(body.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.embeddingBackfillFailed)
    } finally {
      setEmbeddingBusy(false)
    }
  }

  useEffect(() => { void load() }, [])
  const r = result?.result

  return <div className="min-h-[calc(100vh-80px)] bg-bg px-6 pb-16 pt-8 text-text"><div className="mx-auto max-w-6xl space-y-5">
    <div><h1 className="text-2xl font-semibold">{copy.title}</h1><p className="mt-1 text-sm text-text-muted">{copy.subtitle}</p></div>
    {hostMismatch && <div className="rounded-md border border-warning/40 bg-surface p-4 text-sm"><p>{copy.canonicalHostRequired}</p><a className="mt-2 inline-block font-semibold underline" href={CANONICAL_URL}>{copy.openCanonical}</a></div>}
    <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
      <Card label={status?.enabled ? copy.liveEnabled : copy.liveDisabled} value={status?.enabled ? '✓' : '—'} />
      <Card label={copy.studyQuestions} value={String(status?.questions ?? '—')} />
      <Card label={copy.sourceAdapters} value={String(status?.sourceAdapters?.length ?? '—')} />
      <Card label={copy.retainedKnowledge} value={String(embeddingStatus?.total ?? status?.retainedKnowledge ?? '—')} />
      <Card label={copy.embeddingEligible} value={String(embeddingStatus?.eligible ?? '—')} />
      <Card label={copy.embeddingEmbedded} value={String(embeddingStatus?.eligibleEmbedded ?? '—')} />
      <Card label={copy.embeddingBacklog} value={String(embeddingStatus?.remaining ?? '—')} />
      <Card label={copy.embeddingRejected} value={String(embeddingStatus?.rejected ?? '—')} />
    </div>
    <p className="text-xs text-text-muted">{copy.embeddingScope}</p>
    <div className="flex flex-wrap gap-3">
      <button onClick={run} disabled={busy || embeddingBusy || hostMismatch || authRequired || !status?.enabled} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">{busy ? copy.running : copy.run}</button>
      <button onClick={embedAll} disabled={busy || embeddingBusy || hostMismatch || authRequired || embeddingStatus?.remaining == null || embeddingStatus.remaining === 0} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">{embeddingBusy ? copy.embedding : copy.embedAll}</button>
      <button onClick={load} disabled={busy || embeddingBusy} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold">{copy.refresh}</button>
    </div>
    {embeddingRun && <section className="rounded-md border border-border bg-surface p-4"><div className="grid gap-3 md:grid-cols-3"><Card label={copy.embeddingsCompleted} value={String(embeddingRun.embedded ?? 0)} /><Card label={copy.embeddingsRemaining} value={String(embeddingRun.remaining ?? '—')} /><Card label={copy.embeddingsFailed} value={String(embeddingRun.failed ?? 0)} /></div></section>}
    {error && <div className="whitespace-pre-wrap rounded-md border border-danger/40 bg-surface p-4 text-sm text-danger">{error}</div>}
    <section className="rounded-md border border-border bg-surface p-4">{r ? <div className="grid gap-3 md:grid-cols-4"><Card label={copy.questionsProcessed} value={String(r.gapsConsidered ?? 0)} /><Card label={copy.documentsAcquired} value={String(r.documentsAcquired ?? 0)} /><Card label={copy.knowledgeAccepted} value={String(r.accepted ?? 0)} /><Card label={copy.externalCost} value={`$${Number(r.externalCostUsd ?? 0).toFixed(4)}`} />{r.rejected && Object.keys(r.rejected).length > 0 && <div className="md:col-span-4 text-xs text-text-muted">{copy.rejected}: {Object.entries(r.rejected).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>}{r.sourceErrors && Object.keys(r.sourceErrors).length > 0 && <div className="md:col-span-4 rounded-md border border-warning/40 p-3 text-xs text-text-muted">{copy.sourceErrors}: {Object.entries(r.sourceErrors).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>}</div> : <p className="text-sm text-text-muted">{copy.noRun}</p>}</section>
  </div></div>
}

function Card({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-border bg-surface p-4"><div className="text-xs text-text-muted">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div></div>
}
