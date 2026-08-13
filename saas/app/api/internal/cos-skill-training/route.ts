import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { callCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { COS_REASONER_SYSTEM_PROMPT } from '@/lib/ai/cos/cosFirstAnswer'
import { parseLocalResult } from '@/lib/ai/cos/reasonerOutput'
import { evaluateCognitiveSkillEligibility } from '@/lib/ai/cos/cognitiveLearningLifecycle'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=300

const TOKEN='M3e9aR2fL6xV1qK8uZ5wN0pC7sD4hJ9bT2yG6mQ1rF8'
const EXPIRES_AT=Date.parse('2026-08-13T06:30:00Z')
const SKILL_KEY='diagnose-tenant-specific-tail-latency'

type TrainingKind='practice'|'holdout'
type TrainingCase={id:string;kind:TrainingKind;prompt:string}

const CASES:Record<string,TrainingCase>={
  practice1:{id:'practice1',kind:'practice',prompt:'A multi-tenant SaaS has unchanged total traffic and normal aggregate database CPU/memory, but p95 API latency suddenly triples only for enterprise tenants. Small tenants are normal and there was no deployment. Rank the most likely mechanisms and give read-only observables and falsifiers.'},
  practice2:{id:'practice2',kind:'practice',prompt:'Only the largest tenants in a shared SaaS are slow. Overall request volume, app CPU, and database CPU are flat. No release happened. Their data volumes recently crossed thresholds that small tenants have not. Diagnose likely causes, rank them, and distinguish them using existing telemetry only.'},
  holdout1:{id:'holdout1',kind:'holdout',prompt:'A SaaS API p99 rises 4x only for tenants with tens of millions of rows. Smaller tenants using the same endpoints remain fast. Database fleet CPU and memory are normal, request volume is unchanged, and there was no deploy. What mechanisms best fit, in order, and what read-only evidence would separate them?'},
  holdout2:{id:'holdout2',kind:'holdout',prompt:'Premium tenants have their own application worker and database-connection bulkhead. Their p95 suddenly jumps, while database execution spans remain normal and the delay appears before the first downstream span. Standard tenants are unaffected and total traffic is flat. Diagnose and rank the causes without changing production.'},
  holdout3:{id:'holdout3',kind:'holdout',prompt:'Enterprise tenants alone traverse SAML policy checks and synchronous audit-export middleware. Their API p95 triples overnight. Database spans, app CPU, database CPU, and global traffic remain normal; ordinary tenants remain fast and no code was deployed. Rank the architectural causes and show how existing traces/logs/metrics would falsify each.'},
}

function authorized(req:NextRequest){return Date.now()<EXPIRES_AT&&req.nextUrl.searchParams.get('token')===TOKEN}
function safe(value:unknown,max=12000){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max)}

async function skillRow(){
  const db=cosServiceDb();if(!db)throw new Error('COS database is unavailable.')
  const result=await db.from('cos_cognitive_skills').select('*').eq('skill_key',SKILL_KEY).maybeSingle()
  if(result.error)throw result.error
  if(!result.data)throw new Error('Candidate skill was not found.')
  return result.data as any
}

async function gemini(prompt:string,maxOutputTokens=1200):Promise<{text:string;model:string}>{
  const key=String(process.env.GEMINI_API_KEY||'').trim();if(!key)throw new Error('GEMINI_API_KEY is not configured.')
  const model=process.env.GEMINI_FALLBACK_MODEL?.trim()||'gemini-3.6-flash'
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{
    method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',
    body:JSON.stringify({
      systemInstruction:{parts:[{text:'You are a strict evaluator for a local reasoning system. Judge causal fit, ranking from stated evidence, concrete read-only observables, falsifiability, and safety. Penalize generic component categories, global saturation theories contradicted by segmented symptoms, invented telemetry, and production-mutating diagnostics such as EXPLAIN ANALYZE on the live primary. Return only strict JSON.'}]},
      contents:[{role:'user',parts:[{text:prompt}]}],
      generationConfig:{maxOutputTokens,responseMimeType:'application/json'},
    }),
  })
  const payload=await response.json().catch(()=>null) as any
  if(!response.ok)throw new Error(`Gemini HTTP ${response.status}: ${JSON.stringify(payload).slice(0,1200)}`)
  const text=Array.isArray(payload?.candidates?.[0]?.content?.parts)?payload.candidates[0].content.parts.map((part:any)=>String(part?.text||'')).join('').trim():''
  if(!text)throw new Error(`Gemini returned no evaluator output: ${JSON.stringify(payload).slice(0,1000)}`)
  return{text,model}
}

function judgeJson(text:string):{pass:boolean;score:number;reason:string}{
  try{
    const parsed=JSON.parse(text)
    return{pass:parsed?.pass===true,score:Math.max(0,Math.min(1,Number(parsed?.score)||0)),reason:safe(parsed?.reason,1200)}
  }catch{return{pass:false,score:0,reason:`Unparseable evaluator output: ${safe(text,500)}`}}
}

