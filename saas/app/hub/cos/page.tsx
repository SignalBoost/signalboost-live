'use client'

import { useEffect, useMemo, useState } from 'react'

type Gov = {
  ok: boolean
  error?: string
  generatedAt?: string
  mode?: string
  pipelines?: any[]
  alerts?: any[]
  fixes?: any[]
  escalations?: any[]
  timeline?: any[]
  graph?: { nodes: any[]; edges: any[] }
  automation?: Record<string, any>
  sourceErrors?: Record<string, string | null>
}

const gold = '#ffc300'
const cyan = '#1af0ff'
const green = '#22c55e'
const orange = '#fb923c'
const red = '#ef4444'
const slate = '#94a3b8'
const panel = { background: 'rgba(15,23,42,.82)', border: '1px solid rgba(148,163,184,.16)', borderRadius: 18, padding: 18 } as const
const ghost = { border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '9px 12px', fontWeight: 850, cursor: 'pointer' } as const
const primary = { border: 'none', background: gold, color: '#020617', borderRadius: 12, padding: '9px 12px', fontWeight: 950, cursor: 'pointer' } as const

function eventColor(value?: string) {
  if (value === 'green') return green
  if (value === 'orange') return orange
  if (value === 'red') return red
  if (value === 'cyan') return cyan
  if (value === 'yellow') return gold
  return slate
}
function severityColor(value?: string) {
  if (value === 'critical') return red
  if (value === 'high') return '#fb7185'
  if (value === 'medium') return orange
  return gold
}
function chip(text: any, color = slate) {
  return <span style={{ display: 'inline-flex', border: `1px solid ${color}55`, color, background: `${color}16`, borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 900 }}>{text}</span>
}
function fmt(value?: string) {
  if (!value) return '-'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function json(value: any) {
  try { return JSON.stringify(value ?? {}, null, 2) } catch { return String(value) }
}
function Details({ value }: { value: any }) {
  return <details style={{ marginTop: 10 }}><summary style={{ color: cyan, cursor: 'pointer', fontSize: 12, fontWeight: 850 }}>Telemetry JSON</summary><pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', maxHeight: 230, overflow: 'auto', borderRadius: 12, padding: 12, background: 'rgba(0,0,0,.28)', color: 'rgba(226,232,240,.82)', fontSize: 11 }}>{json(value)}</pre></details>
}

function Pipeline({ item }: { item: any }) {
  const color = item.status === 'healthy' ? green : item.status === 'watch' ? gold : item.status === 'degraded' ? orange : red
  return <article style={panel}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong style={{ color: '#fff' }}>{item.name}</strong>{chip(item.status, color)}</div>
    <p style={{ color: 'rgba(255,255,255,.58)', fontSize: 12, lineHeight: 1.45 }}>{item.role}</p>
    <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}><div style={{ width: `${item.healthScore || 0}%`, height: '100%', background: color }} /></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,.65)' }}>
      <span>Health <b style={{ color: '#fff' }}>{item.healthScore}%</b></span><span>Risk <b style={{ color }}>{item.overloadRisk}%</b></span>
      <span>Latency <b style={{ color: '#fff' }}>{item.latencyMs}ms</b></span><span>Cost <b style={{ color: '#fff' }}>${item.estimatedCostUsd}</b></span>
      <span>Active <b style={{ color: '#fff' }}>{item.activeJobs}</b></span><span>Failed <b style={{ color: item.failedJobs ? red : '#fff' }}>{item.failedJobs}</b></span>
    </div>
    <p style={{ color: cyan, fontSize: 12, fontWeight: 850 }}>Next: {String(item.nextAction || '').replace(/_/g, ' ')}</p>
  </article>
}

