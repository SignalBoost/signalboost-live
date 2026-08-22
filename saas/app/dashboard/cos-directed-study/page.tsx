// saas/app/dashboard/cos-directed-study/page.tsx
'use client'

// Owner UI for /api/admin/cos-directed-study. The API existed first; a JSON endpoint with no door
// is unusable to a non-coding owner, so this page IS the input surface: a form, a dry-run preview
// showing per-chunk admission verdicts, and a confirm step that stores only what was admitted.

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { COS_DIRECTED_STUDY_COPY, type CosDirectedStudyLanguage } from '@/lib/i18n/cosDirectedStudyCopy'

type ChunkVerdict = { index: number; admitted: boolean; reason: string; confidence: number; coverage: number; matchedTerms: string[] }
type Assessment = { ok?: boolean; error?: string; subject?: string; chunks?: ChunkVerdict[]; admitted?: number; rejected?: number }
type ApiResult = { ok?: boolean; error?: string; dryRun?: boolean; resolvedFrom?: string | null; assessment?: Assessment | null; stored?: number; duplicates?: number; errors?: string[]; authRequired?: boolean }
type HistoryRecord = { content_hash?: string; source_kind?: string; source_uri?: string; source_title?: string | null; subject?: string; confidence?: number; license?: string; created_at?: string }
type HistoryResult = { ok?: boolean; error?: string; records?: HistoryRecord[]; authRequired?: boolean }

const CANONICAL_HOST = 'saas.signalboostapp.com'
const CANONICAL_URL = `https://${CANONICAL_HOST}/dashboard/cos-directed-study`

async function readResponse(response: Response): Promise<any> {
  const text = await response.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return { error: `${response.status} ${response.statusText}: ${text.slice(0, 500)}` } }
}

function canonicalHostAvailable(): boolean {
  if (typeof window === 'undefined') return true
  const host = window.location.hostname.toLowerCase()
  return host === CANONICAL_HOST || host === 'localhost' || host === '127.0.0.1'
}

