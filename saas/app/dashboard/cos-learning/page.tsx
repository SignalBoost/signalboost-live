'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { COS_LEARNING_COPY, type CosLearningLanguage } from '@/lib/i18n/cosLearningCopy'

type Readiness = { ok?:boolean; enabled?:boolean; questions?:number; sourceAdapters?:string[]; error?:string }
type LearningResult = {
  ok?: boolean
  curriculumQuestions?: number
  sourceAdapters?: string[]
  result?: {
    gapsConsidered?: number
    documentsAcquired?: number
    accepted?: number
    rejected?: Record<string, number>
    sourceErrors?: Record<string, number>
    externalCostUsd?: number
  }
  error?: string
}

async function readResponse(response: Response): Promise<any> {
  const text = await response.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return { error: `${response.status} ${response.statusText}: ${text.slice(0, 500)}` } }
}

export default function CosLearningPage() {
  const { lang } = useTranslation()
  const copy = COS_LEARNING_COPY[(lang in COS_LEARNING_COPY ? lang : 'en') as CosLearningLanguage]
  const [status,setStatus]=useState<Readiness|null>(null)
  const [result,setResult]=useState<LearningResult|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')

  async function load(){
    setError('')
    try{
      const response=await fetch('/api/admin/cos-learning/foundational',{cache:'no-store'})
      const body=await readResponse(response)
      setStatus(body)
      if(!response.ok)setError(body?.error||copy.requestFailed)
    }catch(e){setError(e instanceof Error?e.message:copy.requestFailed)}
  }

  async function run(){
    setBusy(true);setError('')
    try{
      const response=await fetch('/api/admin/cos-learning/foundational',{method:'POST'})
      const body=await readResponse(response)
      setResult(body)
      if(!response.ok)setError(body?.error||copy.requestFailed)
      await load()
    }catch(e){setError(e instanceof Error?e.message:copy.requestFailed)}finally{setBusy(false)}
  }

  useEffect(()=>{void load()},[])
  const r=result?.result
  return <div className="min-h-[calc(100vh-80px)] bg-bg px-6 pb-16 pt-8 text-text"><div className="mx-auto max-w-5xl space-y-5">
    <div><h1 className="text-2xl font-semibold">{copy.title}</h1><p className="mt-1 text-sm text-text-muted">{copy.subtitle}</p></div>
    <div className="grid gap-3 md:grid-cols-3"><Card label={status?.enabled?copy.liveEnabled:copy.liveDisabled} value={status?.enabled?'✓':'—'}/><Card label={copy.studyQuestions} value={String(status?.questions??'—')}/><Card label={copy.sourceAdapters} value={String(status?.sourceAdapters?.length??'—')}/></div>
    <div className="flex flex-wrap gap-3"><button onClick={run} disabled={busy||!status?.enabled} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">{busy?copy.running:copy.run}</button><button onClick={load} disabled={busy} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold">{copy.refresh}</button></div>
    {error&&<div className="rounded-md border border-danger/40 bg-surface p-4 text-sm text-danger whitespace-pre-wrap">{error}</div>}
    <section className="rounded-md border border-border bg-surface p-4">{r?<div className="grid gap-3 md:grid-cols-4"><Card label={copy.questionsProcessed} value={String(r.gapsConsidered??0)}/><Card label={copy.documentsAcquired} value={String(r.documentsAcquired??0)}/><Card label={copy.knowledgeAccepted} value={String(r.accepted??0)}/><Card label={copy.externalCost} value={`$${Number(r.externalCostUsd??0).toFixed(4)}`}/>{r.rejected&&Object.keys(r.rejected).length>0&&<div className="md:col-span-4 text-xs text-text-muted">{copy.rejected}: {Object.entries(r.rejected).map(([k,v])=>`${k}: ${v}`).join(' · ')}</div>}{r.sourceErrors&&Object.keys(r.sourceErrors).length>0&&<div className="md:col-span-4 rounded-md border border-warning/40 p-3 text-xs text-text-muted">Source errors: {Object.entries(r.sourceErrors).map(([k,v])=>`${k}: ${v}`).join(' · ')}</div>}</div>:<p className="text-sm text-text-muted">{copy.noRun}</p>}</section>
  </div></div>
}
function Card({label,value}:{label:string;value:string}){return <div className="rounded-md border border-border bg-surface p-4"><div className="text-xs text-text-muted">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div></div>}
