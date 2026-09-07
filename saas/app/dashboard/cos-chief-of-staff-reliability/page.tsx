'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { getChiefOfStaffAcceptanceCopy } from '@/lib/i18n/chiefOfStaffAcceptanceCopy'

type Dimension = { passed:number; attempted:number; rate:number }
type Run = { id:string; status:string; started_at:string; completed_at?:string|null; gate_passed?:boolean|null; observed_cases:number; dimensions:Record<string,Dimension>; failures:string[]; error?:string|null }
type Result = { run_id:string; case_key:string; title:string; passed:boolean; response_source:string; fresh_execution:boolean; provenance_recorded:boolean; latency_ms:number }
type State = { runs:Run[]; results:Result[] }

const labels:Record<string,string> = {
  instruction_adherence:'Instruction adherence', evidence_accuracy:'Evidence accuracy',
  autonomous_follow_through:'Autonomous follow-through', truthful_reporting:'Truthful reporting',
}

export default function ChiefOfStaffReliabilityPage() {
  const { lang } = useTranslation()
  const c = getChiefOfStaffAcceptanceCopy(lang)
  const [state, setState] = useState<State>({ runs:[], results:[] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = async () => {
    const response = await fetch('/api/admin/cos-chief-of-staff-acceptance', { credentials:'include', cache:'no-store' })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Could not load acceptance evidence.')
    setState({ runs:Array.isArray(body.runs) ? body.runs : [], results:Array.isArray(body.results) ? body.results : [] })
  }
  useEffect(() => { void load().catch(e => setError(e.message)) }, [])
  const run = async () => {
    setBusy(true); setError('')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 295_000)
    try {
      const response = await fetch('/api/admin/cos-chief-of-staff-acceptance', { method:'POST', credentials:'include', signal:controller.signal })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Acceptance cycle failed.')
      await load()
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'AbortError' ? 'The browser stopped waiting. Refresh to read the durable result.' : e instanceof Error ? e.message : 'Acceptance cycle failed.')
    } finally { window.clearTimeout(timeout); setBusy(false) }
  }
  const latest = state.runs[0]
  const results = latest ? state.results.filter(item => item.run_id === latest.id) : []
  return <main className="mx-auto max-w-6xl space-y-6 p-6">
    <div>
      <h1 className="text-2xl font-semibold">{c.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{c.subtitle}</p>
    </div>
    <div className="flex flex-wrap gap-3">
      <button className="rounded-md bg-yellow-500 px-4 py-2 font-semibold text-black disabled:opacity-50" disabled={busy} onClick={() => void run()}>{busy ? c.running : c.run}</button>
      <button className="rounded-md border border-border px-4 py-2" disabled={busy} onClick={() => void load().catch(e => setError(e.message))}>{c.refresh}</button>
      <Link className="rounded-md border border-border px-4 py-2" href="/dashboard/cos-capability-benchmark">{c.back}</Link>
    </div>
    {error ? <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-red-200">{error}</div> : null}
    {!latest ? <div className="rounded-md border border-border p-5 text-muted-foreground">{c.none}</div> : <>
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-md border border-border p-4"><div className="text-sm text-muted-foreground">{c.status}</div><div className={`mt-2 text-xl font-semibold ${latest.gate_passed ? 'text-green-400' : 'text-red-400'}`}>{latest.status === 'completed' ? (latest.gate_passed ? c.pass : c.fail) : latest.status}</div></div>
        <div className="rounded-md border border-border p-4"><div className="text-sm text-muted-foreground">{c.cases}</div><div className="mt-2 text-xl font-semibold">{latest.observed_cases} / 4</div></div>
        <div className="rounded-md border border-border p-4"><div className="text-sm text-muted-foreground">{c.evidence}</div><div className="mt-2 text-xl font-semibold">{results.filter(item => item.fresh_execution && item.provenance_recorded).length} / 4</div></div>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {Object.entries(latest.dimensions || {}).map(([key, value]) => <div className="rounded-md border border-border p-4" key={key}><div className="text-sm text-muted-foreground">{labels[key] || key}</div><div className="mt-2 text-lg font-semibold">{value.passed} / {value.attempted} {value.rate === 1 ? '✓' : '✕'}</div></div>)}
      </section>
      <section className="space-y-3">{results.map(item => <div className="flex items-center justify-between rounded-md border border-border p-4" key={item.case_key}><div><div className="font-medium">{item.title}</div><div className="text-xs text-muted-foreground">{item.response_source} · {item.latency_ms} {c.milliseconds}</div></div><div className={item.passed ? 'text-green-400' : 'text-red-400'}>{item.passed ? c.pass : c.fail}</div></div>)}</section>
      {latest.error ? <div className="rounded-md border border-red-500/50 p-3 text-red-200">{latest.error}</div> : null}
    </>}
  </main>
}
