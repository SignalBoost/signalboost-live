'use client'

import { useCallback, useEffect, useState } from 'react'

type Signal = {signal:string; status:'unknown'|'stale'|'blocked'|'observed';lastObservedAt:string|null;source:string|null}
type Phase = {phase:number;status:string;certified:false;signals:Signal[]}
type Status = {ok:true;exactRevision:string;phases:Phase[];allObserved:boolean;allCertified:false;productionAuthorized:false;observationCount:number}
const PHASES:Record<number,string> = {1:'Factory',2:'Governance and identity',3:'Tenancy and BYOI',4:'Credit ledger',5:'Enterprise pilots'}
const STATUS_CLASS:Record<string,string> = {blocked:'text-red-700 dark:text-red-300',stale:'text-amber-700 dark:text-amber-300',unknown:'opacity-70',observed:'text-green-700 dark:text-green-300'}
export default function LabPhasesObservabilityPanel() {
  const [result,setResult] = useState<Status|null>(null)
  const [error,setError] = useState<string|null>(null)
  const [loading,setLoading] = useState(false)
  const refresh=useCallback(async()=>{
    setLoading(true)
    try {
      const response=await fetch('/api/admin/lab-phase-observability',{cache:'no-store'})
      if (!response.ok) throw new Error('Monitoring unavailable or deployment configuration incomplete')
      const payload=await response.json()
      if (!payload.ok || !Array.isArray(payload.phases)) throw new Error('Invalid monitoring response')
      setResult(payload as Status);setError(null)
    } catch(e) {setError(e instanceof Error?e.message:'Monitoring unavailable');setResult(null)}
    finally {setLoading(false)}
  },[])
  useEffect(()=>{void refresh()},[refresh])
  return <section className="rounded-lg border p-4" aria-label="Lab phases observability">
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-semibold">Lab Phases 1–5 · Observability</h2>
      <button type="button" onClick={()=>void refresh()} disabled={loading} className="rounded border px-3 py-1 text-xs">{loading?'Refreshing…':'Refresh'}</button>
    </div>
    <p className="mt-2 text-xs opacity-70">Only verified runtime observations are counted. Green CI is not production evidence or certification.</p>
    {error?<p role="alert" className="mt-3 text-sm text-amber-700 dark:text-amber-300">{error} — no health status can be confirmed.</p>:null}
    {!error && !result?<p className="mt-3 text-sm">No monitoring evidence loaded.</p>:null}
    {result?<div className="mt-3 space-y-3">
      <p className="text-xs opacity-70">Revision: <span className="font-mono">{result.exactRevision.slice(0,12)}</span> · {result.observationCount} observations · Certification: NOT CERTIFIED</p>
      <div className="grid gap-3 md:grid-cols-2">
        {result.phases.map(phase=><div key={phase.phase} className="rounded border p-3">
          <div className="flex justify-between gap-2 text-sm font-semibold"><span>Phase {phase.phase}: {PHASES[phase.phase]??'Lab'}</span><span className={STATUS_CLASS[phase.status]??''}>{phase.status.toUpperCase()}</span></div>
          <ul className="mt-2 space-y-1 text-xs">{phase.signals.map(signal=><li key={signal.signal} className="flex justify-between gap-2"><span>{signal.signal.replaceAll('_',' ')}</span><span className={STATUS_CLASS[signal.status]??''}>{signal.status}</span></li>)}</ul>
        </div>)}
      </div>
    </div>:null}
  </section>
}