function AlertCard({ item }: { item: any }) {
  const color = severityColor(item.severity)
  return <article style={{ border: `1px solid ${color}55`, borderRadius: 16, padding: 14, background: `${color}0f` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong style={{ color: '#fff' }}>{item.title}</strong>{chip(item.severity, color)}</div>
    <p style={{ color: 'rgba(255,255,255,.72)', fontSize: 13, lineHeight: 1.55 }}>{item.forecast}</p>
    <p style={{ color: gold, fontSize: 12, fontWeight: 850 }}>Autonomous action: {item.suggestedFix}</p>
    {chip('informational alert - no approval required', green)}
    <Details value={item.telemetry} />
  </article>
}

function FixCard({ item }: { item: any }) {
  return <article style={{ border: `1px solid ${green}44`, borderRadius: 16, padding: 14, background: 'rgba(34,197,94,.06)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong style={{ color: '#fff' }}>{item.rootCause}</strong>{chip(String(item.status || '').replace(/_/g, ' '), green)}</div>
    <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>Fix: {item.suggestedFix}</p>
    <p style={{ color: cyan, fontSize: 12, fontWeight: 850 }}>Confidence {item.confidence}% · {String(item.action || '').replace(/_/g, ' ')}</p>
    {chip('auto-applied / watchdog-managed', green)}
    <Details value={item.telemetry} />
  </article>
}

function EscalationCard({ item }: { item: any }) {
  return <article style={{ border: `1px solid ${orange}55`, borderRadius: 16, padding: 14, background: `${orange}0f` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong style={{ color: '#fff' }}>{String(item.intent || '').replace(/_/g, ' ')}</strong>{chip(item.status, orange)}</div>
    <p style={{ color: 'rgba(255,255,255,.65)', fontSize: 12 }}>Pipeline {item.pipeline} · Risk {item.riskLevel} · Approver {item.approver}</p>
    <p style={{ color: gold, fontSize: 12, fontWeight: 850 }}>This panel is reserved for life-critical exceptions only.</p>
    <Details value={item.telemetry} />
  </article>
}

function TimelineRow({ item }: { item: any }) {
  const color = eventColor(item.color)
  return <article style={{ display: 'grid', gridTemplateColumns: '132px 14px 1fr', gap: 12, alignItems: 'start' }}>
    <span style={{ color: 'rgba(255,255,255,.52)', fontSize: 11 }}>{fmt(item.timestamp)}</span>
    <span style={{ width: 11, height: 11, borderRadius: 99, background: color, boxShadow: `0 0 18px ${color}`, marginTop: 4 }} />
    <div style={{ border: `1px solid ${color}44`, borderRadius: 14, padding: 12, background: 'rgba(255,255,255,.035)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><strong style={{ color: '#fff' }}>{item.title}</strong><span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{chip(item.type, color)}{chip(item.severity, severityColor(item.severity))}{chip(item.status)}</span></div>
      <p style={{ margin: '7px 0 0', color: 'rgba(255,255,255,.62)', fontSize: 12 }}>Pipeline {item.pipeline}{item.approverRole ? ` · Approver ${item.approverRole}` : ''}{item.decision ? ` · Decision ${item.decision}` : ''}</p>
      {item.recommendation ? <p style={{ color: cyan, fontSize: 12 }}>{item.recommendation}</p> : null}
      <Details value={item.telemetry} />
    </div>
  </article>
}

export default function CosGovernanceDashboardPage() {
  const [data, setData] = useState<Gov | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('all')

  async function load() {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/cos/governance-router', { cache: 'no-store', credentials: 'include' })
      const json = await res.json().catch(() => ({ ok: false, error: 'Invalid governance response' }))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Could not load COS governance router.')
      setData(json)
    } catch (e: any) {
      setMessage(e?.message || 'Could not load COS governance router.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const timeline = useMemo(() => {
    const rows = data?.timeline || []
    return filter === 'all' ? rows : rows.filter((row: any) => row.type === filter)
  }, [data?.timeline, filter])

  const alerts = data?.alerts || []
  const fixes = data?.fixes || []
  const escalations = data?.escalations || []
  const pipelines = data?.pipelines || []

  return <main style={{ maxWidth: 1380, margin: '0 auto', display: 'grid', gap: 18, padding: '24px 22px' }}>
    <section style={{ ...panel, background: 'radial-gradient(circle at top left, rgba(26,240,255,.14), transparent 28rem), linear-gradient(145deg, rgba(15,23,42,.96), rgba(2,6,23,.98))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16, flexWrap: 'wrap' }}>
        <div><p style={{ margin: 0, color: gold, fontSize: 12, fontWeight: 950, letterSpacing: '.14em', textTransform: 'uppercase' }}>COS Governance</p><h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 'clamp(28px, 4vw, 44px)', letterSpacing: '-.04em' }}>Fully Autonomous Hybrid-Dynamic COS Router</h1><p style={{ color: 'rgba(255,255,255,.68)', maxWidth: 900, lineHeight: 1.65 }}>COS monitors, predicts, reroutes, restarts, and fixes ordinary operational issues automatically. Human review appears only for life-critical exceptions.</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}><button onClick={load} disabled={loading} style={primary}>{loading ? 'Loading…' : 'Refresh cockpit'}</button>{chip(data?.mode || 'fully-autonomous-except-life-critical', cyan)}{chip('24x7 watchdog active', green)}</div>
      </div>
      {message ? <p style={{ color: message.toLowerCase().includes('fail') || message.toLowerCase().includes('could not') ? red : green, margin: '12px 0 0', fontWeight: 800 }}>{message}</p> : null}
      {data?.automation ? <p style={{ color: green, fontSize: 12, margin: '12px 0 0' }}>Automation: {Object.entries(data.automation).map(([k, v]) => `${k}=${String(v)}`).join(' · ')}</p> : null}
      {data?.sourceErrors && (data.sourceErrors.campaigns || data.sourceErrors.decisions) ? <p style={{ color: orange, fontSize: 12 }}>Source warnings: {Object.entries(data.sourceErrors).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(' · ')}</p> : null}
    </section>

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>{pipelines.map(item => <Pipeline key={item.id} item={item} />)}{!loading && !pipelines.length ? <div style={panel}>No pipeline telemetry returned.</div> : null}</section>

    <section style={panel}>
      <p style={{ color: gold, margin: 0, fontSize: 11, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}>Telemetry graph</p><h2 style={{ color: '#fff', margin: '6px 0 0', fontSize: 20 }}>Failing nodes and autonomous reroute paths</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginTop: 16 }}>{(data?.graph?.nodes || []).map((node: any) => <div key={node.id} style={{ border: `1px solid ${eventColor(node.status === 'healthy' ? 'green' : node.status === 'watch' ? 'yellow' : 'orange')}55`, borderRadius: 16, padding: 12 }}><strong style={{ color: '#fff' }}>{node.label}</strong><p style={{ color: 'rgba(255,255,255,.6)', fontSize: 12 }}>Health {node.healthScore}% · {node.status}</p></div>)}</div>
      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>{(data?.graph?.edges || []).map((edge: any, i: number) => <div key={i} style={{ color: edge.active ? cyan : 'rgba(255,255,255,.55)', fontSize: 12 }}><b>{edge.from}</b> {edge.active ? '━━▶' : '──▶'} <b>{edge.to}</b> · {edge.label}</div>)}</div>
    </section>

    <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18 }}>
      <div style={{ display: 'grid', gap: 14 }}>
        <section style={panel}><div style={{ display: 'flex', justifyContent: 'space-between' }}><div><p style={{ color: gold, margin: 0, fontSize: 11, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}>Predictive Alerts Panel</p><h2 style={{ color: '#fff', margin: '6px 0 0', fontSize: 20 }}>Informational early warnings</h2></div>{chip(`${alerts.length} alerts`, gold)}</div><div style={{ display: 'grid', gap: 12, marginTop: 14 }}>{alerts.length ? alerts.map(item => <AlertCard key={item.id} item={item} />) : <p style={{ color: 'rgba(255,255,255,.6)' }}>No predictive alerts.</p>}</div></section>
        <section style={panel}><div style={{ display: 'flex', justifyContent: 'space-between' }}><div><p style={{ color: cyan, margin: 0, fontSize: 11, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}>Problem + Fix Panel</p><h2 style={{ color: '#fff', margin: '6px 0 0', fontSize: 20 }}>Autonomous fixes and fallback logic</h2></div>{chip(`${fixes.length} fixes`, green)}</div><div style={{ display: 'grid', gap: 12, marginTop: 14 }}>{fixes.length ? fixes.map(item => <FixCard key={item.id} item={item} />) : <p style={{ color: 'rgba(255,255,255,.6)' }}>No fix attempts required.</p>}</div></section>
      </div>
      <section style={panel}><div style={{ display: 'flex', justifyContent: 'space-between' }}><div><p style={{ color: orange, margin: 0, fontSize: 11, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}>Escalation Panel</p><h2 style={{ color: '#fff', margin: '6px 0 0', fontSize: 20 }}>Life-critical exceptions only</h2></div>{chip(`${escalations.length} escalations`, escalations.length ? orange : green)}</div><div style={{ display: 'grid', gap: 12, marginTop: 14 }}>{escalations.length ? escalations.map(item => <EscalationCard key={item.id} item={item} />) : <p style={{ color: 'rgba(255,255,255,.6)' }}>No life-critical escalation. Ordinary issues are handled autonomously.</p>}</div></section>
    </section>

    <section style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><div><p style={{ color: gold, margin: 0, fontSize: 11, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}>Unified Timeline View</p><h2 style={{ color: '#fff', margin: '6px 0 0', fontSize: 22 }}>Full lifecycle visibility</h2><p style={{ color: 'rgba(255,255,255,.58)', margin: '5px 0 0', fontSize: 13 }}>Yellow = alert · Green = fix success · Orange = life-critical pending · Red = rejected.</p></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{['all', 'alert', 'fix', 'escalation', 'decision'].map(item => <button key={item} onClick={() => setFilter(item)} style={filter === item ? primary : ghost}>{item}</button>)}</div></div>
      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>{timeline.length ? timeline.map((item: any) => <TimelineRow key={item.id} item={item} />) : <p style={{ color: 'rgba(255,255,255,.6)' }}>{loading ? 'Loading timeline…' : 'No governance timeline events yet.'}</p>}</div>
    </section>
  </main>
}
