// saas/app/dashboard/cos-savings/page.tsx
'use client'
import {useEffect,useState} from 'react'
import {useTranslation} from '@/lib/i18n/useTranslation'
import {COS_SAVINGS_COPY,type CosSavingsLanguage} from '@/lib/i18n/cosSavingsCopy'
type BySource=Record<string,{count?:number;avoidedUsd?:number}>
type Independence={ok?:boolean;proofComplete?:boolean;provider?:{total?:number;local?:number;cloud?:number;localRate?:number;fallbackRate?:number};roi?:{tasks?:number;providerCalls?:number;avoidedUsd?:number;bySource?:BySource};error?:string}
type PodInfo={id:string;name:string;running:boolean;desiredStatus:string;costPerHr:number|null;uptimeSeconds:number}
type RunpodStatus={ok?:boolean;configured?:boolean;pod?:PodInfo;estimatedSessionCostUsd?:number;idleMinutes?:number|null;autoStopEnabled?:boolean;autoStopIdleThresholdMinutes?:number;error?:string}
async function readResponse(response:Response):Promise<any>{const text=await response.text();if(!text)return{};try{return JSON.parse(text)}catch{return{error:`${response.status} ${response.statusText}: ${text.slice(0,500)}`}}}
export default function CosSavingsPage(){
  const{lang}=useTranslation()
  const copy=COS_SAVINGS_COPY[(lang in COS_SAVINGS_COPY?lang:'en')as CosSavingsLanguage]
  const[data,setData]=useState<Independence|null>(null)
  const[pod,setPod]=useState<RunpodStatus|null>(null)
  const[busy,setBusy]=useState(false)
  const[stopping,setStopping]=useState(false)
  const[error,setError]=useState('')

  async function load(){
    setBusy(true);setError('')
    try{
      const [independenceRes,podRes]=await Promise.all([
        fetch('/api/admin/cos-independence',{cache:'no-store'}),
        fetch('/api/admin/cos-runpod',{cache:'no-store'}),
      ])
      const independenceBody=await readResponse(independenceRes)
      const podBody=await readResponse(podRes)
      setData(independenceBody)
      setPod(podBody)
      if(!independenceRes.ok)setError(independenceBody?.error||copy.requestFailed)
    }catch(e){setError(e instanceof Error?e.message:copy.requestFailed)}
    finally{setBusy(false)}
  }
  async function stopPodNow(){
    if(!window.confirm(copy.podStopConfirm))return
    setStopping(true)
    try{
      const response=await fetch('/api/admin/cos-runpod',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'stop'})})
      const body=await readResponse(response)
      if(!response.ok)setError(body?.error||copy.requestFailed)
      await load()
    }catch(e){setError(e instanceof Error?e.message:copy.requestFailed)}
    finally{setStopping(false)}
  }
  useEffect(()=>{void load()},[])

  const provider=data?.provider
  const roi=data?.roi
  const bySource=roi?.bySource||{}
  const sourceRows:Array<{key:string;label:string}> = [
    {key:'semantic_similarity',label:copy.sourceSemanticSimilarity},
    {key:'exact_cache',label:copy.sourceExactCache},
    {key:'local_reasoner',label:copy.sourceLocalReasoner},
  ]

  return <div className="min-h-[calc(100vh-80px)] bg-bg px-6 pb-16 pt-8 text-text">
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{copy.title}</h1>
        <p className="mt-1 text-sm text-text-muted">{copy.subtitle}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={load} disabled={busy} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold">{copy.refresh}</button>
      </div>

      {error&&<div className="rounded-md border border-danger/40 bg-surface p-4 text-sm text-danger whitespace-pre-wrap">{error}</div>}

      <div className={`rounded-md border p-4 text-sm font-semibold ${data?.proofComplete?'border-success/40 bg-success/10 text-success':'border-warning/40 bg-warning/10 text-warning'}`}>
        {data?.proofComplete?copy.independenceProven:copy.independenceValidating}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card label={copy.localCalls} value={String(provider?.local??'—')}/>
        <Card label={copy.cloudCalls} value={String(provider?.cloud??'—')}/>
        <Card label={copy.fallbackRate} value={provider?.fallbackRate!=null?`${(provider.fallbackRate*100).toFixed(1)}%`:'—'}/>
        <Card label={copy.costAvoided} value={roi?.avoidedUsd!=null?`$${roi.avoidedUsd.toFixed(4)}`:'—'}/>
      </div>

      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">{copy.bySourceTitle}</h2>
        {roi&&Object.keys(bySource).length>0
          ?<div className="mt-3 space-y-2">
            {sourceRows.map(row=>{
              const entry=bySource[row.key]
              if(!entry)return null
              return <div key={row.key} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                <span>{row.label}</span>
                <span className="tabular-nums text-text-muted">{entry.count??0} {copy.calls} · ${Number(entry.avoidedUsd??0).toFixed(4)}</span>
              </div>
            })}
          </div>
          :<p className="mt-2 text-sm text-text-muted">{copy.noData}</p>}
        <p className="mt-4 text-xs text-text-muted">{copy.estimateNote}</p>
      </section>

      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">{copy.podTitle}</h2>
        {!pod?.configured
          ?<p className="mt-2 text-sm text-text-muted">{copy.podNotConfigured}</p>
          :pod.error
            ?<p className="mt-2 text-sm text-danger">{pod.error}</p>
            :pod.pod
              ?<div className="mt-3 space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <Card label={pod.pod.running?copy.podRunning:copy.podStopped} value={pod.pod.running?'●':'○'}/>
                  <Card label={copy.podUptime} value={`${Math.floor(pod.pod.uptimeSeconds/3600)}h ${Math.floor((pod.pod.uptimeSeconds%3600)/60)}m`}/>
                  <Card label={copy.podSessionCost} value={`$${Number(pod.estimatedSessionCostUsd??0).toFixed(2)}`}/>
                </div>
                <p className="text-xs text-text-muted">
                  {pod.idleMinutes!=null?`${copy.podIdle} ${pod.idleMinutes}m. `:''}
                  {pod.autoStopEnabled?`${copy.podAutoStopOn} (${pod.autoStopIdleThresholdMinutes}m).`:copy.podAutoStopOff}
                </p>
                {pod.pod.running&&<button onClick={stopPodNow} disabled={stopping} className="rounded-md border border-danger/40 bg-surface px-4 py-2 text-sm font-semibold text-danger disabled:opacity-50">{stopping?copy.podStopping:copy.podStop}</button>}
              </div>
              :<p className="mt-2 text-sm text-text-muted">{copy.podNotConfigured}</p>}
      </section>
    </div>
  </div>
}

function Card({label,value}:{label:string;value:string}){return <div className="rounded-md border border-border bg-surface p-4"><div className="text-xs text-text-muted">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div></div>}
