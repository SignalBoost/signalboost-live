import type { KnowledgeGap } from './index'
import { generateKnowledgeGaps, type KnowledgeGapSignal } from './gaps'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

const STOP_WORDS = new Set([
  'about','after','again','against','also','among','been','being','between','could','from','have','into','more','most','other','over','such','than','that','their','there','these','they','this','through','under','using','what','when','where','which','while','with','would','your','source','summary','system','systems','knowledge','learning','verified','evidence','cos',
])

type RetainedRow = {
  subject?: string | null
  summary?: string | null
  source_kind?: string | null
  source_title?: string | null
  observed_at?: string | null
  confidence?: number | null
}

function words(value:string):string[]{
  return value.toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').map(v=>v.trim()).filter(v=>v.length>=4&&!STOP_WORDS.has(v)&&!/^[0-9]+$/.test(v))
}

function topTerms(rows:RetainedRow[], subject:string, offset:number):string[]{
  const counts=new Map<string,number>()
  for(const row of rows){
    if(String(row.subject||'')!==subject)continue
    for(const word of words(`${row.source_title||''} ${row.summary||''}`))counts.set(word,(counts.get(word)||0)+1)
  }
  const subjectWords=new Set(words(subject))
  const ranked=[...counts.entries()].filter(([word])=>!subjectWords.has(word)).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([word])=>word)
  if(!ranked.length)return []
  const start=offset%ranked.length
  return [...ranked.slice(start,start+4),...ranked.slice(0,Math.max(0,start+4-ranked.length))].slice(0,4)
}

function corpusExpansionGaps(rows:RetainedRow[]):KnowledgeGap[]{
  const bySubject=new Map<string,RetainedRow[]>()
  for(const row of rows){
    const subject=String(row.subject||'').trim()
    if(!subject)continue
    const list=bySubject.get(subject)||[];list.push(row);bySubject.set(subject,list)
  }
  const epoch=Math.max(0,Math.floor(rows.length/25))
  return [...bySubject.entries()]
    .sort((a,b)=>a[1].length-b[1].length||a[0].localeCompare(b[0]))
    .slice(0,12)
    .map(([subject,subjectRows],index)=>{
      const kinds=[...new Set(subjectRows.map(row=>String(row.source_kind||'')).filter(Boolean))]
      const terms=topTerms(rows,subject,epoch+index)
      const freshness=subjectRows.some(row=>row.observed_at&&Date.now()-new Date(row.observed_at).getTime()>90*24*60*60*1000)
      const weak=subjectRows.some(row=>Number(row.confidence||0)<0.8)
      const focus=terms.length?terms.join(', '):'adjacent concepts, dependencies, failure modes, and current best practices'
      const question=weak
        ? `What independent evidence can validate, correct, or extend COS's lower-confidence knowledge about ${subject}, especially around ${focus}?`
        : freshness
          ? `What has changed recently in ${subject}, especially around ${focus}, and which retained COS assumptions need updating?`
          : `What important adjacent concepts, relationships, failure modes, and current best practices are missing from COS's retained knowledge about ${subject}, especially around ${focus}?`
      return {
        id:`corpus-gap:${epoch}:${index}:${subject.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,48)}`,
        subject,
        question,
        portableIds:['cos'],
        expectedReuse:Math.max(3,20-subjectRows.length),
        expectedAvoidedCostUsd:1,
        urgency:Math.min(95,55+(weak?20:0)+(freshness?15:0)+(kinds.length<2?10:0)),
        evidence:[`retained_records=${subjectRows.length}`,`source_kinds=${kinds.join(',')||'unknown'}`,`dynamic_terms=${focus}`],
      }
    })
}

async function queuedSignals():Promise<KnowledgeGapSignal[]>{
  const db=cosServiceDb();if(!db)return []
  try{
    const {data}=await db.from('cos_learning_gaps').select('*').in('status',['pending','failed']).order('last_seen_at',{ascending:false}).limit(25)
    return (data||[]).map((row:any)=>({taskId:String(row.task_id||'support'),subject:String(row.subject||'general reasoning'),capability:String(row.capability||'general_reasoning'),objective:String(row.question||''),confidence:Number(row.confidence||0),escalated:true,succeeded:false,repeatedCount:Number(row.repeated_count||1),evidence:row.escalation_reason?[String(row.escalation_reason)]:[],portableIds:['cos']}))
  }catch{return []}
}

export async function generateDynamicKnowledgeGaps(limit=12):Promise<{gaps:KnowledgeGap[];retained:number;reasoningGaps:number}>{
  const db=cosServiceDb();if(!db)return {gaps:[],retained:0,reasoningGaps:0}
  const [{data:rows},{count}]=await Promise.all([
    db.from('cos_continuous_learning').select('subject,summary,source_kind,source_title,observed_at,confidence').order('observed_at',{ascending:false}).limit(300),
    db.from('cos_continuous_learning').select('*',{count:'exact',head:true}),
  ])
  const signals=await queuedSignals()
  const operational=generateKnowledgeGaps(signals)
  const corpus=corpusExpansionGaps((rows||[]) as RetainedRow[])
  const seen=new Set<string>()
  const gaps=[...operational,...corpus].filter(gap=>{
    const key=`${gap.subject.toLowerCase()}::${gap.question.toLowerCase()}`
    if(seen.has(key))return false
    seen.add(key);return true
  }).sort((a,b)=>b.urgency-a.urgency||b.expectedReuse-a.expectedReuse).slice(0,Math.max(1,Math.min(25,limit)))
  return {gaps,retained:count||0,reasoningGaps:operational.length}
}