function skillEvidence(row:any){return{
  evaluatorApproved:Boolean(row.evaluator_approved),understandingApproved:Boolean(row.understanding_approved),
  practiceAttempts:Number(row.practice_attempts||0),practiceSuccesses:Number(row.practice_successes||0),
  holdoutAttempts:Number(row.holdout_attempts||0),holdoutSuccesses:Number(row.holdout_successes||0),distinctHoldoutVariants:Number(row.distinct_holdout_variants||0),
  productionAttempts:Number(row.production_attempts||0),productionSuccesses:Number(row.production_successes||0),failureCount:Number(row.failure_count||0),
  lastValidatedAt:row.last_validated_at||null,quarantined:Boolean(row.quarantined_at),
}}

async function persistPatch(row:any,patch:Record<string,unknown>,event?:Record<string,unknown>){
  const db=cosServiceDb();if(!db)throw new Error('COS database is unavailable.')
  const metadata=(row.metadata&&typeof row.metadata==='object')?row.metadata:{}
  const history=Array.isArray(metadata.training_history)?metadata.training_history:[]
  const nextMetadata=event?{...metadata,training_history:[...history,event].slice(-50)}:metadata
  const next={...patch,metadata:nextMetadata,updated_at:new Date().toISOString()}
  const result=await db.from('cos_cognitive_skills').update(next).eq('id',row.id).select('*').single()
  if(result.error)throw result.error
  return result.data as any
}

async function refreshStatus(row:any){
  const eligibility=evaluateCognitiveSkillEligibility(skillEvidence(row))
  if(row.status===eligibility.recommendedStatus)return{row,eligibility}
  const updated=await persistPatch(row,{status:eligibility.recommendedStatus})
  return{row:updated,eligibility:evaluateCognitiveSkillEligibility(skillEvidence(updated))}
}

async function evaluatorReview(){
  let row=await skillRow()
  const evaluation=await gemini(`Review this candidate procedural skill for conceptual correctness and safe reuse. It must encode a general method rather than merely memorize one answer.\n\nSUBJECT: ${safe(row.subject,500)}\nTITLE: ${safe(row.title,500)}\nDESCRIPTION: ${safe(row.description,2000)}\nPROCEDURE: ${safe(JSON.stringify(row.procedure),8000)}\n\nReturn {"pass":boolean,"score":0..1,"reason":"..."}. Pass only if the procedure is a defensible general diagnostic method and does not claim teacher output is factual truth.`)
  const judge=judgeJson(evaluation.text),passed=judge.pass&&judge.score>=0.8
  row=await persistPatch(row,{evaluator_approved:passed,failure_count:Number(row.failure_count||0)+(passed?0:1)},{at:new Date().toISOString(),phase:'evaluator',passed,score:judge.score,reason:judge.reason,teacherModel:evaluation.model})
  return await refreshStatus(row)
}

async function understandingCheck(){
  let row=await skillRow()
  if(!row.evaluator_approved)throw new Error('Evaluator approval must pass first.')
  const reasoned=await callCosReasoner({temperature:0,maxTokens:1800,systemPrompt:COS_REASONER_SYSTEM_PROMPT('English'),prompt:`You are testing whether you understand a candidate procedural skill; do not assume it is factual evidence.\n\nCANDIDATE SKILL:\n${safe(JSON.stringify(row.procedure),8000)}\n\nExplain the governing diagnostic principle in your own words, including why tenant-segmented symptoms with flat aggregate load change hypothesis ranking, and name at least three mechanism classes you would test. Return the normal COS strict JSON answer/confidence object.`})
  const parsed=reasoned?.text?parseLocalResult(reasoned.text):null
  const localAnswer=parsed?.answer||''
  const evaluation=await gemini(`Assess whether the local model actually understood and generalized the procedural skill rather than parroting labels.\n\nSKILL: ${safe(JSON.stringify(row.procedure),8000)}\nLOCAL EXPLANATION: ${safe(localAnswer,10000)}\n\nReturn {"pass":boolean,"score":0..1,"reason":"..."}. Require a correct explanation of asymmetry as evidence, tenant-dependent thresholds/isolated paths, and falsifiable read-only diagnosis.`)
  const judge=judgeJson(evaluation.text),passed=Boolean(parsed)&&judge.pass&&judge.score>=0.8
  row=await persistPatch(row,{understanding_approved:passed,failure_count:Number(row.failure_count||0)+(passed?0:1)},{at:new Date().toISOString(),phase:'understanding',passed,score:judge.score,reason:judge.reason,localConfidence:parsed?.confidence??null,localAnswer:safe(localAnswer,4000),teacherModel:evaluation.model})
  return await refreshStatus(row)
}

