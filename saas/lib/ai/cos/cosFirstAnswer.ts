import { createHash } from 'node:crypto'
import { callCosReasoner, resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { loadUserMemories } from '@/lib/ai/tools/userMemory'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { SupabaseExactCacheStore } from '@/lib/cos-core/storage/exactSupabase'
import { createExactCacheKey } from '@/lib/cos-core/layers/exact-cache'
import { KnowledgeLayer } from '@/lib/cos-core/layers/knowledge'
import { SupabaseKnowledgeStore } from '@/lib/cos-core/storage/supabase'
import { generateLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'
import { SupabaseAIROIMetricsSink } from '@/lib/cos-core/storage/supabase'
import { nearestFoundationalSubject } from '@/lib/cos-core/layers/learning/foundational'

export type COSFirstAnswerResult =
  | { handled: true; reply: string; confidence: number; provenance: COSProvenance }
  | { handled: false; confidence: number; reason: string; provenance: COSProvenance }

export type COSProvenance = {
  responseSource: 'semantic_cache' | 'semantic_similarity' | 'local_cos_reasoning' | 'external_fallback_required'
  similarityScore?: number
  externalAiInvoked: false
  localModelInvoked: boolean
  reasonerLabel: string | null
  internalSystemsConsulted: string[]
  knowledgeFactsUsed: number
  learnedItemsUsed: number
  userMemoriesUsed: number
}

const STOP_WORDS = new Set([
  'about','after','again','also','because','before','being','could','does','from','have','into','more','most','should','that','their','there','these','they','this','those','through','under','what','when','where','which','while','with','would','your','you','and','the','for','are','how','why',
  'suddenly','shows','showing','normal','unchanged','overall','only','remain','remains','unaffected','occurred','without','making','explain','distinguish','between','them','likely','causes','diagnose','rank','most',
])
const TECHNICAL_SIGNAL = /^(api|latency|p\d+|tenant|tenants|enterprise|database|databases|cpu|memory|saas|traffic|deployment|deployments|network|query|queries|pool|pools|queue|queues|cache|caches|connection|connections|resource|resources|shard|shards|lock|locks|routing|worker|workers|quota|quotas|rate|limits?|index|indexes|indices|auth|authorization)$/
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

type CachedCosAnswer = { reply:string; confidence:number; reasonerLabel:string|null }

function threshold(): number {
  const value = Number(process.env.COS_LOCAL_CONFIDENCE_THRESHOLD || '0.72')
  return Number.isFinite(value) ? Math.max(0.5, Math.min(0.98, value)) : 0.72
}

function semanticThreshold(): number {
  const value = Number(process.env.COS_SEMANTIC_SIMILARITY_THRESHOLD || '0.93')
  return Number.isFinite(value) ? Math.max(0.80, Math.min(0.999, value)) : 0.93
}

let knowledgeLayer: KnowledgeLayer | null | undefined
function semanticKnowledgeLayer(): KnowledgeLayer | null {
  if (knowledgeLayer !== undefined) return knowledgeLayer
  const db = cosServiceDb()
  knowledgeLayer = db
    ? new KnowledgeLayer({
        generateEmbedding: generateLocalEmbedding,
        store: new SupabaseKnowledgeStore(db),
        similarityThreshold: semanticThreshold(),
        onError: (error) => console.error('cosFirstAnswer: semantic cache error', error),
      })
    : null
  return knowledgeLayer
}

function estimatedInputCostPer1k(): number {
  const value = Number(process.env.COS_BASELINE_INPUT_COST_PER_1K || '0.003')
  return Number.isFinite(value) && value >= 0 ? value : 0.003
}
function estimatedOutputCostPer1k(): number {
  const value = Number(process.env.COS_BASELINE_OUTPUT_COST_PER_1K || '0.015')
  return Number.isFinite(value) && value >= 0 ? value : 0.015
}
function estimateAvoidedProviderCostUsd(promptCharsBefore: number, replyChars: number): number {
  const inputTokens = promptCharsBefore / 4
  const outputTokens = Math.max(replyChars, 200) / 4
  return (inputTokens / 1000) * estimatedInputCostPer1k() + (outputTokens / 1000) * estimatedOutputCostPer1k()
}

let roiSinkInstance: SupabaseAIROIMetricsSink | null | undefined
function roiSink(): SupabaseAIROIMetricsSink | null {
  if (roiSinkInstance !== undefined) return roiSinkInstance
  const db = cosServiceDb()
  roiSinkInstance = db ? new SupabaseAIROIMetricsSink(db) : null
  return roiSinkInstance
}

function recordAvoidedCost(source: 'semantic_similarity' | 'exact_cache' | 'local_reasoner', promptChars: number, replyChars: number, latencyMs: number): void {
  const sink = roiSink()
  if (!sink) return
  const avoided = estimateAvoidedProviderCostUsd(promptChars, replyChars)
  void sink.record({
    taskId: 'cos-first-answer',
    source,
    providerCalls: 0,
    estimatedProviderCostUsd: 0,
    estimatedCostAvoidedUsd: avoided,
    promptCharactersBefore: promptChars,
    promptCharactersAfter: promptChars,
    latencyMs,
  }).catch((error) => console.error('cosFirstAnswer: ROI recording failed', error))
}

export function queryTerms(prompt: string): string[] {
  const tokens = [...new Set(
    prompt.toLowerCase().replace(/[^a-z0-9\s_-]/g, ' ').split(/\s+/)
      .map(p => p.trim()).filter(p => p.length >= 3 && !STOP_WORDS.has(p)),
  )]
  return tokens
    .map((token, index) => ({
      token,
      index,
      score: (TECHNICAL_SIGNAL.test(token) ? 10 : 0) + (token.length >= 7 ? 2 : token.length >= 5 ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 12)
    .map(item => item.token)
}

function relevanceScore(value: unknown, terms: string[]): number {
  const text = safeText(value, 5000).toLowerCase()
  if (!text || !terms.length) return 0
  let score = 0
  for (const term of terms) {
    if (!text.includes(term)) continue
    score += TECHNICAL_SIGNAL.test(term) ? 3 : 1
  }
  return score
}

function rankRows<T>(rows: T[], terms: string[], text: (row: T) => string, limit: number): T[] {
  return rows
    .map((row, index) => ({ row, index, score: relevanceScore(text(row), terms) }))
    .filter(item => item.score >= 2)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(item => item.row)
}

function subjectFromPrompt(prompt: string): string {
  return nearestFoundationalSubject(prompt) || queryTerms(prompt).slice(0, 4).join(' ') || 'general reasoning'
}
function safeText(value: unknown, max = 1200): string { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max) }

async function recordKnowledgeGap(prompt: string, confidence: number, reason: string): Promise<void> {
  const db = cosServiceDb(); if (!db) return
  try {
    const subject = subjectFromPrompt(prompt), question = safeText(prompt, 2000), capability = 'general_reasoning'
    const existing = await db.from('cos_learning_gaps').select('id,repeated_count').eq('task_id','support').eq('subject',subject).eq('question',question).eq('capability',capability).maybeSingle()
    if (existing.data?.id) {
      await db.from('cos_learning_gaps').update({ confidence, escalation_reason: safeText(reason,1000), repeated_count:Number(existing.data.repeated_count||1)+1, status:'pending', last_seen_at:new Date().toISOString(), resolved_at:null }).eq('id',existing.data.id)
    } else {
      await db.from('cos_learning_gaps').insert({ task_id:'support', subject, question, capability, confidence, escalation_reason:safeText(reason,1000), repeated_count:1, status:'pending', last_seen_at:new Date().toISOString() })
    }
  } catch {}
}
async function resolveKnowledgeGap(prompt: string): Promise<void> {
  const db=cosServiceDb(); if(!db)return
  try { await db.from('cos_learning_gaps').update({status:'resolved',resolved_at:new Date().toISOString(),last_seen_at:new Date().toISOString()}).eq('task_id','support').eq('question',safeText(prompt,2000)).eq('capability','general_reasoning').in('status',['pending','learning','failed']) } catch {}
}

export async function retrieveInternalContext(prompt:string,userId?:string|null){
  const systems=['semantic/exact cache preflight']; const facts:string[]=[], learned:string[]=[], memories:string[]=[]; const terms=queryTerms(prompt); const db=cosServiceDb()
  if(db&&terms.length){
    const factFilters=terms.flatMap(t=>[`subject.ilike.%${t}%`,`predicate.ilike.%${t}%`,`object.ilike.%${t}%`]).join(',')
    const learnedFilters=terms.flatMap(t=>[`subject.ilike.%${t}%`,`summary.ilike.%${t}%`]).join(',')
    const [fr,lr]=await Promise.allSettled([
      db.from('cos_knowledge_facts').select('subject,predicate,object,confidence,source,updated_at').or(factFilters).order('confidence',{ascending:false}).limit(40),
      db.from('cos_continuous_learning').select('subject,summary,facts,confidence,source_kind,source_uri,observed_at').or(learnedFilters).order('confidence',{ascending:false}).limit(40),
    ])
    if(fr.status==='fulfilled'&&!fr.value.error){
      const rows=rankRows(fr.value.data??[],terms,(r:any)=>`${r.subject} ${r.predicate} ${r.object}`,10)
      if(rows.length) systems.push('Enterprise Memory / Knowledge Graph')
      for(const r of rows) facts.push(`${safeText(r.subject,180)} — ${safeText(r.predicate,120)} — ${safeText(r.object,600)} [confidence ${Number(r.confidence||0).toFixed(2)}; source ${safeText(r.source,180)}]`)
    }
    if(lr.status==='fulfilled'&&!lr.value.error){
      const rows=rankRows(lr.value.data??[],terms,(r:any)=>`${r.subject} ${r.summary} ${Array.isArray(r.facts)?r.facts.join(' '):''}`,10)
      if(rows.length) systems.push('Continuous Learning Corpus')
      for(const r of rows){ const ef=Array.isArray(r.facts)?r.facts.slice(0,4).map((f:unknown)=>safeText(f,300)).join('; '):''; learned.push(`${safeText(r.subject,180)}: ${safeText(r.summary,800)}${ef?` Facts: ${ef}`:''} [confidence ${Number(r.confidence||0).toFixed(2)}; ${safeText(r.source_kind,80)} ${safeText(r.source_uri,280)}]`) }
    }
  }
  if(userId&&terms.length){
    const loaded=await loadUserMemories(userId).catch(()=>[])
    const relevant=rankRows(loaded,terms,(item:any)=>String(item.content||''),6)
    if(relevant.length) systems.push('User Enterprise Memory')
    for(const item of relevant) memories.push(`[${item.kind}] ${safeText(item.content,500)}`)
  }
  return {systems:[...new Set(systems)],facts,learned,memories,terms}
}

function extractBalancedJsonObject(text:string):string|null{
  const start=text.indexOf('{')
  if(start===-1)return null
  let depth=0,inString=false,escaped=false
  for(let i=start;i<text.length;i++){
    const ch=text[i]
    if(inString){
      if(escaped)escaped=false
      else if(ch==='\\')escaped=true
      else if(ch==='"')inString=false
      continue
    }
    if(ch==='"'){inString=true;continue}
    if(ch==='{')depth++
    else if(ch==='}'){depth--;if(depth===0)return text.slice(start,i+1)}
  }
  return null
}

function parseLocalResult(raw:string):{answer:string;confidence:number}|null{
  const stripFences=(t:string)=>t.trim().replace(/^```json\s*/i,'').replace(/```\s*$/i,'').trim()
  const tryParse=(t:string)=>{
    try{
      const p=JSON.parse(t) as {answer?:unknown;confidence?:unknown}
      const answer=typeof p.answer==='string'?p.answer.trim():''
      const confidence=Number(p.confidence)
      return answer&&Number.isFinite(confidence)?{answer,confidence:Math.max(0,Math.min(1,confidence))}:null
    }catch{return null}
  }
  const cleaned=stripFences(raw)
  const direct=tryParse(cleaned)
  if(direct)return direct
  const extracted=extractBalancedJsonObject(cleaned)
  if(extracted){
    const recovered=tryParse(extracted)
    if(recovered)return recovered
  }
  return null
}

function contextFingerprint(context:{facts:string[];learned:string[];memories:string[]}):string{
  return createHash('sha256').update(JSON.stringify({facts:context.facts,learned:context.learned,memories:context.memories})).digest('hex')
}

async function readCachedAnswer(key:string):Promise<CachedCosAnswer|null>{
  const db=cosServiceDb(); if(!db)return null
  try { return (await new SupabaseExactCacheStore(db).get<CachedCosAnswer>(key))?.value ?? null } catch { return null }
}
async function writeCachedAnswer(key:string,value:CachedCosAnswer):Promise<void>{
  const db=cosServiceDb(); if(!db)return
  try { const now=Date.now(); await new SupabaseExactCacheStore(db).set(key,{value,createdAt:now,expiresAt:now+CACHE_TTL_MS}) } catch {}
}

export async function tryCOSFirstAnswer(input:{prompt:string;userId?:string|null;language?:string;privileged?:boolean}):Promise<COSFirstAnswerResult>{
  const startedAt=Date.now()
  const context=await retrieveInternalContext(input.prompt,input.userId)
  const base={ externalAiInvoked:false as const, localModelInvoked:false, reasonerLabel:null as string|null, internalSystemsConsulted:context.systems, knowledgeFactsUsed:context.facts.length, learnedItemsUsed:context.learned.length, userMemoriesUsed:context.memories.length }
  const contextWindow=[...context.facts,...context.learned].join('\n')
  const knowledge=semanticKnowledgeLayer()
  if(knowledge){
    const nearest=await knowledge.lookupSemanticCache('cos-first-answer',input.prompt,contextWindow)
    if(nearest){
      const payload=nearest.responsePayload as CachedCosAnswer|null
      if(payload?.reply&&payload.confidence>=threshold()){
        recordAvoidedCost('semantic_similarity',input.prompt.length,payload.reply.length,Date.now()-startedAt)
        return {handled:true,reply:payload.reply,confidence:payload.confidence,provenance:{responseSource:'semantic_similarity',...base,reasonerLabel:payload.reasonerLabel,similarityScore:nearest.similarityScore}}
      }
    }
  }

  const cacheKey=createExactCacheKey({taskId:'cos-first-answer',prompt:input.prompt,contextFingerprint:contextFingerprint(context),policyVersion:`threshold:${threshold().toFixed(2)};relevance:v2`,knowledgeVersion:null})
  const cached=await readCachedAnswer(cacheKey)
  if(cached&&cached.reply&&cached.confidence>=threshold()){
    recordAvoidedCost('exact_cache',input.prompt.length,cached.reply.length,Date.now()-startedAt)
    return {handled:true,reply:cached.reply,confidence:cached.confidence,provenance:{responseSource:'semantic_cache',...base,reasonerLabel:cached.reasonerLabel}}
  }

  if(process.env.COS_LOCAL_FIRST_ENABLED==='false'){
    const reason='COS-first answering is disabled by COS_LOCAL_FIRST_ENABLED.'; void recordKnowledgeGap(input.prompt,0,reason)
    return {handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...base}}
  }
  const resolved=resolveCosReasoner()
  if(!resolved.config){
    const reason='reason' in resolved?resolved.reason:'Independent COS reasoner is not configured.'; void recordKnowledgeGap(input.prompt,0,reason)
    return {handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...base}}
  }

  const evidenceCount=context.facts.length+context.learned.length
  const internalContext=[context.facts.length?`KNOWLEDGE GRAPH FACTS:\n${context.facts.join('\n')}`:'',context.learned.length?`CONTINUOUS LEARNING CORPUS:\n${context.learned.join('\n')}`:'',context.memories.length?`RELEVANT USER ENTERPRISE MEMORY:\n${context.memories.join('\n')}`:''].filter(Boolean).join('\n\n')
  const reasoned=await callCosReasoner({temperature:.12,maxTokens:Number(process.env.COS_REASONER_MAX_TOKENS||'6000'),systemPrompt:`You are COS, SignalBoost's independent PRIMARY reasoning layer. Reason from the user's question, your open/self-hosted model knowledge, and supplied internal evidence. Use supplied evidence only when it materially supports the question; never force irrelevant evidence into the answer. Distinguish evidence from inference and never invent sources. For diagnostic, architectural, or technical questions, identify concrete mechanisms rather than generic categories, rank them by fit to the observed pattern, and explain discriminating read-only observations or telemetry for each. Explicitly exploit strong internal evidence when present, but do not mention internal system names unless the user asks. If evidence is weak or the answer remains generic, lower confidence. Reply in ${input.language||'English'}. Return ONLY strict JSON, nothing before the opening brace and nothing after the closing brace — no preamble, no markdown fence, no trailing note: {"answer":"complete answer","confidence":0.0}.`,prompt:`RETRIEVAL TERMS: ${context.terms.join(', ')||'none'}\n\n${internalContext||'No matching durable internal evidence was retrieved for this question.'}\n\nUSER QUESTION:\n${input.prompt}`}).catch(()=>null)
  const provenance={...base,localModelInvoked:true,reasonerLabel:reasoned?.reasoner.label??resolved.config.label}
  if(!reasoned?.text){const reason='Independent COS inference did not return an answer.';void recordKnowledgeGap(input.prompt,0,reason);return{handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...provenance}}}
  const parsed=parseLocalResult(reasoned.text)
  if(!parsed){
    console.error('cosFirstAnswer: unparseable reasoner output, raw text follows:',reasoned.text)
    const excerpt=safeText(reasoned.text,240)
    const reason=`Independent COS inference returned an unparseable result. Raw output started: "${excerpt}"`
    void recordKnowledgeGap(input.prompt,0,reason)
    return{handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...provenance}}
  }
  const ceiling=evidenceCount>=5?.96:evidenceCount>=2?.90:evidenceCount===1?.84:.78; const confidence=Math.min(parsed.confidence,ceiling)
  if(confidence<threshold()){const reason=`COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)}.`;void recordKnowledgeGap(input.prompt,confidence,reason);return{handled:false,confidence,reason,provenance:{responseSource:'external_fallback_required',...provenance}}}
  void writeCachedAnswer(cacheKey,{reply:parsed.answer,confidence,reasonerLabel:provenance.reasonerLabel})
  if(knowledge){void knowledge.commitToMemory('cos-first-answer',input.prompt,contextWindow,{reply:parsed.answer,confidence,reasonerLabel:provenance.reasonerLabel} as CachedCosAnswer)}
  recordAvoidedCost('local_reasoner',input.prompt.length,parsed.answer.length,Date.now()-startedAt)
  void resolveKnowledgeGap(input.prompt); return{handled:true,reply:parsed.answer,confidence,provenance:{responseSource:'local_cos_reasoning',...provenance}}
}

