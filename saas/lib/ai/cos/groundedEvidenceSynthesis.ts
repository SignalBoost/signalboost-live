import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'

export type GroundingEvidence = {
  id: string
  title: string
  url: string
  snippet: string
  observedAt?: string | null
  authority?: string | null
}

export type GroundedSynthesisResult = {
  status: 'answered' | 'insufficient' | 'conflict' | 'failed'
  answer: string | null
  sourceIds: string[]
  model: string
  invoked: boolean
  error: string | null
}

type Parsed = { status?: unknown; answer?: unknown; sourceIds?: unknown }

function evidenceBlock(sources: GroundingEvidence[]): string {
  return sources.map(source => [
    `[${source.id}] ${source.title}`,
    `URL: ${source.url}`,
    source.observedAt ? `OBSERVED: ${source.observedAt}` : '',
    source.authority ? `AUTHORITY: ${source.authority}` : '',
    `EVIDENCE: ${source.snippet}`,
  ].filter(Boolean).join('\n')).join('\n\n')
}

function parseJson(text: string): Parsed | null {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim()
  if (!raw) return null
  try { return JSON.parse(raw) as Parsed } catch {}
  const first=raw.indexOf('{'),last=raw.lastIndexOf('}')
  if(first<0||last<=first)return null
  try{return JSON.parse(raw.slice(first,last+1)) as Parsed}catch{return null}
}

function validIds(value: unknown, allowed: Set<string>): string[] {
  if(!Array.isArray(value))return[]
  const out:string[]=[]
  for(const item of value){const id=String(item||'').trim();if(allowed.has(id)&&!out.includes(id))out.push(id)}
  return out
}

export async function synthesizeGroundedEvidence(input:{
  question:string
  sources:GroundingEvidence[]
  minimumCitations:number
}):Promise<GroundedSynthesisResult>{
  const config=localInferenceConfigFromEnv(),model=config.model
  const allowed=new Set(input.sources.map(source=>source.id))
  const minimum=Math.max(1,Math.min(input.minimumCitations||1,input.sources.length||1))
  const systemPrompt=[
    'You are COS using evidence like a careful human who has just checked reliable sources.',
    'Your pretrained/model memory is NOT evidence for this task.',
    'Use ONLY the supplied evidence records for factual claims in the answer.',
    'If the supplied evidence disagrees on the requested current fact, return status="conflict" and do not choose a side.',
    'If the evidence does not establish the requested fact, return status="insufficient" and do not guess.',
    `For status="answered", cite at least ${minimum} supplied source id(s) in sourceIds.`,
    'Return strict JSON only: {"status":"answered|insufficient|conflict","answer":"... or empty","sourceIds":["ID"]}.',
  ].join(' ')
  const prompt=`QUESTION:\n${String(input.question||'').trim()}\n\nSOURCED EVIDENCE:\n${evidenceBlock(input.sources)}`
  const raw=await callLocalModel({prompt,systemPrompt,maxTokens:650,temperature:0},config)
  if(!raw)return{status:'failed',answer:null,sourceIds:[],model,invoked:true,error:'Local evidence synthesizer returned no response.'}
  const parsed=parseJson(raw)
  if(!parsed)return{status:'failed',answer:null,sourceIds:[],model,invoked:true,error:'Local evidence synthesizer returned invalid JSON.'}
  const status=String(parsed.status||'').toLowerCase()
  const ids=validIds(parsed.sourceIds,allowed)
  if(status==='conflict')return{status:'conflict',answer:null,sourceIds:ids,model,invoked:true,error:null}
  if(status==='insufficient')return{status:'insufficient',answer:null,sourceIds:ids,model,invoked:true,error:null}
  if(status!=='answered')return{status:'failed',answer:null,sourceIds:ids,model,invoked:true,error:`Unexpected evidence synthesis status: ${status||'missing'}.`}
  const answer=String(parsed.answer||'').trim()
  if(!answer)return{status:'failed',answer:null,sourceIds:ids,model,invoked:true,error:'Evidence synthesis produced an empty answer.'}
  if(ids.length<minimum)return{status:'failed',answer:null,sourceIds:ids,model,invoked:true,error:`Evidence synthesis cited ${ids.length} source(s); ${minimum} required.`}
  return{status:'answered',answer,sourceIds:ids,model,invoked:true,error:null}
}

export function renderGroundedEvidenceReply(input:{answer:string;sourceIds:string[];sources:GroundingEvidence[];groundedAt:string;fromMemory:boolean}):string{
  const map=new Map(input.sources.map(source=>[source.id,source]))
  const cited=input.sourceIds.map(id=>map.get(id)).filter((source):source is GroundingEvidence=>Boolean(source))
  const lines=cited.map(source=>`- [${source.id}] ${source.title} — ${source.url}${source.observedAt?` (observed ${source.observedAt})`:''}`)
  return `${input.answer.trim()}\n\nSources (${input.fromMemory?'recent sourced memory':'live verification'}, grounded ${input.groundedAt}):\n${lines.join('\n')}`
}
