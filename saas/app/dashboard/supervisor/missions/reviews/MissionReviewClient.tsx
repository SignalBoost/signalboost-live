'use client'

import { useEffect, useState } from 'react'

type Labels = Record<string, string>
type Review = { reviewId: string; missionId: string; missionRevision: number; decisionId: string; status: string; title: string; summary: string; createdAt: string; routedAt: string; schemaVersion: string }
type MissionSummary = { missionId: string; missionType: string; revision: number; status: string; environment: string; title: string; riskLevel: string; createdAt: string; updatedAt: string; schemaVersion: string }
type Detail = Review & { decisionFingerprint: string; planFingerprint: string; bindingFingerprint: string; mission: MissionSummary | null }
type ListResponse = { items: Review[]; nextCursor?: string }

const sizes = [25, 50, 100]
const reviewFields = ['reviewId', 'missionId', 'missionRevision', 'decisionId', 'status', 'title', 'summary', 'createdAt', 'routedAt', 'schemaVersion'] as const
const missionFields = ['missionId', 'missionType', 'revision', 'status', 'environment', 'title', 'riskLevel', 'createdAt', 'updatedAt', 'schemaVersion'] as const
const fingerprintFields = ['decisionFingerprint', 'planFingerprint', 'bindingFingerprint'] as const

const formatTime = (value: string) => new Date(value).toLocaleString()
const messageFor = (status: number, labels: Labels) => status === 401 || status === 403 ? labels.accessDenied : status === 404 ? labels.notFound : labels.error
const isString = (value: unknown): value is string => typeof value === 'string'
const isRevision = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0

function parseReview(value: unknown): Review | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (!reviewFields.filter(field => field !== 'missionRevision').every(field => isString(item[field])) || !isRevision(item.missionRevision)) return null
  return { reviewId: item.reviewId as string, missionId: item.missionId as string, missionRevision: item.missionRevision as number, decisionId: item.decisionId as string, status: item.status as string, title: item.title as string, summary: item.summary as string, createdAt: item.createdAt as string, routedAt: item.routedAt as string, schemaVersion: item.schemaVersion as string }
}

function parseMission(value: unknown): MissionSummary | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (!missionFields.filter(field => field !== 'revision').every(field => isString(item[field])) || !isRevision(item.revision)) return null
  return { missionId: item.missionId as string, missionType: item.missionType as string, revision: item.revision as number, status: item.status as string, environment: item.environment as string, title: item.title as string, riskLevel: item.riskLevel as string, createdAt: item.createdAt as string, updatedAt: item.updatedAt as string, schemaVersion: item.schemaVersion as string }
}

function parseListResponse(value: unknown): ListResponse | null {
  if (!value || typeof value !== 'object' || !Array.isArray((value as Record<string, unknown>).items)) return null
  const response = value as Record<string, unknown>
  const items = response.items.map(parseReview)
  if (items.some(item => item === null) || (response.nextCursor !== undefined && !isString(response.nextCursor))) return null
  return { items: items as Review[], ...(isString(response.nextCursor) ? { nextCursor: response.nextCursor } : {}) }
}