export function formatCosWorkflowStatement(result:COSFirstAnswerResult,language='en'):string{
  const p=result.provenance,evidence=`${p.knowledgeFactsUsed} knowledge facts, ${p.learnedItemsUsed} learned items, ${p.userMemoriesUsed} memories`
  const source=p.responseSource==='semantic_cache'?'exact-match cache':p.responseSource==='semantic_similarity'?`semantic match, similarity ${(p.similarityScore??0).toFixed(2)}`:p.reasonerLabel
  if(language==='pt') return result.handled?`Fluxo: COS consultou primeiro seu conhecimento, corpus e memória (${evidence}) → respondeu via ${source} com confiança ${result.confidence.toFixed(2)}. Nenhuma IA externa foi chamada.`:`Fluxo: COS consultou primeiro seu conhecimento, corpus e memória (${evidence}) → não atingiu confiança suficiente → IA externa é apenas o último recurso.`
  if(language==='es') return result.handled?`Flujo: COS consultó primero su conocimiento, corpus y memoria (${evidence}) → respondió vía ${source} con confianza ${result.confidence.toFixed(2)}. No se llamó IA externa.`:`Flujo: COS consultó primero su conocimiento, corpus y memoria (${evidence}) → no alcanzó confianza suficiente → la IA externa es solo el último recurso.`
  return result.handled?`Workflow: COS searched its knowledge, learning corpus and memory first (${evidence}) → answered via ${source} at confidence ${result.confidence.toFixed(2)}. No external AI was called.`:`Workflow: COS searched its knowledge, learning corpus and memory first (${evidence}) → did not reach sufficient confidence → external AI is the last resort.`
}
