// saas/lib/ai/cos/cosFirstAnswer.ts
import { createHash } from 'node:crypto'
import { callCosReasoner, resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { loadUserMemories } from '@/lib/ai/tools/userMemory'
import { cosServiceDb, SupabaseKnowledgeStore, SupabaseAIROIMetricsSink } from '@/lib/cos-core/storage/supabase'
import { SupabaseExactCacheStore } from '@/lib/cos-core/storage/exactSupabase'
import { createExactCacheKey } from '@/lib/cos-core/layers/exact-cache'
import { KnowledgeLayer } from '@/lib/cos-core/layers/knowledge'
import { generateLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'
import { nearestFoundationalSubject } from '@/lib/cos-core/layers/learning/foundational'
import { assessAnswerSpecificity, specificityReason } from '@/lib/ai/cos/answerSpecificity'
import { parseLocalResult, citedEvidence } from '@/lib/ai/cos/reasonerOutput'
import { groundingConfidenceCap, groundingPromptBlock, selectGroundingEvidence } from '@/lib/ai/cos/grounding'

export type COSFirstAnswerResult =
  | { handled: true; reply: string; confidence: number; provenance: COSProvenance }
  | { handled: false; confidence: number; reason: string; bestEffortReply?: string; provenance: COSProvenance }

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
  knowledgeFactsSelected?: number
  learnedItemsSelected?: number
  userMemoriesSelected?: number
  knowledgeFactsCited?: number
  learnedItemsCited?: number
  userMemoriesCited?: number
}

const STOP_WORDS = new Set(['about','after','again','also','because','before','being','could','does','from','have','into','more','most','should','that','their','there','these','they','this','those','through','under','what','when','where','which','while','with','would','your','you','and','the','for','are','how','why'])
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
  knowledgeLayer = db ? new KnowledgeLayer({
    generateEmbedding: generateLocalEmbedding,
    store: new SupabaseKnowledgeStore(db),
    similarityThreshold: semanticThreshold(),
    onError: error => console.error('cosFirstAnswer: semantic cache error', error),
  }) : null
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
function estimateAvoidedProviderCostUsd(promptCharsBefore:number,replyChars:number):number {
  return ((promptCharsBefore/4)/1000)*estimatedInputCostPer1k()+((Math.max(replyChars,200)/4)/1000)*estimatedOutputCostPer1k()
}
let roiSinkInstance: SupabaseAIROIMetricsSink | null | undefined
function roiSink(): SupabaseAIROIMetricsSink | null {
  if (roiSinkInstance !== undefined) return roiSinkInstance
  const db=cosServiceDb(); roiSinkInstance=db?new SupabaseAIROIMetricsSink(db):null; return roiSinkInstance
}
function recordAvoidedCost(source:'semantic_similarity'|'exact_cache'|'local_reasoner',promptChars:number,replyChars:number,latencyMs:number):void {
  const sink=roiSink(); if(!sink)return
  void sink.record({taskId:'cos-first-answer',source,providerCalls:0,estimatedProviderCostUsd:0,estimatedCostAvoidedUsd:estimateAvoidedProviderCostUsd(promptChars,replyChars),promptCharactersBefore:promptChars,promptCharactersAfter:promptChars,latencyMs}).catch(error=>console.error('cosFirstAnswer: ROI recording failed',error))
}

function queryTerms(prompt:string):string[]{
  return [...new Set(prompt.toLowerCase().replace(/[^a-z0-9\s_-]/g,' ').split(/\s+/).map(p=>p.trim()).filter(p=>p.length>=4&&!STOP_WORDS.has(p)))].slice(0,6)
}
function subjectFromPrompt(prompt:string):string{return nearestFoundationalSubject(prompt)||queryTerms(prompt).slice(0,4).join(' ')||'general reasoning'}
function safeText(value:unknown,max=1200):string{return String(value??'').replace(/\s+/g,' ').trim().slice(0,max)}

export function COS_REASONER_SYSTEM_PROMPT(language:string):string {
  return [
    "You are COS, SignalBoost's independent PRIMARY reasoning layer.",
    'Reason from the question, your own model knowledge, and any supplied internal evidence.',
    '',
    'ANSWER LIKE A SENIOR PRACTITIONER, NOT LIKE A CHECKLIST:',
    '- Lead with the mechanism the stated facts actually point at. If an observation rules something in or out, say so and say why.',
    '- Every cause must include the specific observable that would confirm it and what would falsify it.',
    '- When asked to rank, rank by fit to the stated facts and justify the order.',
    '- Three precise causes beat six vague ones.',
    '- Name mechanisms, not monitoring products.',
    '',
    'CITING INTERNAL EVIDENCE:',
    '- Selected evidence lines are labelled [KG#], [CL#], [EM#]. If a selected item materially supports a claim, cite that label inline.',
    '- Do not fabricate citations. But do not ignore relevant selected evidence and then claim high confidence.',
    '',
    'HONESTY:',
    '- Distinguish evidence from inference. Never invent sources, numbers or telemetry.',
    '- If you cannot name specific observables, set confidence low.',
    '',
    `Reply in ${language}.`,
    'Return ONLY strict JSON: {"answer":"complete answer","confidence":0.0}.',
  ].join('\n')
}

async function recordKnowledgeGap(prompt:string,confidence:number,reason:string):Promise<void>{
  const db=cosServiceDb(); if(!db)return
  try{
    const subject=subjectFromPrompt(prompt),question=safeText(prompt,2000),capability='general_reasoning'
    const existing=await db.from('cos_learning_gaps').select('id,repeated_count').eq('task_id','support').eq('subject',subject).eq('question',question).eq('capability',capability).maybeSingle()
    if(existing.data?.id) await db.from('cos_learning_gaps').update({confidence,escalation_reason:safeText(reason,1000),repeated_count:Number(existing.data.repeated_count||1)+1,status:'pending',last_seen_at:new Date().toISOString(),resolved_at:null}).eq('id',existing.data.id)
    else await db.from('cos_learning_gaps').insert({task_id:'support',subject,question,capability,confidence,escalation_reason:safeText(reason,1000),repeated_count:1,status:'pending',last_seen_at:new Date().toISOString()})
  }catch{}
}
async function resolveKnowledgeGap(prompt:string):Promise<void>{const db=cosServiceDb();if(!db)return;try{await db.from('cos_learning_gaps').update({status:'resolved',resolved_at:new Date().toISOString(),last_seen_at:new Date().toISOString()}).eq('task_id','support').eq('question',safeText(prompt,2000)).eq('capability','general_reasoning').in('status',['pending','learning','failed'])}catch{}}

async function retrieveInternalContext(prompt:string,userId?:string|null){
  const systems=['semantic/exact cache preflight'];const facts:string[]=[],learned:string[]=[],memories:string[]=[];const terms=queryTerms(prompt);const db=cosServiceDb()
  if(db&&terms.length){
    systems.push('Enterprise Memory / Knowledge Graph','Continuous Learning Corpus')
    const factFilters=terms.flatMap(t=>[`subject.ilike.%${t}%`,`predicate.ilike.%${t}%`,`object.ilike.%${t}%`]).join(',')
    const learnedFilters=terms.flatMap(t=>[`subject.ilike.%${t}%`,`summary.ilike.%${t}%`]).join(',')
    const [fr,lr]=await Promise.allSettled([
      db.from('cos_knowledge_facts').select('subject,predicate,object,confidence,source,updated_at').or(factFilters).order('confidence',{ascending:false}).order('updated_at',{ascending:false}).order('subject',{ascending:true}).limit(16),
      db.from('cos_continuous_learning').select('subject,summary,facts,confidence,source_kind,source_uri,observed_at').or(learnedFilters).order('confidence',{ascending:false}).order('observed_at',{ascending:false}).order('source_uri',{ascending:true}).limit(12),
    ])
    if(fr.status==='fulfilled'&&!fr.value.error)for(const r of fr.value.data??[])facts.push(`[KG${facts.length+1}] ${safeText(r.subject,180)} — ${safeText(r.predicate,120)} — ${safeText(r.object,600)} [confidence ${Number(r.confidence||0).toFixed(2)}; source ${safeText(r.source,180)}]`)
    if(lr.status==='fulfilled'&&!lr.value.error)for(const r of lr.value.data??[]){const ef=Array.isArray(r.facts)?r.facts.slice(0,4).map((f:unknown)=>safeText(f,300)).join('; '):'';learned.push(`[CL${learned.length+1}] ${safeText(r.subject,180)}: ${safeText(r.summary,800)}${ef?` Facts: ${ef}`:''} [confidence ${Number(r.confidence||0).toFixed(2)}; ${safeText(r.source_kind,80)} ${safeText(r.source_uri,280)}]`)}
  }
  if(userId){systems.push('User Enterprise Memory');const loaded=await loadUserMemories(userId).catch(()=>[]);const relevant=loaded.filter(item=>{const text=String(item.content??'').toLowerCase();return terms.some(term=>text.includes(term))});for(const item of relevant.slice(-8))memories.push(`[EM${memories.length+1}] [${item.kind}] ${safeText(item.content,500)}`)}
  return{systems:[...new Set(systems)],facts,learned,memories}
}
function contextFingerprint(context:{facts:string[];learned:string[];memories:string[]}):string{return createHash('sha256').update(JSON.stringify(context)).digest('hex')}
async function readCachedAnswer(key:string):Promise<CachedCosAnswer|null>{const db=cosServiceDb();if(!db)return null;try{return(await new SupabaseExactCacheStore(db).get<CachedCosAnswer>(key))?.value??null}catch{return null}}
async function writeCachedAnswer(key:string,value:CachedCosAnswer):Promise<void>{const db=cosServiceDb();if(!db)return;try{const now=Date.now();await new SupabaseExactCacheStore(db).set(key,{value,createdAt:now,expiresAt:now+CACHE_TTL_MS})}catch{}}

export async function tryCOSFirstAnswer(input:{prompt:string;userId?:string|null;language?:string;privileged?:boolean}):Promise<COSFirstAnswerResult>{
  const startedAt=Date.now()
  const context=await retrieveInternalContext(input.prompt,input.userId)
  const selected=selectGroundingEvidence(input.prompt,{kg:context.facts,cl:context.learned,em:context.memories},5)
  const selectedKg=selected.filter(item=>item.system==='kg').length,selectedCl=selected.filter(item=>item.system==='cl').length,selectedEm=selected.filter(item=>item.system==='em').length
  const base={externalAiInvoked:false as const,localModelInvoked:false,reasonerLabel:null as string|null,internalSystemsConsulted:context.systems,knowledgeFactsUsed:context.facts.length,learnedItemsUsed:context.learned.length,userMemoriesUsed:context.memories.length,knowledgeFactsSelected:selectedKg,learnedItemsSelected:selectedCl,userMemoriesSelected:selectedEm}
  const contextWindow=selected.map(item=>item.text).join('\n')
  const knowledge=semanticKnowledgeLayer()
  if(knowledge){
    const nearest=await knowledge.lookupSemanticCache('cos-first-answer',input.prompt,contextWindow)
    if(nearest){const payload=nearest.responsePayload as CachedCosAnswer|null;if(payload?.reply&&payload.confidence>=threshold()){recordAvoidedCost('semantic_similarity',input.prompt.length,payload.reply.length,Date.now()-startedAt);return{handled:true,reply:payload.reply,confidence:payload.confidence,provenance:{responseSource:'semantic_similarity',...base,reasonerLabel:payload.reasonerLabel,similarityScore:nearest.similarityScore}}}}
  }
  const cacheKey=createExactCacheKey({taskId:'cos-first-answer',prompt:input.prompt,contextFingerprint:contextFingerprint(context),policyVersion:`threshold:${threshold().toFixed(2)}`,knowledgeVersion:null})
  const cached=await readCachedAnswer(cacheKey)
  if(cached?.reply&&cached.confidence>=threshold()){recordAvoidedCost('exact_cache',input.prompt.length,cached.reply.length,Date.now()-startedAt);return{handled:true,reply:cached.reply,confidence:cached.confidence,provenance:{responseSource:'semantic_cache',...base,reasonerLabel:cached.reasonerLabel}}}
  if(process.env.COS_LOCAL_FIRST_ENABLED==='false'){const reason='COS-first answering is disabled by COS_LOCAL_FIRST_ENABLED.';void recordKnowledgeGap(input.prompt,0,reason);return{handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...base}}}
  const resolved=resolveCosReasoner();if(!resolved.config){const reason='reason'in resolved?resolved.reason:'Independent COS reasoner is not configured.';void recordKnowledgeGap(input.prompt,0,reason);return{handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...base}}}

  const internalContext=groundingPromptBlock(selected)
  const reasoned=await callCosReasoner({temperature:Number(process.env.COS_REASONER_TEMPERATURE??'0'),maxTokens:Number(process.env.COS_REASONER_MAX_TOKENS||'6000'),systemPrompt:COS_REASONER_SYSTEM_PROMPT(input.language||'English'),prompt:`${internalContext||'No matching durable internal evidence was selected for this question.'}\n\nUSER QUESTION:\n${input.prompt}`}).catch(()=>null)
  const provenance={...base,localModelInvoked:true,reasonerLabel:reasoned?.reasoner.label??resolved.config.label}
  if(!reasoned?.text){const reason='Independent COS inference did not return an answer.';void recordKnowledgeGap(input.prompt,0,reason);return{handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...provenance}}}
  const parsed=parseLocalResult(reasoned.text)
  if(!parsed){const reason=`Independent COS inference returned an unparseable result after ${reasoned.text.length} characters. Raw output started: "${safeText(reasoned.text,240)}"`;void recordKnowledgeGap(input.prompt,0,reason);return{handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...provenance}}}
  if(parsed.truncated){const maxTokens=Number(process.env.COS_REASONER_MAX_TOKENS||'6000');const reason=`Independent COS inference stopped mid-answer after ${reasoned.text.length} characters, so it never produced a confidence value. ${parsed.answer.length} characters were recoverable. Near the token ceiling, raise COS_REASONER_MAX_TOKENS (currently ${maxTokens}); far short of it, the call was cut off before the model finished.`;void recordKnowledgeGap(input.prompt,0,reason);return{handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...provenance}}}

  const cited=citedEvidence(parsed.answer),citedTotal=cited.kg+cited.cl+cited.em
  const selectedCount=selected.length
  const evidenceCeiling=selectedCount>=5?.96:selectedCount>=2?.90:selectedCount===1?.84:.78
  const specificity=assessAnswerSpecificity(parsed.answer)
  const groundingCap=groundingConfidenceCap({retrieved:context.facts.length+context.learned.length+context.memories.length,selected:selectedCount,cited:citedTotal})
  const confidence=Math.min(parsed.confidence,evidenceCeiling,specificity.cap,groundingCap)
  if(selectedCount>0&&citedTotal===0)console.warn('cosFirstAnswer: selected internal evidence was ignored',{selected:selectedCount,retrieved:context.facts.length+context.learned.length+context.memories.length,groundingCap})
  if(confidence<threshold()){
    const cappedByGrounding=groundingCap<Math.min(parsed.confidence,evidenceCeiling,specificity.cap)
    const cappedBySpecificity=specificity.applies&&specificity.cap<Math.min(parsed.confidence,evidenceCeiling,groundingCap)
    const reason=cappedByGrounding?`COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)} because relevant selected internal evidence was not cited.`:cappedBySpecificity?`COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)}. ${specificityReason(specificity)}`:`COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)}.`
    void recordKnowledgeGap(input.prompt,confidence,reason)
    return{handled:false,confidence,reason,bestEffortReply:parsed.answer,provenance:{responseSource:'external_fallback_required',...provenance,knowledgeFactsCited:cited.kg,learnedItemsCited:cited.cl,userMemoriesCited:cited.em}}
  }

  const cacheWriteBudgetMs=Number(process.env.COS_CACHE_WRITE_BUDGET_MS??'8000')
  await Promise.race([Promise.allSettled([writeCachedAnswer(cacheKey,{reply:parsed.answer,confidence,reasonerLabel:provenance.reasonerLabel}),knowledge?knowledge.commitToMemory('cos-first-answer',input.prompt,contextWindow,{reply:parsed.answer,confidence,reasonerLabel:provenance.reasonerLabel} as CachedCosAnswer):Promise.resolve()]),new Promise<void>(resolve=>setTimeout(resolve,cacheWriteBudgetMs))])
  recordAvoidedCost('local_reasoner',input.prompt.length,parsed.answer.length,Date.now()-startedAt)
  void resolveKnowledgeGap(input.prompt)
  return{handled:true,reply:parsed.answer,confidence,provenance:{responseSource:'local_cos_reasoning',...provenance,knowledgeFactsCited:cited.kg,learnedItemsCited:cited.cl,userMemoriesCited:cited.em}}
}

