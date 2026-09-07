'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { getConciergeLanguageAcceptanceCopy } from '@/lib/i18n/conciergeLanguageAcceptanceCopy'

type Verdicts = {
  handled:boolean
  selectedLanguage:boolean
  noEnglishLeakage:boolean
  criticalTokensPreserved:boolean
  routingHealthy:boolean
  latencyHealthy:boolean
}
type LanguageSummary = Record<string,{ attempted:number; passed:number; automatedPassed:boolean }>
type Run = {
  id:string
  status:string
  started_at:string
  completed_at?:string|null
  automated_gate_passed?:boolean|null
  full_gate_passed:boolean
  observed_cases:number
  language_summary:LanguageSummary
  native_reviews:Record<string,'pending'|'pass'|'fail'>
  native_review_notes:Record<string,string>
  failures:string[]
  error?:string|null
}
type Result = {
  run_id:string
  case_key:string
  title:string
  language:string
  category:string
  passed:boolean
  verdicts:Verdicts
  response_excerpt:string
  response_source:string
  local_model_invoked:boolean
  external_ai_invoked:boolean
  native_reviewer_used:boolean
  native_review_confidence:number|null
  critical_tokens:string[]
  latency_ms:number
}
type State = { requiredCases:number; runs:Run[]; results:Result[] }

const LANGUAGES = ['en','es','pt','pl','ru'] as const
const LANGUAGE_NAMES:Record<string,string> = { en:'English', es:'Español', pt:'Português (Brasil)', pl:'Polski', ru:'Русский' }
const VERDICT_LABELS:Record<keyof Verdicts,string> = {
  handled:'Handled', selectedLanguage:'Selected language', noEnglishLeakage:'No English leakage',
  criticalTokensPreserved:'Critical tokens', routingHealthy:'Routing', latencyHealthy:'Latency',
}

