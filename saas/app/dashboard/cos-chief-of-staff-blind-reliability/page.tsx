'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { getChiefOfStaffBlindAcceptanceCopy } from '@/lib/i18n/chiefOfStaffBlindAcceptanceCopy'

type Dimension = { passed:number; attempted:number; rate:number }
type Run = {
  id:string; status:string; started_at:string; completed_at?:string|null; gate_passed?:boolean|null
  observed_cases:number; dimensions:Record<string,Dimension>; failures:string[]; error?:string|null; variant_seed?:string|null
}
type Result = {
  run_id:string; case_key:string; title:string; passed:boolean; response_source:string
  fresh_execution:boolean; provenance_recorded:boolean; latency_ms:number
}
type State = { runs:Run[]; results:Result[] }
type JsonRecord = Record<string,unknown>

const labels:Record<string,string> = {
  instruction_adherence:'Instruction adherence',
  evidence_accuracy:'Evidence accuracy',
  autonomous_follow_through:'Autonomous follow-through',
  truthful_reporting:'Truthful reporting',
}

const sleep = (ms:number) => new Promise(resolve => window.setTimeout(resolve, ms))

async function requestJson(url:string, init:RequestInit = {}, attempts = 3, timeoutMs = 20_000):Promise<JsonRecord> {
  let lastError:unknown = new Error('Request failed.')
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        ...init,
        credentials:'include',
        cache:'no-store',
        signal:controller.signal,
      })
      const body = await response.json().catch(() => ({})) as JsonRecord
      if (response.ok) return body
      const error = new Error(String(body.error || `Request failed with HTTP ${response.status}.`)) as Error & { nonRetryable?:boolean }
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) error.nonRetryable = true
      throw error
    } catch (error) {
      lastError = error
      if ((error as Error & { nonRetryable?:boolean })?.nonRetryable) throw error
      if (attempt + 1 < attempts) await sleep(350 * (attempt + 1))
    } finally {
      window.clearTimeout(timeout)
    }
  }
  throw lastError
}

export default function ChiefOfStaffBlindReliabilityPage() {
  const { lang } = useTranslation()
  const c = getChiefOfStaffBlindAcceptanceCopy(lang)
  const [state, setState] = useState<State>({ runs:[], results:[] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const body = await requestJson('/api/admin/cos-chief-of-staff-blind-acceptance', {}, 3, 20_000)
    setState({
      runs:Array.isArray(body.runs) ? body.runs as Run[] : [],
      results:Array.isArray(body.results) ? body.results as Result[] : [],
    })
  }

  useEffect(() => { void load().catch(e => setError(e instanceof Error ? e.message : c.network)) }, [])

  const run = async () => {
    setBusy(true)
    setError('')
    const runId = crypto.randomUUID()
    try {
      const start = await requestJson('/api/admin/cos-chief-of-staff-blind-acceptance', {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify({ runId }),
      }, 3, 20_000)
      const caseKeys = Array.isArray(start.caseKeys) ? start.caseKeys.map(String) : []
      for (const caseKey of caseKeys) {
        await requestJson('/api/admin/cos-chief-of-staff-blind-acceptance', {
          method:'PUT',
          headers:{ 'content-type':'application/json' },
          body:JSON.stringify({ runId, caseKey }),
        }, 3, 295_000)
      }
      await load()
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'AbortError'
        ? c.network
        : e instanceof Error ? e.message : c.network)
      await load().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  const latest = state.runs[0]
  const results = latest ? state.results.filter(item => item.run_id === latest.id) : []

  return <main className="mx-auto max-w-6xl space-y-6 p-6">
    <div>
      <h1 className="text-2xl font-semibold">{c.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{c.subtitle}</p>
      <p className="mt-1 text-xs text-muted-foreground">{c.frozen}</p>
    </div>
    <div className="flex flex-wrap gap-3">
      <button className="rounded-md bg-yellow-500 px-4 py-2 font-semibold text-black disabled:opacity-50" disabled={busy} onClick={() => void run()}>{busy ? c.running : c.run}</button>
      <button className="rounded-md border border-border px-4 py-2" disabled={busy} onClick={() => void load().catch(e => setError(e instanceof Error ? e.message : c.network))}>{c.refresh}</button>
      <Link className="rounded-md border border-border px-4 py-2" href="/dashboard/cos-chief-of-staff-reliability">{c.back}</Link>
    </div>
    {error ? <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-red-200">{error}</div> : null}
    {!latest ? <div className="rounded-md border border-border p-5 text-muted-foreground">{c.none}</div> : <>
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-md border border-border p-4"><div className="text-sm text-muted-foreground">{c.status}</div><div className={`mt-2 text-xl font-semibold ${latest.gate_passed ? 'text-green-400' : 'text-red-400'}`}>{latest.status === 'completed' ? (latest.gate_passed ? c.pass : c.fail) : latest.status}</div></div>
        <div className="rounded-md border border-border p-4"><div className="text-sm text-muted-foreground">{c.cases}</div><div className="mt-2 text-xl font-semibold">{latest.observed_cases} / 4</div></div>
        <div className="rounded-md border border-border p-4"><div className="text-sm text-muted-foreground">{c.evidence}</div><div className="mt-2 text-xl font-semibold">{results.filter(item => item.fresh_execution && item.provenance_recorded).length} / 4</div></div>
        <div className="rounded-md border border-border p-4"><div className="text-sm text-muted-foreground">{c.seed}</div><div className="mt-2 break-all text-xs font-mono">{latest.variant_seed || '—'}</div></div>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {Object.entries(latest.dimensions || {}).map(([key, value]) => <div className="rounded-md border border-border p-4" key={key}><div className="text-sm text-muted-foreground">{labels[key] || key}</div><div className="mt-2 text-lg font-semibold">{value.passed} / {value.attempted} {value.rate === 1 ? '✓' : '✕'}</div></div>)}
      </section>
      <section className="space-y-3">{results.map(item => <div className="flex items-center justify-between rounded-md border border-border p-4" key={item.case_key}><div><div className="font-medium">{item.title}</div><div className="text-xs text-muted-foreground">{item.response_source} · {item.latency_ms} {c.milliseconds}</div></div><div className={item.passed ? 'text-green-400' : 'text-red-400'}>{item.passed ? c.pass : c.fail}</div></div>)}</section>
      {latest.error ? <div className="rounded-md border border-red-500/50 p-3 text-red-200">{latest.error}</div> : null}
    </>}
  </main>
}