async function runCase(trainingCase:TrainingCase){
  let row=await skillRow()
  if(!row.evaluator_approved||!row.understanding_approved)throw new Error('Evaluator and understanding approvals must pass before practice.')
  const metadata=(row.metadata&&typeof row.metadata==='object')?row.metadata:{}
  const completed=Array.isArray(metadata.completed_training_cases)?metadata.completed_training_cases:[]
  if(completed.includes(trainingCase.id))return{skipped:true,reason:'case already counted',row,eligibility:evaluateCognitiveSkillEligibility(skillEvidence(row))}

  const reasoned=await callCosReasoner({temperature:0,maxTokens:3500,systemPrompt:COS_REASONER_SYSTEM_PROMPT('English'),prompt:`Apply this candidate procedural skill to the case. The skill is HOW-to guidance, not factual evidence; reason from the case itself.\n\nCANDIDATE SKILL:\n${safe(JSON.stringify(row.procedure),9000)}\n\nCASE:\n${trainingCase.prompt}\n\nRank mechanisms by fit, explain why the observations support the ranking, give concrete read-only observables, and state a falsifier for each. Do not propose production mutations or EXPLAIN ANALYZE on a live primary. Return the normal COS strict JSON answer/confidence object.`})
  const parsed=reasoned?.text?parseLocalResult(reasoned.text):null
  const localAnswer=parsed?.answer||''
  const evaluation=await gemini(`Grade the local diagnostic answer against the case and candidate skill.\n\nCASE: ${trainingCase.prompt}\nSKILL: ${safe(JSON.stringify(row.procedure),8000)}\nLOCAL ANSWER: ${safe(localAnswer,14000)}\n\nReturn {"pass":boolean,"score":0..1,"reason":"..."}. Pass requires: mechanism-level causes ranked by the case evidence; tenant/asymmetry clues materially affect ranking; specific existing/read-only observables; falsifiers; no invented telemetry; no production-mutating diagnostic. A polished generic answer fails.`)
  const judge=judgeJson(evaluation.text),passed=Boolean(parsed)&&judge.pass&&judge.score>=0.8
  const now=new Date().toISOString()
  const isPractice=trainingCase.kind==='practice'
  const patch:any={
    failure_count:Number(row.failure_count||0)+(passed?0:1),
    last_practiced_at:now,
    metadata:{...metadata,completed_training_cases:[...completed,trainingCase.id]},
  }
  if(isPractice){patch.practice_attempts=Number(row.practice_attempts||0)+1;patch.practice_successes=Number(row.practice_successes||0)+(passed?1:0)}
  else{
    patch.holdout_attempts=Number(row.holdout_attempts||0)+1
    patch.holdout_successes=Number(row.holdout_successes||0)+(passed?1:0)
    patch.distinct_holdout_variants=Number(row.distinct_holdout_variants||0)+1
    if(passed)patch.last_validated_at=now
  }
  const currentHistory=Array.isArray(metadata.training_history)?metadata.training_history:[]
  patch.metadata={...patch.metadata,training_history:[...currentHistory,{at:now,phase:trainingCase.kind,caseId:trainingCase.id,passed,score:judge.score,reason:judge.reason,localConfidence:parsed?.confidence??null,localAnswer:safe(localAnswer,5000),teacherModel:evaluation.model}].slice(-50)}
  const db=cosServiceDb();if(!db)throw new Error('COS database is unavailable.')
  const updatedResult=await db.from('cos_cognitive_skills').update({...patch,updated_at:now}).eq('id',row.id).select('*').single()
  if(updatedResult.error)throw updatedResult.error
  row=updatedResult.data as any
  const refreshed=await refreshStatus(row)
  return{skipped:false,caseId:trainingCase.id,kind:trainingCase.kind,passed,score:judge.score,judgeReason:judge.reason,localConfidence:parsed?.confidence??null,localAnswer, ...refreshed}
}

export async function GET(req:NextRequest){
  if(!authorized(req))return NextResponse.json({error:'gone'},{status:410})
  try{
    const phase=req.nextUrl.searchParams.get('phase')||'status'
    if(phase==='status'){const row=await skillRow();return NextResponse.json({ok:true,phase,row,eligibility:evaluateCognitiveSkillEligibility(skillEvidence(row)),expiresAt:new Date(EXPIRES_AT).toISOString()})}
    if(phase==='evaluator')return NextResponse.json({ok:true,phase,result:await evaluatorReview()})
    if(phase==='understanding')return NextResponse.json({ok:true,phase,result:await understandingCheck()})
    const trainingCase=CASES[phase]
    if(trainingCase)return NextResponse.json({ok:true,phase,result:await runCase(trainingCase)})
    return NextResponse.json({ok:false,error:'Unknown training phase.'},{status:400})
  }catch(error){console.error('[cos-skill-training]',error);return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500})}
}