function parseDetail(value: unknown): Detail | null {
  const review = parseReview(value)
  if (!review || !value || typeof value !== 'object') return null
  const response = value as Record<string, unknown>
  if (!fingerprintFields.every(field => isString(response[field])) || (response.mission !== null && parseMission(response.mission) === null)) return null
  return { ...review, decisionFingerprint: response.decisionFingerprint as string, planFingerprint: response.planFingerprint as string, bindingFingerprint: response.bindingFingerprint as string, mission: parseMission(response.mission) }
}

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

  async function load(activeCursor = cursor) {
    setLoading(true); setError(null); setDetail(null)
    const params = new URLSearchParams({ limit: String(Math.min(100, pageSize)) })
    if (status) params.set('status', status)
    if (missionId.trim()) params.set('missionId', missionId.trim())
    if (activeCursor) params.set('cursor', activeCursor)
    try {
      const response = await fetch(`/api/internal/supervisor/missions/reviews?${params}`, { method: 'GET', cache: 'no-store' })
      if (!response.ok) throw new Error(messageFor(response.status, labels))
      const payload = parseListResponse(await response.json())
      if (!payload) throw new Error(labels.error)
      setItems(payload.items)
      setNextCursor(payload.nextCursor)
    } catch (cause) { setItems([]); setNextCursor(undefined); setError(cause instanceof Error ? cause.message : labels.error) } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, []) // Initial inspection is GET-only.

  function applyFilters(event: React.FormEvent) { event.preventDefault(); setCursor(undefined); setHistory([]); void load(undefined) }
  function nextPage() { if (!nextCursor) return; setHistory(previous => [...previous, cursor || '']); setCursor(nextCursor); void load(nextCursor) }
  function previousPage() { const previous = history.at(-1); if (previous === undefined) return; setHistory(history.slice(0, -1)); setCursor(previous || undefined); void load(previous || undefined) }

  async function openDetail(reviewId: string) {
    setDetailLoading(true); setDetailError(null); setDetail(null)
    try {
      const response = await fetch(`/api/internal/supervisor/missions/reviews/${encodeURIComponent(reviewId)}`, { method: 'GET', cache: 'no-store' })
      if (!response.ok) throw new Error(messageFor(response.status, labels))
      const payload = parseDetail(await response.json())
      if (!payload) throw new Error(labels.error)
      setDetail(payload)
    } catch (cause) { setDetailError(cause instanceof Error ? cause.message : labels.error) } finally { setDetailLoading(false) }
  }

  async function copyFingerprint(value: string) { await navigator.clipboard?.writeText(value) }

  return <main style={page}>
    <section style={panel}>
      <p style={kicker}>{labels.kicker}</p><h1 style={{ margin: '6px 0 12px' }}>{labels.title}</h1><p style={muted}>{labels.subtitle}</p>
      <div style={safety}><strong>{labels.manualReviewOnly}</strong><strong>{labels.noRepair}</strong><strong>{labels.productionDisabled}</strong><strong>{labels.providerDisabled}</strong></div>
      <form onSubmit={applyFilters} style={filters} aria-label={labels.filters}>
        <label>{labels.status}<select value={status} onChange={event => setStatus(event.target.value)}><option value="">{labels.allStatuses}</option><option value="routed">{labels.routed}</option></select></label>
        <label>{labels.missionId}<input value={missionId} onChange={event => setMissionId(event.target.value)} maxLength={200} /></label>
        <label>{labels.pageSize}<select value={pageSize} onChange={event => setPageSize(Math.min(100, Number(event.target.value)))}>{sizes.map(size => <option key={size} value={size}>{size}</option>)}</select></label>
        <button type="submit">{labels.applyFilters}</button>
      </form>
      {loading ? <p style={muted} role="status">{labels.loading}</p> : null}
      {error ? <p style={errorStyle} role="alert">{error}</p> : null}
      {!loading && !error && items.length === 0 ? <p style={muted}>{labels.empty}</p> : null}
      {!loading && !error && items.length > 0 ? <div style={tableWrap}><table style={table}><thead><tr>{[labels.reviewId, labels.missionId, labels.revision, labels.decisionId, labels.status, labels.titleLabel, labels.summary, labels.createdAt, labels.routedAt].map(label => <th key={label} style={head}>{label}</th>)}</tr></thead><tbody>{items.map(review => <tr key={review.reviewId} style={row} onClick={() => void openDetail(review.reviewId)} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') void openDetail(review.reviewId) }}><td style={cell}><code>{review.reviewId}</code></td><td style={cell}><code>{review.missionId}</code></td><td style={cell}>{review.missionRevision}</td><td style={cell}><code>{review.decisionId}</code></td><td style={cell}>{review.status}</td><td style={cell}>{review.title}</td><td style={cell}>{review.summary}</td><td style={cell}>{formatTime(review.createdAt)}</td><td style={cell}>{formatTime(review.routedAt)}</td></tr>)}</tbody></table></div> : null}
      <div style={pagination}><button type="button" onClick={previousPage} disabled={loading || history.length === 0}>{labels.previous}</button><button type="button" onClick={nextPage} disabled={loading || !nextCursor}>{labels.next}</button></div>
    </section>
    {(detailLoading || detailError || detail) ? <section style={panel} aria-live="polite"><h2>{labels.detail}</h2>{detailLoading ? <p style={muted}>{labels.loading}</p> : null}{detailError ? <p style={errorStyle} role="alert">{detailError}</p> : null}{detail ? <DetailView detail={detail} labels={labels} onCopy={copyFingerprint} /> : null}</section> : null}
  </main>
}

function DetailView({ detail, labels, onCopy }: { detail: Detail; labels: Labels; onCopy: (value: string) => Promise<void> }) {
  const fields: [string, string | number][] = [[labels.reviewId, detail.reviewId], [labels.missionId, detail.missionId], [labels.revision, detail.missionRevision], [labels.decisionId, detail.decisionId], [labels.status, detail.status], [labels.titleLabel, detail.title], [labels.summary, detail.summary], [labels.createdAt, formatTime(detail.createdAt)], [labels.routedAt, formatTime(detail.routedAt)]]
  const missionSummary: [string, string | number][] = detail.mission ? [[labels.mission_missionId, detail.mission.missionId], [labels.mission_missionType, detail.mission.missionType], [labels.mission_revision, detail.mission.revision], [labels.mission_status, detail.mission.status], [labels.mission_environment, detail.mission.environment], [labels.mission_title, detail.mission.title], [labels.mission_riskLevel, detail.mission.riskLevel], [labels.mission_createdAt, formatTime(detail.mission.createdAt)], [labels.mission_updatedAt, formatTime(detail.mission.updatedAt)], [labels.mission_schemaVersion, detail.mission.schemaVersion]] : []
  return <><dl style={detailGrid}>{fields.map(([label, value]) => <div key={label}><dt style={muted}>{label}</dt><dd style={valueStyle}>{value}</dd></div>)}</dl><h3>{labels.fingerprints}</h3>{([[labels.decisionFingerprint, detail.decisionFingerprint], [labels.planFingerprint, detail.planFingerprint], [labels.bindingFingerprint, detail.bindingFingerprint]] as const).map(([label, value]) => <div key={label} style={fingerprint}><span>{label}: <code>{value}</code></span><button type="button" onClick={() => void onCopy(value)}>{labels.copy}</button></div>)}<h3>{labels.missionSummary}</h3>{detail.mission ? <dl style={detailGrid}>{missionSummary.map(([label, value]) => <div key={label}><dt style={muted}>{label}</dt><dd style={valueStyle}>{value}</dd></div>)}</dl> : <p style={muted}>{labels.missionUnavailable}</p>}<p style={muted}>{labels.feedbackUnavailable}</p></>
}

const page={minHeight:'100vh',padding:32,color:'#fff',background:'linear-gradient(135deg,#06111f,#05070c)'}; const panel={border:'1px solid rgba(255,255,255,.12)',borderRadius:24,padding:24,background:'rgba(255,255,255,.06)',marginBottom:18}; const kicker={color:'#1af0ff',fontWeight:800,textTransform:'uppercase' as const,letterSpacing:1}; const muted={color:'rgba(255,255,255,.68)'}; const safety={display:'flex',gap:10,flexWrap:'wrap' as const,color:'#b8ffdd',fontWeight:700,margin:'18px 0'}; const filters={display:'flex',gap:12,flexWrap:'wrap' as const,alignItems:'end',marginBottom:18}; const tableWrap={overflowX:'auto' as const}; const table={width:'100%',minWidth:1040,borderCollapse:'collapse' as const}; const head={textAlign:'left' as const,padding:'10px',borderBottom:'1px solid rgba(255,255,255,.16)',color:'#ffc300'}; const cell={padding:'10px',borderBottom:'1px solid rgba(255,255,255,.08)',verticalAlign:'top' as const}; const row={cursor:'pointer'}; const pagination={display:'flex',gap:10,marginTop:18}; const errorStyle={color:'#ff9cab',fontWeight:700}; const detailGrid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}; const valueStyle={margin:0,wordBreak:'break-word' as const}; const fingerprint={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',border:'1px solid rgba(255,255,255,.12)',borderRadius:10,padding:10,margin:'8px 0',wordBreak:'break-all' as const}
