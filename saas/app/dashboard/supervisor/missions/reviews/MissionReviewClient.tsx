'use client'

import { useEffect, useRef, useState } from 'react'
import { parseManualReviewDiagnosticsResponse, type MissionManualReviewDiagnosticsResponse } from '@/lib/supervisor/missions/review-diagnostics'

type Labels = Record<string, string>
type Review = { reviewId: string; missionId: string; missionRevision: number; decisionId: string; status: string; title: string; summary: string; createdAt: string; routedAt: string; schemaVersion: string }
type MissionSummary = { missionId: string; missionType: string; revision: number; status: string; environment: string; title: string; riskLevel: string; createdAt: string; updatedAt: string; schemaVersion: string }
type Detail = Review & { decisionFingerprint: string; planFingerprint: string; bindingFingerprint: string; mission: MissionSummary | null }
type ListResponse = { items: Review[]; nextCursor?: string }

const isString = (value: unknown): value is string => typeof value === 'string'
const isNonNegativeInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function parseReview(value: unknown): Review | null {
  if (!isRecord(value)) return null
  if (!isString(value.reviewId) || !isString(value.missionId) || !isNonNegativeInteger(value.missionRevision) || !isString(value.decisionId) || !isString(value.status) || !isString(value.title) || !isString(value.summary) || !isString(value.createdAt) || !isString(value.routedAt) || !isString(value.schemaVersion)) return null
  return { reviewId: value.reviewId, missionId: value.missionId, missionRevision: value.missionRevision, decisionId: value.decisionId, status: value.status, title: value.title, summary: value.summary, createdAt: value.createdAt, routedAt: value.routedAt, schemaVersion: value.schemaVersion }
}

function parseMissionSummary(value: unknown): MissionSummary | null {
  if (!isRecord(value)) return null
  if (!isString(value.missionId) || !isString(value.missionType) || !isNonNegativeInteger(value.revision) || !isString(value.status) || !isString(value.environment) || !isString(value.title) || !isString(value.riskLevel) || !isString(value.createdAt) || !isString(value.updatedAt) || !isString(value.schemaVersion)) return null
  return { missionId: value.missionId, missionType: value.missionType, revision: value.revision, status: value.status, environment: value.environment, title: value.title, riskLevel: value.riskLevel, createdAt: value.createdAt, updatedAt: value.updatedAt, schemaVersion: value.schemaVersion }
}

function parseListResponse(value: unknown): ListResponse | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null
  const items = value.items.map(parseReview)
  if (items.some(item => item === null) || (value.nextCursor !== undefined && !isString(value.nextCursor))) return null
  return { items: items as Review[], ...(isString(value.nextCursor) ? { nextCursor: value.nextCursor } : {}) }
}

function parseDetailResponse(value: unknown): Detail | null {
  const review = parseReview(value)
  if (!review || !isRecord(value) || !isString(value.decisionFingerprint) || !isString(value.planFingerprint) || !isString(value.bindingFingerprint)) return null
  const mission = value.mission === null ? null : parseMissionSummary(value.mission)
  if (value.mission !== null && !mission) return null
  return { ...review, decisionFingerprint: value.decisionFingerprint, planFingerprint: value.planFingerprint, bindingFingerprint: value.bindingFingerprint, mission }
}

const sizes = [25, 50, 100]
const formatTime = (value: string) => new Date(value).toLocaleString()
const messageFor = (status: number, labels: Labels) => status === 401 || status === 403 ? labels.accessDenied : status === 404 ? labels.notFound : labels.error