export default function ConciergeLanguageAcceptancePage() {
  const { lang } = useTranslation()
  const c = getConciergeLanguageAcceptanceCopy(lang)
  const [state,setState] = useState<State>({ requiredCases:25, runs:[], results:[] })
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [notes,setNotes] = useState<Record<string,string>>({})

  const load = async () => {
    const response = await fetch('/api/admin/concierge-language-acceptance', { credentials:'include', cache:'no-store' })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Could not load language acceptance evidence.')
    setState({ requiredCases:Number(body.requiredCases || 25), runs:Array.isArray(body.runs) ? body.runs : [], results:Array.isArray(body.results) ? body.results : [] })
  }
  useEffect(() => { void load().catch(e => setError(e instanceof Error ? e.message : String(e))) }, [])

  const latest = state.runs[0]
  const results = useMemo(() => latest ? state.results.filter(item => item.run_id === latest.id) : [], [latest,state.results])

  const runMatrix = async () => {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/admin/concierge-language-acceptance', { method:'POST', credentials:'include' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not create language acceptance run.')
      for (const caseKey of body.caseKeys as string[]) {
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), 295_000)
        try {
          const result = await fetch('/api/admin/concierge-language-acceptance', {
            method:'PUT', credentials:'include', signal:controller.signal,
            headers:{ 'content-type':'application/json' }, body:JSON.stringify({ runId:body.runId, caseKey }),
          })
          const resultBody = await result.json()
          if (!result.ok) throw new Error(resultBody.error || `Language acceptance case ${caseKey} failed.`)
        } finally { window.clearTimeout(timeout) }
      }
      await load()
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'AbortError'
        ? 'The browser stopped waiting for one case. Refresh to read the durable state before rerunning.'
        : e instanceof Error ? e.message : 'Language acceptance run failed.')
      await load().catch(() => undefined)
    } finally { setBusy(false) }
  }

  const reviewLanguage = async (language:string, verdict:'pass'|'fail') => {
    if (!latest) return
    setError('')
    const response = await fetch('/api/admin/concierge-language-acceptance', {
      method:'PATCH', credentials:'include', headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ runId:latest.id, language, verdict, note:notes[language] || '' }),
    })
    const body = await response.json()
    if (!response.ok) { setError(body.error || 'Could not save native-language review.'); return }
    await load().catch(e => setError(e instanceof Error ? e.message : String(e)))
  }

  const status = (value:boolean|null|undefined) => value === true ? c.pass : value === false ? c.fail : c.pending

  return <main className="mx-auto max-w-7xl space-y-6 p-6">
    <header>
      <h1 className="text-2xl font-semibold">{c.title}</h1>
      <p className="mt-2 max-w-4xl text-sm text-muted-foreground">{c.subtitle}</p>
    </header>

    <div className="flex flex-wrap gap-3">
      <button className="rounded-md bg-yellow-500 px-4 py-2 font-semibold text-black disabled:opacity-50" disabled={busy} onClick={() => void runMatrix()}>{busy ? c.running : c.run}</button>
      <button className="rounded-md border border-border px-4 py-2 disabled:opacity-50" disabled={busy} onClick={() => void load().catch(e => setError(e instanceof Error ? e.message : String(e)))}>{c.refresh}</button>
    </div>
    {error ? <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-red-200">{error}</div> : null}

    {!latest ? <div className="rounded-md border border-border p-5 text-muted-foreground">{c.noRuns}</div> : <>
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-md border border-border p-4"><div className="text-sm text-muted-foreground">{c.automated}</div><div className="mt-2 text-xl font-semibold">{status(latest.automated_gate_passed)}</div><div className="mt-2 text-xs text-muted-foreground">{c.automatedNote}</div></div>
        <div className="rounded-md border border-border p-4"><div className="text-sm text-muted-foreground">{c.native}</div><div className="mt-2 text-xl font-semibold">{LANGUAGES.filter(code => latest.native_reviews?.[code] === 'pass').length} / 5</div><div className="mt-2 text-xs text-muted-foreground">{c.nativeNote}</div></div>
        <div className="rounded-md border border-border p-4"><div className="text-sm text-muted-foreground">{c.full}</div><div className={`mt-2 text-xl font-semibold ${latest.full_gate_passed ? 'text-green-400' : 'text-yellow-400'}`}>{latest.full_gate_passed ? c.pass : c.pending}</div></div>
        <div className="rounded-md border border-border p-4"><div className="text-sm text-muted-foreground">{c.cases}</div><div className="mt-2 text-xl font-semibold">{latest.observed_cases} / {state.requiredCases}</div></div>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        {LANGUAGES.map(code => {
          const summary = latest.language_summary?.[code] || { attempted:0, passed:0, automatedPassed:false }
          const native = latest.native_reviews?.[code] || 'pending'
          return <div className="space-y-3 rounded-md border border-border p-4" key={code}>
            <div><div className="font-semibold">{LANGUAGE_NAMES[code]}</div><div className="text-xs text-muted-foreground">{summary.passed} / {summary.attempted} {c.automated}</div></div>
            <div className={summary.automatedPassed ? 'text-green-400' : 'text-yellow-400'}>{c.automated}: {summary.automatedPassed ? c.pass : c.pending}</div>
            <div className={native === 'pass' ? 'text-green-400' : native === 'fail' ? 'text-red-400' : 'text-yellow-400'}>{c.native}: {native === 'pass' ? c.pass : native === 'fail' ? c.fail : c.pending}</div>
            <textarea className="min-h-20 w-full rounded-md border border-border bg-background p-2 text-sm" value={notes[code] ?? latest.native_review_notes?.[code] ?? ''} onChange={e => setNotes(value => ({...value,[code]:e.target.value}))} placeholder={c.notePlaceholder} />
            <div className="flex flex-wrap gap-2">
              <button className="rounded border border-green-500/50 px-2 py-1 text-xs text-green-300 disabled:opacity-40" disabled={latest.status !== 'completed' || summary.attempted !== 5} onClick={() => void reviewLanguage(code,'pass')}>{c.reviewPass}</button>
              <button className="rounded border border-red-500/50 px-2 py-1 text-xs text-red-300 disabled:opacity-40" disabled={latest.status !== 'completed' || summary.attempted !== 5} onClick={() => void reviewLanguage(code,'fail')}>{c.reviewFail}</button>
            </div>
          </div>
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{c.responses}</h2>
        {results.map(item => <article className="rounded-md border border-border p-4" key={item.case_key}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="font-medium">{LANGUAGE_NAMES[item.language] || item.language} · {item.category}</div><div className="text-sm">{item.title}</div><div className="mt-1 text-xs text-muted-foreground">{c.source}: {item.response_source} · {c.latency}: {item.latency_ms} {c.milliseconds}</div></div>
            <div className={item.passed ? 'text-green-400' : 'text-red-400'}>{item.passed ? c.pass : c.fail}</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {Object.entries(item.verdicts || {}).map(([key,value]) => <span className={`rounded border px-2 py-1 ${value ? 'border-green-500/40 text-green-300' : 'border-red-500/40 text-red-300'}`} key={key}>{VERDICT_LABELS[key as keyof Verdicts] || key}: {value ? '✓' : '✕'}</span>)}
          </div>
          <pre className="mt-3 whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm leading-relaxed">{item.response_excerpt}</pre>
        </article>)}
      </section>
      {latest.failures?.length ? <div className="rounded-md border border-red-500/40 p-3 text-sm text-red-200">{latest.failures.join(' · ')}</div> : null}
      {latest.error ? <div className="rounded-md border border-red-500/40 p-3 text-red-200">{latest.error}</div> : null}
    </>}
  </main>
}
