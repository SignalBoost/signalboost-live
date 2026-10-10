'use client'

import { useCallback, useEffect, useState } from 'react'
import LabOwnerActivationPanel from './LabOwnerActivationPanel.tsx'
import { uiText } from '@/lib/i18n/uiText'


type Signal = {signal:string; status:'unknown'|'stale'|'blocked'|'observed';lastObservedAt:string|null;source:string|null}
type Phase = {phase:number;status:string;certified:false;signals:Signal[]}
type Status = {ok:true;exactRevision:string;phases:Phase[];allObserved:boolean;allCertified:false;productionAuthorized:false;observationCount:number}
type Readiness = {ok:true;organizations:number;readyForMonitoring:boolean;blockers:string[]}
const PHASES:Record<number,string> = {1:'Factory',2:'Governance and identity',3:'Tenancy and BYOI',4:'Credit ledger',5:'Enterprise pilots'}
const STATUS_CLASS:Record<string,string> = {blocked:'text-red-700 dark:text-red-300',stale:'text-amber-700 dark:text-amber-300',unknown:'opacity-70',observed:'text-green-700 dark:text-green-300'}
export default function LabPhasesObservabilityPanel() {
  const [result,setResult] = useState<Status|null>(null)
  const [readiness,setReadiness] = useState<Readiness|null>(null)
  const [error,setError] = useState<string|null>(null)
  const [loading,setLoading] = useState(false)
  const refresh=useCallback(async()=>{
    setLoading(true)
    try {
      const preflight=await fetch('/api/admin/lab-phase-observability/readiness',{cache:'no-store'})
      const readinessPayload=preflight.ok?await preflight.json():null
      setReadiness(readinessPayload?.ok?readinessPayload:null)
      const response=await fetch('/api/admin/lab-phase-observability',{cache:'no-store'})
      if (!response.ok) throw new Error('Monitoring unavailable or deployment configuration incomplete')
      const payload=await response.json()
      if (!payload.ok || !Array.isArray(payload.phases)) throw new Error('Invalid monitoring response')
      setResult(payload as Status);setError(null)
    } catch(e) {setError(e instanceof Error?e.message:'Monitoring unavailable');setResult(null)}
    finally {setLoading(false)}
  },[])
  useEffect(()=>{void refresh()},[refresh])
  return <section className="rounded-lg border p-4" aria-label={uiText('generatedUi.u_d6f44194ef6ed89b')}>
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-semibold">{uiText('generatedUi.u_8291beffd4135edc')}</h2>
      <button type="button" onClick={()=>void refresh()} disabled={loading} className="rounded border px-3 py-1 text-xs">{loading?uiText('generatedUi.u_1c0def7be0607b96'):uiText('generatedUi.u_0e91610117029a62')}</button>
    </div>
    <p className="mt-2 text-xs opacity-70">{uiText('generatedUi.u_620674f8421c829c')}</p>
    {readiness?<p className="mt-3 text-xs" role="status">{uiText('generatedUi.u_54ef019f0e45b3a9')} {readiness.readyForMonitoring?uiText('generatedUi.u_3a7255695e84b1c8'):uiText('generatedUi.u_6973dddd3ef9cb6a')}{uiText('generatedUi.u_0c44e63661f33408')} {readiness.organizations}. {readiness.blockers.join(', ').replaceAll('_',' ')}.</p>:<p className="mt-3 text-xs" role="status">{uiText('generatedUi.u_f5484159f7f35567')}</p>}
    {(readiness===null || readiness.organizations===0)?<LabOwnerActivationPanel onActivated={()=>void refresh()} />:null}
    {error?<p role="alert" className="mt-3 text-sm text-amber-700 dark:text-amber-300">{error} {uiText('generatedUi.u_65375e85dae2bcda')}</p>:null}
    {!error && !result?<p className="mt-3 text-sm">{uiText('generatedUi.u_6a4c268f6226a56e')}</p>:null}
    {result?<div className="mt-3 space-y-3">
      <p className="text-xs opacity-70">{uiText('generatedUi.u_da79c25ccbcd03e4')} <span className="font-mono">{result.exactRevision.slice(0,12)}</span> · {result.observationCount} {uiText('generatedUi.u_b509a8029566b6b0')}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {result.phases.map(phase=><div key={phase.phase} className="rounded border p-3">
          <div className="flex justify-between gap-2 text-sm font-semibold"><span>{uiText('generatedUi.u_46342ec1eec9d78d')} {phase.phase}: {PHASES[phase.phase]??uiText('generatedUi.u_efdcf466b553a068')}</span><span className={STATUS_CLASS[phase.status]??''}>{phase.status.toUpperCase()}</span></div>
          <ul className="mt-2 space-y-1 text-xs">{phase.signals.map(signal=><li key={signal.signal} className="flex justify-between gap-2"><span>{signal.signal.replaceAll('_',' ')}</span><span className={STATUS_CLASS[signal.status]??''}>{signal.status}</span></li>)}</ul>
        </div>)}
      </div>
    </div>:null}
  </section>
}