export default function MissionReviewClient({ labels }: { labels: Labels }) {
  const [items, setItems] = useState<Review[]>([])
  const [status, setStatus] = useState('')
  const [missionId, setMissionId] = useState('')
  const [pageSize, setPageSize] = useState(25)
  const [cursor, setCursor] = useState<string | undefined>()
  const [history, setHistory] = useState<string[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<MissionManualReviewDiagnosticsResponse | null>(null)
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState('')
  const detailOpener = useRef<HTMLButtonElement | null>(null)
  const listController = useRef<AbortController | null>(null)
  const detailController = useRef<AbortController | null>(null)
  const listRequest = useRef(0)
  const detailRequest = useRef(0)
  const copyFeedbackTimeout = useRef<number | undefined>(undefined)

  async function loadDiagnostics() {
    setDiagnosticsError(null)
    try {
      const response = await fetch('/api/internal/supervisor/missions/reviews/diagnostics', { method: 'GET', cache: 'no-store' })
      if (!response.ok) throw new Error(messageFor(response.status, labels))
      const payload = parseManualReviewDiagnosticsResponse(await response.json())
      if (!payload) throw new Error(labels.error)
      setDiagnostics(payload)
    } catch (cause) { setDiagnostics(null); setDiagnosticsError(cause instanceof Error ? cause.message : labels.error) }
  }

  async function load(activeCursor = cursor) {
    listController.current?.abort()
    const controller = new AbortController()
    listController.current = controller
    const request = listRequest.current + 1
    listRequest.current = request
    setLoading(true); setError(null); setDetail(null)
    const params = new URLSearchParams({ limit: String(Math.min(100, pageSize)) })
    if (status) params.set('status', status)
    if (missionId.trim()) params.set('missionId', missionId.trim())
    if (activeCursor) params.set('cursor', activeCursor)
    try {
      const response = await fetch(`/api/internal/supervisor/missions/reviews?${params}`, { method: 'GET', cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error(messageFor(response.status, labels))
      const payload = parseListResponse(await response.json())
      if (!payload) throw new Error(labels.error)
      if (listRequest.current !== request || controller.signal.aborted) return
      setItems(payload.items)
      setNextCursor(payload.nextCursor)
    } catch (cause) {
      if (listRequest.current !== request || controller.signal.aborted) return
      setItems([]); setNextCursor(undefined); setError(cause instanceof Error ? cause.message : labels.error)
    } finally { if (listRequest.current === request) setLoading(false) }
  }

  useEffect(() => { void load(); void loadDiagnostics() }, []) // Initial inspection is GET-only.

  function applyFilters(event: React.FormEvent) { event.preventDefault(); setCursor(undefined); setHistory([]); void load(undefined) }
  function nextPage() { if (!nextCursor) return; setHistory(previous => [...previous, cursor || '']); setCursor(nextCursor); void load(nextCursor) }
  function previousPage() { const previous = history.at(-1); if (previous === undefined) return; const nextHistory = history.slice(0, -1); setHistory(nextHistory); setCursor(previous || undefined); void load(previous || undefined) }

  function closeDetail() {
    detailController.current?.abort()
    detailRequest.current += 1
    setDetail(null); setDetailError(null); setDetailLoading(false)
    window.setTimeout(() => {
      const opener = detailOpener.current
      if (opener?.isConnected && !opener.disabled) opener.focus()
    }, 0)
  }

  useEffect(() => {
    if (!detail && !detailLoading && !detailError) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); closeDetail() } }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [detail, detailLoading, detailError])

  useEffect(() => () => {
    listController.current?.abort()
    detailController.current?.abort()
    if (copyFeedbackTimeout.current !== undefined) window.clearTimeout(copyFeedbackTimeout.current)
  }, [])

  async function openDetail(reviewId: string, opener: HTMLButtonElement) {
    detailOpener.current = opener
    detailController.current?.abort()
    const controller = new AbortController()
    detailController.current = controller
    const request = detailRequest.current + 1
    detailRequest.current = request
    setDetailLoading(true); setDetailError(null); setDetail(null)
    try {
      const response = await fetch(`/api/internal/supervisor/missions/reviews/${encodeURIComponent(reviewId)}`, { method: 'GET', cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error(messageFor(response.status, labels))
      const payload = parseDetailResponse(await response.json())
      if (!payload) throw new Error(labels.error)
      if (detailRequest.current === request && !controller.signal.aborted) setDetail(payload)
    } catch (cause) { if (detailRequest.current === request && !controller.signal.aborted) setDetailError(cause instanceof Error ? cause.message : labels.error) } finally { if (detailRequest.current === request) setDetailLoading(false) }
  }

  async function copyFingerprint(value: string) {
    try {
      await navigator.clipboard?.writeText(value)
      setCopyFeedback(labels.fingerprintCopied)
    } catch { setCopyFeedback(labels.fingerprintCopyFailed) }
    if (copyFeedbackTimeout.current !== undefined) window.clearTimeout(copyFeedbackTimeout.current)
    copyFeedbackTimeout.current = window.setTimeout(() => setCopyFeedback(''), 3000)
  }

  return <main style={page}>
    <section style={panel}>
      <p style={kicker}>{labels.kicker}</p><h1 style={{ margin: '6px 0 12px' }}>{labels.title}</h1><p style={muted}>{labels.subtitle}</p>
      <div style={safety}><strong>{labels.manualReviewOnly}</strong><strong>{labels.noRepair}</strong><strong>{labels.productionDisabled}</strong><strong>{labels.providerDisabled}</strong></div>
      <section style={diagnosticsPanel} aria-live="polite"><h2 style={{ marginTop: 0 }}>{labels.diagnostics}</h2>{diagnosticsError ? <p style={errorStyle} role="alert">{diagnosticsError}</p> : null}{diagnostics ? <dl style={detailGrid}><div><dt style={muted}>{labels.totalReviews}</dt><dd style={valueStyle}>{diagnostics.total}</dd></div><div><dt style={muted}>{labels.routedReviews}</dt><dd style={valueStyle}>{diagnostics.routed}</dd></div><div><dt style={muted}>{labels.oldestRoutedAt}</dt><dd style={valueStyle}>{diagnostics.oldestRoutedAt ? formatTime(diagnostics.oldestRoutedAt) : labels.unavailable}</dd></div><div><dt style={muted}>{labels.newestRoutedAt}</dt><dd style={valueStyle}>{diagnostics.newestRoutedAt ? formatTime(diagnostics.newestRoutedAt) : labels.unavailable}</dd></div>{diagnostics.duplicateRoutesPrevented !== undefined ? <div><dt style={muted}>{labels.duplicateRoutesPrevented}</dt><dd style={valueStyle}>{diagnostics.duplicateRoutesPrevented}</dd></div> : null}<div><dt style={muted}>{labels.diagnosticsStatus}</dt><dd style={valueStyle}>{diagnostics.status}</dd></div></dl> : <p style={muted} role="status">{labels.loading}</p>}</section>
      <form onSubmit={applyFilters} style={filters} aria-label={labels.filters}>
        <label>{labels.status}<select value={status} onChange={event => setStatus(event.target.value)}><option value="">{labels.allStatuses}</option><option value="routed">{labels.routed}</option></select></label>
        <label>{labels.missionId}<input value={missionId} onChange={event => setMissionId(event.target.value)} maxLength={200} /></label>
        <label>{labels.pageSize}<select value={pageSize} onChange={event => setPageSize(Math.min(100, Number(event.target.value)))}>{sizes.map(size => <option key={size} value={size}>{size}</option>)}</select></label>
        <button type="submit">{labels.applyFilters}</button>
      </form>
      {loading ? <p style={muted} role="status">{labels.loading}</p> : null}
      {error ? <p style={errorStyle} role="alert">{error}</p> : null}
      {!loading && !error && items.length === 0 ? <p style={muted} role="status">{labels.empty}</p> : null}
      {!loading && !error && items.length > 0 ? <div style={tableWrap}><table style={table}><thead><tr>{[labels.reviewId, labels.missionId, labels.revision, labels.decisionId, labels.status, labels.titleLabel, labels.summary, labels.createdAt, labels.routedAt, labels.openDetail].map(label => <th key={label} style={head}>{label}</th>)}</tr></thead><tbody>{items.map(review => <tr key={review.reviewId} style={row}><td style={cell}><code>{review.reviewId}</code></td><td style={cell}><code>{review.missionId}</code></td><td style={cell}>{review.missionRevision}</td><td style={cell}><code>{review.decisionId}</code></td><td style={cell}>{review.status}</td><td style={cell}>{review.title}</td><td style={cell}>{review.summary}</td><td style={cell}>{formatTime(review.createdAt)}</td><td style={cell}>{formatTime(review.routedAt)}</td><td style={cell}><button type="button" aria-label={`${labels.openDetail}: ${review.reviewId}`} onClick={event => void openDetail(review.reviewId, event.currentTarget)}>{labels.openDetail}</button></td></tr>)}</tbody></table></div> : null}
      <nav style={pagination} aria-label={labels.pagination}><button type="button" onClick={previousPage} disabled={loading || history.length === 0}>{labels.previous}</button><button type="button" onClick={nextPage} disabled={loading || !nextCursor}>{labels.next}</button></nav>
    </section>
    {(detailLoading || detailError || detail) ? <section style={panel} aria-live="polite"><div style={detailHeader}><h2>{labels.detail}</h2><button type="button" onClick={closeDetail}>{labels.closeDetail}</button></div>{detailLoading ? <p style={muted} role="status">{labels.loading}</p> : null}{detailError ? <p style={errorStyle} role="alert">{detailError}</p> : null}{detail ? <DetailView detail={detail} labels={labels} onCopy={copyFingerprint} /> : null}<p role="status" aria-live="polite" aria-atomic="true" style={srOnly}>{copyFeedback}</p></section> : null}
    <style>{focusVisibleCss}</style>
  </main>
}

function DetailView({ detail, labels, onCopy }: { detail: Detail; labels: Labels; onCopy: (value: string) => Promise<void> }) {
  const fields: [string, string | number][] = [[labels.reviewId, detail.reviewId], [labels.missionId, detail.missionId], [labels.revision, detail.missionRevision], [labels.decisionId, detail.decisionId], [labels.status, detail.status], [labels.titleLabel, detail.title], [labels.summary, detail.summary], [labels.createdAt, formatTime(detail.createdAt)], [labels.routedAt, formatTime(detail.routedAt)]]
  return <><dl style={detailGrid}>{fields.map(([label, value]) => <div key={label}><dt style={muted}>{label}</dt><dd style={valueStyle}>{value}</dd></div>)}</dl><h3>{labels.fingerprints}</h3>{([[labels.decisionFingerprint, detail.decisionFingerprint], [labels.planFingerprint, detail.planFingerprint], [labels.bindingFingerprint, detail.bindingFingerprint]] as const).map(([label, value]) => <div key={label} style={fingerprint}><span>{label}: <code>{value}</code></span><button type="button" onClick={() => void onCopy(value)}>{labels.copy}</button></div>)}<h3>{labels.missionSummary}</h3>{detail.mission ? <dl style={detailGrid}>{Object.entries(detail.mission).map(([key, value]) => <div key={key}><dt style={muted}>{labels[`mission_${key}`] || key}</dt><dd style={valueStyle}>{String(value)}</dd></div>)}</dl> : <p style={muted}>{labels.missionUnavailable}</p>}<p style={muted}>{labels.feedbackUnavailable}</p></>
}

const page={minHeight:'100vh',padding:32,color:'#fff',background:'linear-gradient(135deg,#06111f,#05070c)'}; const panel={border:'1px solid rgba(255,255,255,.12)',borderRadius:24,padding:24,background:'rgba(255,255,255,.06)',marginBottom:18}; const kicker={color:'#1af0ff',fontWeight:800,textTransform:'uppercase' as const,letterSpacing:1}; const muted={color:'rgba(255,255,255,.68)'}; const safety={display:'flex',gap:10,flexWrap:'wrap' as const,color:'#b8ffdd',fontWeight:700,margin:'18px 0'}; const diagnosticsPanel={border:'1px solid rgba(26,240,255,.35)',borderRadius:14,padding:16,margin:'18px 0'}; const filters={display:'flex',gap:12,flexWrap:'wrap' as const,alignItems:'end',marginBottom:18}; const tableWrap={overflowX:'auto' as const}; const table={width:'100%',minWidth:1120,borderCollapse:'collapse' as const}; const head={textAlign:'left' as const,padding:'10px',borderBottom:'1px solid rgba(255,255,255,.16)',color:'#ffc300'}; const cell={padding:'10px',borderBottom:'1px solid rgba(255,255,255,.08)',verticalAlign:'top' as const}; const row={}; const pagination={display:'flex',gap:10,marginTop:18}; const detailHeader={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}; const errorStyle={color:'#ff9cab',fontWeight:700}; const detailGrid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}; const valueStyle={margin:0,wordBreak:'break-word' as const}; const fingerprint={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',border:'1px solid rgba(255,255,255,.12)',borderRadius:10,padding:10,margin:'8px 0',wordBreak:'break-all' as const}; const srOnly={position:'absolute' as const,width:1,height:1,padding:0,margin:-1,overflow:'hidden' as const,clip:'rect(0, 0, 0, 0)',whiteSpace:'nowrap' as const,border:0}; const focusVisibleCss='button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #1af0ff; outline-offset: 3px; }'
