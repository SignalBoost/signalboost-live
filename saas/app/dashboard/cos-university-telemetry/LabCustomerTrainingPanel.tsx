// saas/app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx
//
// Customer LAB: your provider keys → choose teacher + training provider → train → progress → download.
// Keys are typed once, sent to the server, encrypted, and never shown again. No graduation is required to download.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fmt, type LabCustomerTrainingCopy } from '@/lib/i18n/labCustomerTrainingCopy'

type Org = { organizationId: string; organizationName: string; experimentId: string; projectName: string; role: string }
type CatalogEntry = { kind: string; name: string; supports: Record<string, boolean>; unsupported: Record<string, string>; keyHelp: string }
type Credential = { id: string; providerKind: string; label: string; endpoint: string | null; createdAt: string }
type Run = {
  runId: string; stage: string; progressPercent: number; statusMessage: string | null; teacherProviderKind: string; teacherModel: string
  baseModel: string; approvedBudgetUsd: number; committedMaxCostUsd: number; hfJobUrl: string | null; artifactRepo: string | null
  artifactRevision: string | null; failureCode: string | null; createdAt: string
  teacherReservedUsd?: number; teacherSpentUsd?: number; teacherReservationState?: string | null
}

export default function LabCustomerTrainingPanel({ copy, language = 'en' }: { copy: LabCustomerTrainingCopy; language?: string }) {
  const explain = (code: string) => copy.errors[code] ?? fmt(copy.unknownError, { code })
  const [orgs, setOrgs] = useState<Org[]>([])
  const [orgKey, setOrgKey] = useState('')
  const activeOrgRef = useRef('')
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [message, setMessage] = useState<{ kind: 'status' | 'alert'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [workspaceLoad, setWorkspaceLoad] = useState<'loading' | 'ready' | 'error'>('loading')
  // key form
  const [keyKind, setKeyKind] = useState('huggingface')
  const [keyLabel, setKeyLabel] = useState('')
  const [keyValue, setKeyValue] = useState('')
  const [keyEndpoint, setKeyEndpoint] = useState('')
  // run form
  const [teacherId, setTeacherId] = useState('')
  const [teacherModel, setTeacherModel] = useState('')
  const [computeId, setComputeId] = useState('')
  const [baseModel, setBaseModel] = useState('')
  const [modelSelection, setModelSelection] = useState('')
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [prompts, setPrompts] = useState('')
  const [source, setSource] = useState<'examples' | 'teacher'>('examples')
  const [examples, setExamples] = useState('')
  const [files, setFiles] = useState<Record<string, { path: string; size: number }[]>>({})
  const [budget, setBudget] = useState('5')
  const [hourly, setHourly] = useState('1')
  const [teacherBudget, setTeacherBudget] = useState('1')

  const [organizationId, experimentId] = orgKey.split('|')
  const org = orgs.find(item => `${item.organizationId}|${item.experimentId}` === orgKey)
  const canManage = org?.role === 'owner' || org?.role === 'admin'
  const entry = (kind: string) => catalog.find(item => item.kind === kind)
  const computeCredentials = credentials.filter(item => entry(item.providerKind)?.supports['training.execute'])
  const [computeProviderKind, setComputeProviderKind] = useState('')
  const selectedComputeCredentials = computeCredentials.filter(item => item.providerKind === computeProviderKind)
  const teacherCredentials = credentials.filter(item => entry(item.providerKind)?.supports['teacher.generate'])
  const promptCount = useMemo(() => new Set(prompts.split('\n').map(line => line.trim()).filter(Boolean)).size, [prompts])
  const exampleCount = useMemo(() => examples.split('\n').filter(line => { try { const o = JSON.parse(line); return o?.prompt && o?.response } catch { return false } }).length, [examples])
  const itemCount = source === 'examples' ? exampleCount : promptCount

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/lab/experiments', { credentials: 'include', cache: 'no-store' }).catch(() => null)
      const body = await response?.json().catch(() => null)
      if (!response?.ok || !body?.ok || !Array.isArray(body.experiments)) {
        setWorkspaceLoad('error')
        setMessage({ kind: 'alert', text: fmt(copy.loadFailed, { code: body?.error || 'network' }) })
        return
      }
      const list: Org[] = body.experiments
      setOrgs(list)
      if (list[0]) { activeOrgRef.current = list[0].organizationId; setOrgKey(`${list[0].organizationId}|${list[0].experimentId}`) }
      setWorkspaceLoad('ready')
    })()
  }, [copy])

  async function initializeWorkspace() {
    setBusy(true)
    try {
      const response = await fetch('/api/lab/workspace', { method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationName: copy.title }) })
      const body = await response.json()
      if (!response.ok || !body.ok) throw new Error(body.error || 'lab_request_failed')
      setOrgs([body.workspace])
      setWorkspaceLoad('ready')
      activeOrgRef.current = body.workspace.organizationId
      setOrgKey(`${body.workspace.organizationId}|${body.workspace.experimentId}`)
    } catch (error) {
      setMessage({ kind: 'alert', text: fmt(copy.loadFailed, { code: error instanceof Error ? error.message : 'lab_request_failed' }) })
    } finally { setBusy(false) }
  }

  const load = useCallback(async () => {
    if (!organizationId || activeOrgRef.current !== organizationId) return
    const [providers, training] = await Promise.all([
      fetch(`/api/lab/providers?organizationId=${organizationId}`, { credentials: 'include', cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch(`/api/lab/training?organizationId=${organizationId}`, { credentials: 'include', cache: 'no-store' }).then(r => r.json()).catch(() => null),
    ])
    if (activeOrgRef.current !== organizationId) return
    if (providers?.ok) { setCatalog(providers.catalog); setCredentials(providers.credentials) }
    if (training?.ok) setRuns(training.runs)
    if (!providers?.ok || !training?.ok) setMessage({ kind: 'alert', text: fmt(copy.loadFailed, { code: providers?.error || training?.error || 'network' }) })
  }, [organizationId, copy])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    let cancelled = false
    if (!computeProviderKind) { setModelSuggestions([]); return }
    setModelsLoading(true)
    void fetch(`/api/lab/models?provider=${encodeURIComponent(computeProviderKind)}`, { credentials: 'include', cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(body => { if (!cancelled) setModelSuggestions(Array.isArray(body?.models) ? body.models : []) })
      .catch(() => { if (!cancelled) setModelSuggestions([]) })
      .finally(() => { if (!cancelled) setModelsLoading(false) })
    return () => { cancelled = true }
  }, [computeProviderKind])
  useEffect(() => {
    if (!runs.some(run => !['completed', 'failed', 'cancelled'].includes(run.stage))) return
    const timer = setInterval(() => { void load() }, 15_000)
    return () => clearInterval(timer)
  }, [runs, load])

  async function call(url: string, method: string, body: unknown) {
    setBusy(true); setMessage(null)
    try {
      const response = await fetch(url, { method, credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.ok) throw Object.assign(new Error(json.error || 'request_failed'), { problems: json.problems })
      return json
    } finally { setBusy(false) }
  }

  async function saveKey() {
    const requestedOrg = organizationId
    try {
      await call('/api/lab/providers', 'POST', { organizationId, providerKind: keyKind, label: keyLabel, secret: keyValue, endpoint: keyEndpoint })
      if (activeOrgRef.current !== requestedOrg) return
      setKeyValue(''); setKeyLabel(''); setKeyEndpoint('')
      setMessage({ kind: 'status', text: copy.keySaved })
      await load()
    } catch (error: any) { if (activeOrgRef.current === requestedOrg) setMessage({ kind: 'alert', text: fmt(copy.keyNotSaved, { code: explain(error.message) }) }) }
  }

  async function revokeKey(credentialId: string) {
    const requestedOrg = organizationId
    try { await call('/api/lab/providers', 'DELETE', { organizationId, credentialId }); if (activeOrgRef.current === requestedOrg) await load() }
    catch (error: any) { if (activeOrgRef.current === requestedOrg) setMessage({ kind: 'alert', text: fmt(copy.keyRemoveFailed, { code: explain(error.message) }) }) }
  }

  async function startRun() {
    const requestedOrg = organizationId
    setMessage({ kind: 'status', text: copy.starting })
    try {
      await call('/api/lab/training', 'POST', {
        action: 'start', organizationId, experimentId, source, examples, teacherCredentialId: teacherId, teacherModel,
        computeCredentialId: computeId, baseModel, prompts, approvedBudgetUsd: Number(budget), maxHourlyUsd: Number(hourly),
        teacherBudgetUsd: Number(teacherBudget),
      })
      if (activeOrgRef.current === requestedOrg) setMessage({ kind: 'status', text: copy.started })
    } catch (error: any) {
      if (activeOrgRef.current === requestedOrg) setMessage({ kind: 'alert', text: fmt(copy.notStarted, { reason: copy.errors[error.message] ?? (error.problems?.length ? error.problems.join(' ') : error.message) }) })
    }
    if (activeOrgRef.current === requestedOrg) await load()
  }

  async function refreshRun(runId: string) {
    const requestedOrg = organizationId
    try { await call('/api/lab/training', 'POST', { action: 'refresh', organizationId, runId }); if (activeOrgRef.current === requestedOrg) await load() }
    catch (error: any) { if (activeOrgRef.current === requestedOrg) setMessage({ kind: 'alert', text: fmt(copy.statusFailed, { code: explain(error.message) }) }) }
  }

  async function download(runId: string) {
    const requestedOrg = organizationId
    try {
      const response = await fetch(`/api/lab/training/download?organizationId=${requestedOrg}&runId=${runId}`, { credentials: 'include', cache: 'no-store' })
      const json = await response.json().catch(() => null)
      if (activeOrgRef.current !== requestedOrg) return
      if (response.ok && json?.ok && Array.isArray(json.files)) {
        setFiles(current => ({ ...current, [runId]: json.files }))
      } else {
        setMessage({ kind: 'alert', text: fmt(copy.downloadUnavailable, { code: explain(json?.error || 'network') }) })
      }
    } catch {
      if (activeOrgRef.current === requestedOrg) {
        setMessage({ kind: 'alert', text: fmt(copy.downloadUnavailable, { code: explain('network') }) })
      }
    }
  }
  const fileUrl = (runId: string, path: string) => `/api/lab/training/download?organizationId=${organizationId}&runId=${runId}&path=${encodeURIComponent(path)}`

  if (!orgs.length) return (
    <section className="rounded-lg border p-4 text-sm" dir={language === 'ar' ? 'rtl' : undefined}>
      {workspaceLoad === 'loading' ? <p role="status" aria-busy="true">…</p> : null}
      {workspaceLoad === 'error' ? <p role="alert">{message?.text ?? fmt(copy.loadFailed, { code: 'network' })}</p> : null}
      {workspaceLoad === 'ready' ? <><p>{copy.noOrg}</p><button type="button" disabled={busy} onClick={() => { void initializeWorkspace() }} className="mt-3 rounded border px-3 py-2">{copy.workspaceButton}</button>{message ? <p role="alert">{message.text}</p> : null}</> : null}
    </section>
  )
  const teacherEntry = entry(credentials.find(item => item.id === teacherId)?.providerKind || '')

  return (
    <section className="space-y-6 rounded-lg border p-4" lang={language} dir={language === 'ar' ? 'rtl' : undefined}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{copy.title}</h2>
        <select className="rounded border border-white/30 bg-slate-900 px-2 py-1 text-sm text-white" value={orgKey} onChange={event => { const next = event.target.value; activeOrgRef.current = next.split('|')[0]; setCredentials([]); setRuns([]); setFiles({}); setCatalog([]); setKeyValue(''); setKeyLabel(''); setKeyEndpoint(''); setTeacherId(''); setComputeId(''); setComputeProviderKind(''); setBaseModel(''); setModelSelection(''); setMessage(null); setOrgKey(next) }}>
          {orgs.map(item => <option key={`${item.organizationId}|${item.experimentId}`} value={`${item.organizationId}|${item.experimentId}`}>{item.organizationName} · {item.projectName}</option>)}
        </select>
      </header>
      {message && <p role={message.kind} className="text-sm">{message.text}</p>}

      <div className="space-y-2">
        <h3 className="font-medium">{copy.keysHeading}</h3>
        <ul className="space-y-1 text-sm">
          {credentials.map(item => (
            <li key={item.id} className="flex items-center justify-between gap-2">
              <span>{entry(item.providerKind)?.name ?? item.providerKind} · {item.label}
                {!entry(item.providerKind)?.supports['training.execute'] && <em className="ms-2 opacity-70">{copy.teacherOnly}</em>}</span>
              {canManage && <button className="underline" disabled={busy} onClick={() => revokeKey(item.id)}>{copy.remove}</button>}
            </li>
          ))}
          {!credentials.length && <li className="opacity-70">{copy.noKeys}</li>}
        </ul>
        {canManage && (
          <div className="grid gap-2 sm:grid-cols-2">
            <select className="rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" value={keyKind} onChange={event => setKeyKind(event.target.value)}>
              {catalog.length === 0 ? <option value="">Providers unavailable — retry loading</option> : null}
              <optgroup label="Available adapters">{catalog.map(item => <option key={item.kind} value={item.kind}>{item.name}</option>)}</optgroup>
            </select>
            <input className="rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" placeholder={copy.keyNamePh} value={keyLabel} onChange={event => setKeyLabel(event.target.value)} />
            <input className="rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" type="password" autoComplete="off" placeholder={copy.keyPh} value={keyValue} onChange={event => setKeyValue(event.target.value)} />
            {keyKind === 'openai_compatible' && <input className="rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" placeholder={copy.endpointPh} value={keyEndpoint} onChange={event => setKeyEndpoint(event.target.value)} />}
            <p className="text-xs opacity-70 sm:col-span-2">{entry(keyKind)?.keyHelp} {entry(keyKind)?.unsupported['training.execute']}</p>
            <button className="rounded border px-3 py-1 sm:col-span-2" disabled={busy || !catalog.some(item => item.kind === keyKind) || !keyLabel || keyValue.length < 20} onClick={saveKey}>{copy.saveKey}</button>
          </div>
        )}
      </div>

      {canManage && (
        <div className="space-y-2">
          <h3 className="font-medium">{copy.chooseHeading}</h3>
          <div className="flex gap-4 text-sm">
            <label><input type="radio" checked={source === 'examples'} onChange={() => setSource('examples')} /> {copy.useExamples}</label>
            <label><input type="radio" checked={source === 'teacher'} onChange={() => setSource('teacher')} /> {copy.askTeacher}</label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {source === 'teacher' && <>
            <label className="text-sm">{copy.teacherKey}
              <select className="mt-1 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" value={teacherId} onChange={event => setTeacherId(event.target.value)}>
                <option value="">{copy.choose}</option>
                {teacherCredentials.map(item => <option key={item.id} value={item.id}>{entry(item.providerKind)?.name} · {item.label}</option>)}
              </select>
            </label>
            <label className="text-sm">{copy.teacherModel}
              <input className="mt-1 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" placeholder={teacherEntry?.kind === 'anthropic' ? 'claude-…' : copy.modelPh} value={teacherModel} onChange={event => setTeacherModel(event.target.value)} />
            </label>
            </>}
            <label className="text-sm">Training compute provider
              <select aria-label="Training compute provider" className="mt-1 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" value={computeProviderKind} onChange={event => { setComputeProviderKind(event.target.value); setComputeId(''); setBaseModel(''); setModelSelection('') }}>
                <option value="">Choose a training provider</option>
                {catalog.filter(item => item.supports['training.execute']).map(item => <option key={item.kind} value={item.kind}>{item.name}</option>)}
              </select>
            </label>
            <label className="text-sm">{copy.trainingAccount}
              <select className="mt-1 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" value={computeId} disabled={!computeProviderKind} onChange={event => setComputeId(event.target.value)}>
                <option value="">Choose a connected training account</option>
                {selectedComputeCredentials.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-sm">{copy.baseModel}
              <select aria-label="Base model to train" className="mt-1 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" value={modelSelection} disabled={!computeProviderKind} onChange={event => { const selected = event.target.value; setModelSelection(selected); setBaseModel(selected === 'custom' ? '' : selected) }}>
                <option value="">{modelsLoading ? 'Loading models…' : 'Choose a base model'}</option>
                {modelSuggestions.map(model => <option key={model} value={model}>{model}</option>)}
                <option value="custom">Specify another compatible model ID</option>
              </select>
              {modelSelection === 'custom' && <input aria-label="Custom base model ID" className="mt-2 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" placeholder="Organization/model-name" value={baseModel} onChange={event => setBaseModel(event.target.value)} />}
              <span className="mt-1 block text-xs text-slate-400">Available models depend on the chosen provider. A directory listing does not guarantee training compatibility, license or GPU availability.</span>
            </label>
            <label className="text-sm">{copy.budget}
              <input className="mt-1 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" type="number" min="0.5" max="1000" step="0.5" value={budget} onChange={event => setBudget(event.target.value)} />
            </label>
            <label className="text-sm">{copy.hourly}
              <input className="mt-1 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" type="number" min="0.05" max="1" step="0.05" value={hourly} onChange={event => setHourly(event.target.value)} />
            </label>
            {source === 'teacher' && <>
            <label className="text-sm">{copy.teacherBudget}
              <input className="mt-1 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" type="number" min="0.01" step="0.01" value={teacherBudget} onChange={event => setTeacherBudget(event.target.value)} />
            </label>
            <span />
            <p className="text-xs opacity-70 sm:col-span-2">{copy.teacherPriceHelp}</p>
            </>}
            {source === 'teacher' ? (
              <label className="text-sm sm:col-span-2">{fmt(copy.prompts, { n: promptCount })}
                <textarea className="mt-1 h-40 w-full rounded border px-2 py-1 font-mono text-xs" value={prompts} onChange={event => setPrompts(event.target.value)} />
              </label>
            ) : (
              <label className="text-sm sm:col-span-2">{fmt(copy.examples, { n: exampleCount })}
                <textarea className="mt-1 h-40 w-full rounded border px-2 py-1 font-mono text-xs" value={examples} onChange={event => setExamples(event.target.value)} />
              </label>
            )}
          </div>
          {!computeCredentials.length && <p className="text-sm">{copy.hfOnly}</p>}
          <button className="rounded border px-3 py-1" disabled={busy || !computeProviderKind || !computeId || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(baseModel) || itemCount < 20 || itemCount > 128 || (source === 'teacher' && (!teacherId || !teacherModel || !(Number(teacherBudget) > 0) || !(Number(teacherBudget) < Number(budget))))} onClick={startRun}>{copy.start}</button>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="font-medium">{copy.progressHeading}</h3>
        {!runs.length && <p className="text-sm opacity-70">{copy.noRuns}</p>}
        <ul className="space-y-3">
          {runs.map(run => (
            <li key={run.runId} className="rounded border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{(copy.stages as Record<string, string>)[run.stage] ?? run.stage}</strong>
                <span className="opacity-70">{run.teacherModel} → {run.baseModel} · {new Date(run.createdAt).toLocaleString(language)}</span>
              </div>
              <div className="my-2 h-2 w-full rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${run.progressPercent}%` }} /></div>
              {run.failureCode ? <p>{explain(run.failureCode)}</p> : run.statusMessage && <p>{run.statusMessage}</p>}
              <p className="opacity-70">{fmt(copy.budgetLine, { budget: Number(run.approvedBudgetUsd).toFixed(2), reserved: Number(run.committedMaxCostUsd).toFixed(2) })}</p>
              {Number(run.teacherReservedUsd) > 0 && <p className="opacity-70">{fmt(copy.teacherSpentLine, { spent: Number(run.teacherSpentUsd ?? 0).toFixed(4), reserved: Number(run.teacherReservedUsd).toFixed(4) })}</p>}
              <div className="mt-2 flex flex-wrap gap-3">
                {run.hfJobUrl && <a className="underline" href={run.hfJobUrl} target="_blank" rel="noreferrer">{copy.openJob}</a>}
                {canManage && !['completed', 'failed', 'cancelled'].includes(run.stage) && <button className="underline" disabled={busy} onClick={() => refreshRun(run.runId)}>{copy.checkStatus}</button>}
                {run.stage === 'completed' && <button className="underline" onClick={() => download(run.runId)}>{copy.downloadModel}</button>}
              </div>
              {files[run.runId] && (
                <ul className="mt-2 space-y-1">
                  {files[run.runId].map(file => <li key={file.path}><a className="underline" href={fileUrl(run.runId, file.path)}>{file.path}</a> <span className="opacity-70">({(file.size / 1e6).toFixed(1)} {copy.mb})</span></li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