export default function CosDirectedStudyPage() {
  const { lang } = useTranslation()
  const copy = COS_DIRECTED_STUDY_COPY[(lang in COS_DIRECTED_STUDY_COPY ? lang : 'en') as CosDirectedStudyLanguage]

  const [topic, setTopic] = useState('')
  const [studyIntent, setStudyIntent] = useState('')
  const [materialKind, setMaterialKind] = useState('video')
  const [license, setLicense] = useState('')
  const [sourceUri, setSourceUri] = useState('')
  const [sourceTitle, setSourceTitle] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<{ name: string; data: string } | null>(null)

  const [busy, setBusy] = useState<'preview' | 'feed' | null>(null)
  const [result, setResult] = useState<ApiResult | null>(null)
  const [history, setHistory] = useState<HistoryResult | null>(null)
  const [hostMismatch, setHostMismatch] = useState(false)
  const [authRequired, setAuthRequired] = useState(false)
  const [error, setError] = useState('')

  const formReady = topic.trim().length >= 4 && studyIntent.trim().length >= 12 && license.trim().length > 0 && sourceUri.trim().length > 0

  async function onFileChosen(chosen: File | null) {
    if (!chosen) { setFile(null); return }
    const name = chosen.name.toLowerCase()
    if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.markdown')) {
      // Plain text reads client-side straight into the paste box, so the owner can trim it first.
      setText(await chosen.text())
      setFile(null)
      if (!sourceUri.trim()) setSourceUri(`owner://upload/${chosen.name}`)
      return
    }
    if (name.endsWith('.pdf')) {
      // PDFs are extracted server-side (dependency-free); send the bytes as base64.
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('read failed'))
        reader.readAsDataURL(chosen)
      }).catch(() => '')
      if (!data) { setError(copy.requestFailed); return }
      setFile({ name: chosen.name, data })
      if (!sourceUri.trim()) setSourceUri(`owner://upload/${chosen.name}`)
      return
    }
    setError(copy.unsupportedFile)
  }

  async function loadHistory() {
    if (!canonicalHostAvailable()) {
      setHostMismatch(true)
      setError(copy.canonicalHostRequired)
      return
    }
    setHostMismatch(false)
    try {
      const response = await fetch('/api/admin/cos-directed-study', { cache: 'no-store', credentials: 'include' })
      const body = await readResponse(response) as HistoryResult
      setHistory(body)
      if (response.status === 401 || response.status === 403) setAuthRequired(true)
    } catch {
      setHistory({ ok: false, error: copy.requestFailed })
    }
  }

  async function submit(dryRun: boolean) {
    setBusy(dryRun ? 'preview' : 'feed')
    setError('')
    setResult(null)
    try {
      const response = await fetch(`/api/admin/cos-directed-study${dryRun ? '?dry=1' : ''}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          studyIntent: studyIntent.trim(),
          materialKind,
          license: license.trim(),
          sourceUri: sourceUri.trim(),
          sourceTitle: sourceTitle.trim() || undefined,
          text: text.trim() || undefined,
          ...(file ? { fileName: file.name, fileData: file.data } : {}),
        }),
      })
      const body = await readResponse(response) as ApiResult
      setResult(body)
      if (response.status === 401 || response.status === 403) {
        setAuthRequired(true)
        throw new Error(copy.ownerSessionRequired)
      }
      if (!response.ok || !body.ok) throw new Error(body?.error || copy.requestFailed)
      if (!dryRun) await loadHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.requestFailed)
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => { void loadHistory() }, [])

  const assessment = result?.assessment
  const resolvedLabel = result?.resolvedFrom === 'youtube_transcript' ? copy.resolvedYoutube
    : result?.resolvedFrom === 'document_fetch' ? copy.resolvedDocument
      : result?.resolvedFrom === 'pasted_text' ? copy.resolvedPasted : null

  return <div className="min-h-[calc(100vh-80px)] bg-bg px-6 pb-16 pt-8 text-text"><div className="mx-auto max-w-5xl space-y-5">
    <div><h1 className="text-2xl font-semibold">{copy.title}</h1><p className="mt-1 text-sm text-text-muted">{copy.subtitle}</p></div>
    {hostMismatch && <div className="rounded-md border border-warning/40 bg-surface p-4 text-sm"><p>{copy.canonicalHostRequired}</p><a className="mt-2 inline-block font-semibold underline" href={CANONICAL_URL}>{copy.openCanonical}</a></div>}
    {authRequired && <div className="rounded-md border border-warning/40 bg-surface p-4 text-sm">{copy.ownerSessionRequired}</div>}

    <section className="space-y-4 rounded-md border border-border bg-surface p-5">
      <Field label={copy.topic} hint={copy.topicHint}><input value={topic} onChange={e => setTopic(e.target.value)} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" /></Field>
      <Field label={copy.studyIntent} hint={copy.studyIntentHint}><input value={studyIntent} onChange={e => setStudyIntent(e.target.value)} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" /></Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={copy.materialKind}>
          <select value={materialKind} onChange={e => setMaterialKind(e.target.value)} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm">
            <option value="video">{copy.kindVideo}</option>
            <option value="article">{copy.kindArticle}</option>
            <option value="book">{copy.kindBook}</option>
            <option value="documentation">{copy.kindDocumentation}</option>
            <option value="own_notes">{copy.kindOwnNotes}</option>
          </select>
        </Field>
        <Field label={copy.license} hint={copy.licenseHint}><input value={license} onChange={e => setLicense(e.target.value)} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" /></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={copy.sourceUri} hint={copy.sourceUriHint}><input value={sourceUri} onChange={e => setSourceUri(e.target.value)} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" /></Field>
        <Field label={copy.sourceTitle}><input value={sourceTitle} onChange={e => setSourceTitle(e.target.value)} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" /></Field>
      </div>
      <Field label={copy.pastedText} hint={copy.pastedTextHint}><textarea value={text} onChange={e => setText(e.target.value)} rows={8} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" /></Field>
      <Field label={copy.uploadFile} hint={copy.uploadHint}>
        <input type="file" accept=".txt,.md,.markdown,.pdf" onChange={e => void onFileChosen(e.target.files?.[0] ?? null)} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" />
        {file && <div className="mt-1.5 flex items-center gap-2 text-xs text-text-muted"><span>{copy.fileAttached}: <span className="font-semibold text-text">{file.name}</span></span><button type="button" onClick={() => setFile(null)} className="rounded-md border border-border px-2 py-0.5">{copy.removeFile}</button></div>}
      </Field>
      <p className="text-xs text-text-muted">{copy.validationHint}</p>
      <div className="flex flex-wrap gap-3">
        <button onClick={() => submit(true)} disabled={!formReady || busy !== null || hostMismatch || authRequired} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy === 'preview' ? copy.previewing : copy.preview}</button>
        <button onClick={() => submit(false)} disabled={!formReady || busy !== null || hostMismatch || authRequired} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">{busy === 'feed' ? copy.feeding : copy.feed}</button>
        <button onClick={loadHistory} disabled={busy !== null} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold">{copy.refresh}</button>
      </div>
      <p className="text-xs text-text-muted">{copy.gateNote}</p>
    </section>

    {error && <div className="whitespace-pre-wrap rounded-md border border-danger/40 bg-surface p-4 text-sm text-danger">{error}</div>}

    {result?.ok && assessment && <section className="space-y-3 rounded-md border border-border bg-surface p-5">
      {result.dryRun && <p className="text-sm font-semibold">{copy.dryRunNote}</p>}
      <div className="flex flex-wrap gap-4 text-sm text-text-muted">
        {resolvedLabel && <span>{copy.resolvedFrom}: <span className="font-semibold text-text">{resolvedLabel}</span></span>}
        {!result.dryRun && <span>{copy.storedResult}: <span className="font-semibold text-text">{result.stored ?? 0}</span></span>}
        {!result.dryRun && (result.duplicates ?? 0) > 0 && <span>{copy.duplicatesResult}: <span className="font-semibold text-text">{result.duplicates}</span></span>}
      </div>
      <h2 className="text-sm font-semibold">{copy.chunksTitle} — {assessment.admitted ?? 0} ✓ / {assessment.rejected ?? 0} ✗</h2>
      <div className="space-y-2">
        {(assessment.chunks ?? []).map(chunk => <div key={chunk.index} className={`rounded-md border p-3 text-xs ${chunk.admitted ? 'border-border' : 'border-warning/40'}`}>
          <div className="font-semibold">#{chunk.index + 1} — {chunk.admitted ? copy.chunkAdmitted : chunk.reason === 'too_short' ? copy.chunkTooShort : copy.chunkRejected}</div>
          <div className="mt-1 text-text-muted">{copy.confidence}: {chunk.confidence.toFixed(2)} · {copy.matchedTerms}: {chunk.matchedTerms.length ? chunk.matchedTerms.join(', ') : '—'}</div>
        </div>)}
      </div>
      {(result.errors ?? []).length > 0 && <div className="rounded-md border border-warning/40 p-3 text-xs text-text-muted">{(result.errors ?? []).join(' · ')}</div>}
    </section>}

    <section className="rounded-md border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">{copy.historyTitle}</h2>
      {history?.records?.length ? <div className="mt-3 space-y-2">
        {history.records.map(record => <div key={String(record.content_hash)} className="rounded-md border border-border p-3 text-xs">
          <div className="font-semibold">{record.subject || '—'} <span className="font-normal text-text-muted">· {record.source_kind}</span></div>
          <div className="mt-1 break-all text-text-muted">{record.source_title || record.source_uri} · {copy.confidence}: {Number(record.confidence ?? 0).toFixed(2)} · {record.license}</div>
        </div>)}
      </div> : <p className="mt-2 text-sm text-text-muted">{history?.error || copy.historyEmpty}</p>}
    </section>
  </div></div>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="font-semibold">{label}</span>{hint && <span className="mt-0.5 block text-xs text-text-muted">{hint}</span>}<div className="mt-1.5">{children}</div></label>
}