export function formatCosWorkflowStatement(result:COSFirstAnswerResult,language='en'):string{
  const p=result.provenance,evidence=`${p.knowledgeFactsUsed} knowledge facts, ${p.learnedItemsUsed} learned items, ${p.userMemoriesUsed} memories`,source=p.responseSource==='semantic_cache'?'exact-match cache':p.responseSource==='semantic_similarity'?`semantic match, similarity ${(p.similarityScore??0).toFixed(2)}`:p.reasonerLabel
  if(language==='pt')return result.handled?`Fluxo: COS consultou primeiro seu conhecimento, corpus e memória (${evidence}) → respondeu via ${source} com confiança ${result.confidence.toFixed(2)}. Nenhuma IA externa foi chamada.`:`Fluxo: COS consultou primeiro seu conhecimento, corpus e memória (${evidence}) → não atingiu confiança suficiente → IA externa é apenas o último recurso.`
  if(language==='es')return result.handled?`Flujo: COS consultó primero su conocimiento, corpus y memoria (${evidence}) → respondió vía ${source} con confianza ${result.confidence.toFixed(2)}. No se llamó IA externa.`:`Flujo: COS consultó primero su conocimiento, corpus y memoria (${evidence}) → no alcanzó confianza suficiente → la IA externa es solo el último recurso.`
  return result.handled?`Workflow: COS searched its knowledge, learning corpus and memory first (${evidence}) → answered via ${source} at confidence ${result.confidence.toFixed(2)}. No external AI was called.`:`Workflow: COS searched its knowledge, learning corpus and memory first (${evidence}) → did not reach sufficient confidence → external AI is the last resort.`
}
