// saas/lib/ai/cos/cosFirstAnswer.ts
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
import { assessAnswerSpecificity, specificityReason } from '@/lib/ai/cos/answerSpecificity'
import { evidenceTerms } from '@/lib/ai/cos/evidenceRanking'
import { evidenceConfidenceCeiling, rerankRetrievedEvidence } from '@/lib/ai/cos/rerankRetrievedEvidence'
import { parseLocalResult } from '@/lib/ai/cos/reasonerOutput'

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

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

type CachedCosAnswer = { reply:string; confidence:number; reasonerLabel:string|null }

type InternalContext = {
  systems: string[]
  facts: string[]
  learned: string[]
  memories: string[]
  evidenceCount: number
  highRelevanceCount: number
  meanRelevance: number
}

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

function queryTerms(prompt: string): string[] {
  return evidenceTerms(prompt).slice(0, 8)
}

function subjectFromPrompt(prompt: string): string {
  return nearestFoundationalSubject(prompt) || queryTerms(prompt).slice(0, 4).join(' ') || 'general reasoning'
}
function safeText(value: unknown, max = 1200): string { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max) }

export function COS_REASONER_SYSTEM_PROMPT(language: string): string {
  return [
    "You are COS, SignalBoost's independent PRIMARY local reasoner.",
    'Use supplied internal evidence before relying on general model knowledge.',
    '',
    'EVIDENCE GROUNDING — NON-NEGOTIABLE:',
    '- Internal evidence is labeled with identifiers such as [KG1], [CL2], and [EM1].',
    '- When a non-trivial claim comes from supplied evidence, cite the exact identifier inline. Never invent an identifier.',
    '- If you must use model knowledge beyond the supplied evidence, label that statement as Inference and do not pretend an internal source supports it.',
    '- If the evidence is thin or irrelevant, say so and lower confidence rather than filling space with generic textbook material.',
    '',
    'ANSWER LIKE A SENIOR PRACTITIONER, NOT LIKE A CHECKLIST:',
    '- Lead with the mechanism the stated facts actually point at and explain why the facts increase or decrease its likelihood.',
    '- Every ranked cause must name a concrete mechanism, a SPECIFIC OBSERVABLE that would confirm it, and a condition that would FALSIFY it.',
    '- Prefer exact metrics, views, log fields, counters, queries, thresholds, identifiers, and read-only comparisons over phrases such as "monitor resources".',
    '- When asked to rank, rank by fit to the stated facts and justify the order. Three precise causes beat six vague ones.',
    '- Do not recommend production changes when the user asks for read-only diagnosis.',
    '',
    'HONESTY AND CONFIDENCE:',
    '- Distinguish retained evidence from inference. Never invent sources, numbers, telemetry, or observations.',
    '- Confidence must reflect evidence relevance, answer specificity, and uncertainty. Do not inflate confidence merely because the answer is fluent.',
    '- If you cannot name specific observables or falsifiers, set confidence low.',
    '',
    `Reply in ${language}.`,
    'Reason internally, but return ONLY strict JSON with no preamble or markdown fence: {"answer":"complete answer with evidence IDs where used","confidence":0.0}.',
  ].join('\n')
}

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

async function retrieveInternalContext(prompt:string,userId?:string|null): Promise<InternalContext> {
  const systems=['semantic/exact cache preflight']
  const terms=queryTerms(prompt)
  const db=cosServiceDb()
  let rawFacts: Array<{subject:unknown;predicate:unknown;object:unknown;confidence:unknown;source:unknown}> = []
  let rawLearned: Array<{subject:unknown;summary:unknown;facts:unknown;confidence:unknown;source_kind:unknown;source_uri:unknown}> = []
  let rawMemories: Array<{kind?:unknown;content?:unknown}> = []

  if(db&&terms.length){
    systems.push('Enterprise Memory / Knowledge Graph','Continuous Learning Corpus')
    const factFilters=terms.flatMap(t=>[`subject.ilike.%${t}%`,`predicate.ilike.%${t}%`,`object.ilike.%${t}%`]).join(',')
    const learnedFilters=terms.flatMap(t=>[`subject.ilike.%${t}%`,`summary.ilike.%${t}%`]).join(',')
    const [fr,lr]=await Promise.allSettled([
      db.from('cos_knowledge_facts').select('subject,predicate,object,confidence,source,updated_at').or(factFilters).order('confidence',{ascending:false}).limit(32),
      db.from('cos_continuous_learning').select('subject,summary,facts,confidence,source_kind,source_uri,observed_at').or(learnedFilters).order('confidence',{ascending:false}).limit(24),
    ])
    if(fr.status==='fulfilled'&&!fr.value.error) rawFacts=(fr.value.data??[]) as typeof rawFacts
    if(lr.status==='fulfilled'&&!lr.value.error) rawLearned=(lr.value.data??[]) as typeof rawLearned
  }

  if(userId){
    systems.push('User Enterprise Memory')
    const loaded=await loadUserMemories(userId).catch(()=>[])
    rawMemories=loaded.slice(-30).map(item=>({kind:item.kind,content:item.content}))
  }

  const ranked=rerankRetrievedEvidence(prompt,rawFacts,rawLearned,rawMemories,safeText)
  return { systems:[...new Set(systems)], ...ranked }
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
  const contextWindow=[...context.facts,...context.learned,...context.memories].join('\n')
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

  const cacheKey=createExactCacheKey({taskId:'cos-first-answer',prompt:input.prompt,contextFingerprint:contextFingerprint(context),policyVersion:`threshold:${threshold().toFixed(2)};rerank:v1`,knowledgeVersion:null})
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

  const internalContext=[
    context.facts.length?`RERANKED KNOWLEDGE GRAPH EVIDENCE:\n${context.facts.join('\n')}`:'',
    context.learned.length?`RERANKED CONTINUOUS LEARNING EVIDENCE:\n${context.learned.join('\n')}`:'',
    context.memories.length?`RERANKED ENTERPRISE MEMORY EVIDENCE:\n${context.memories.join('\n')}`:'',
  ].filter(Boolean).join('\n\n')

  const evidenceSummary=`Evidence packet: ${context.evidenceCount} relevant items; ${context.highRelevanceCount} high-relevance; mean relevance ${context.meanRelevance.toFixed(2)}.`
  const reasoned=await callCosReasoner({
    temperature:.15,
    maxTokens:Number(process.env.COS_REASONER_MAX_TOKENS||'6000'),
    systemPrompt:COS_REASONER_SYSTEM_PROMPT(input.language||'English'),
    prompt:`${evidenceSummary}\n\n${internalContext||'No sufficiently relevant durable internal evidence was retrieved for this question.'}\n\nUSER QUESTION:\n${input.prompt}`,
  }).catch(()=>null)

  const provenance={...base,localModelInvoked:true,reasonerLabel:reasoned?.reasoner.label??resolved.config.label}
  if(!reasoned?.text){const reason='Independent COS inference did not return an answer.';void recordKnowledgeGap(input.prompt,0,reason);return{handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...provenance}}}
  const parsed=parseLocalResult(reasoned.text)
  if(!parsed){
    console.error('cosFirstAnswer: unparseable reasoner output',{characters:reasoned.text.length,raw:reasoned.text})
    const excerpt=safeText(reasoned.text,240)
    const reason=`Independent COS inference returned an unparseable result after ${reasoned.text.length} characters. Raw output started: "${excerpt}"`
    void recordKnowledgeGap(input.prompt,0,reason)
    return{handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...provenance}}
  }
  if(parsed.truncated){
    const maxTokens=Number(process.env.COS_REASONER_MAX_TOKENS||'6000')
    console.error('cosFirstAnswer: reasoner output truncated mid-answer',{characters:reasoned.text.length,salvagedCharacters:parsed.answer.length,maxTokens,raw:reasoned.text})
    const reason=`Independent COS inference stopped mid-answer after ${reasoned.text.length} characters, so it never produced a confidence value. ${parsed.answer.length} characters were recoverable. Near the token ceiling, raise COS_REASONER_MAX_TOKENS (currently ${maxTokens}); far short of it, the call was cut off before the model finished.`
    void recordKnowledgeGap(input.prompt,0,reason)
    return{handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...provenance}}
  }

  const ceiling=evidenceConfidenceCeiling(context)
  const specificity=assessAnswerSpecificity(parsed.answer)
  const confidence=Math.min(parsed.confidence,ceiling,specificity.cap)
  if(specificity.applies&&specificity.cap<1){console.warn('cosFirstAnswer: answer specificity capped confidence',{score:specificity.score,cap:specificity.cap,artifacts:specificity.artifacts,density:specificity.density,words:specificity.words,claimed:parsed.confidence,evidenceCeiling:ceiling,final:confidence})}
  if(confidence<threshold()){
    const cappedBySpecificity=specificity.applies&&specificity.cap<Math.min(parsed.confidence,ceiling)
    const evidenceNote=`Relevant evidence ${context.evidenceCount}; high-relevance ${context.highRelevanceCount}; mean relevance ${context.meanRelevance.toFixed(2)}.`
    const reason=cappedBySpecificity
      ?`COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)}. ${specificityReason(specificity)} ${evidenceNote}`
      :`COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)}. ${evidenceNote}`
    void recordKnowledgeGap(input.prompt,confidence,reason)
    return{handled:false,confidence,reason,provenance:{responseSource:'external_fallback_required',...provenance}}
  }

  void writeCachedAnswer(cacheKey,{reply:parsed.answer,confidence,reasonerLabel:provenance.reasonerLabel})
  if(knowledge){void knowledge.commitToMemory('cos-first-answer',input.prompt,contextWindow,{reply:parsed.answer,confidence,reasonerLabel:provenance.reasonerLabel} as CachedCosAnswer)}
  recordAvoidedCost('local_reasoner',input.prompt.length,parsed.answer.length,Date.now()-startedAt)
  void resolveKnowledgeGap(input.prompt)
  return{handled:true,reply:parsed.answer,confidence,provenance:{responseSource:'local_cos_reasoning',...provenance}}
}

export function formatCosWorkflowStatement(result:COSFirstAnswerResult,language='en'):string{
  const p=result.provenance,evidence=`${p.knowledgeFactsUsed} knowledge facts, ${p.learnedItemsUsed} learned items, ${p.userMemoriesUsed} memories`
  const source=p.responseSource==='semantic_cache'?'exact-match cache':p.responseSource==='semantic_similarity'?`semantic match, similarity ${(p.similarityScore??0).toFixed(2)}`:p.reasonerLabel
  if(language==='pt') return result.handled?`Fluxo: COS consultou primeiro seu conhecimento, corpus e memória (${evidence}) → respondeu via ${source} com confiança ${result.confidence.toFixed(2)}. Nenhuma IA externa foi chamada.`:`Fluxo: COS consultou primeiro seu conhecimento, corpus e memória (${evidence}) → não atingiu confiança suficiente → IA externa é apenas o último recurso.`
  if(language==='es') return result.handled?`Flujo: COS consultó primero su conocimiento, corpus y memoria (${evidence}) → respondió vía ${source} con confianza ${result.confidence.toFixed(2)}. No se llamó IA externa.`:`Flujo: COS consultó primero su conocimiento, corpus y memoria (${evidence}) → no alcanzó confianza suficiente → la IA externa es solo el último recurso.`
  return result.handled?`Workflow: COS searched its knowledge, learning corpus and memory first (${evidence}) → answered via ${source} at confidence ${result.confidence.toFixed(2)}. No external AI was called.`:`Workflow: COS searched its knowledge, learning corpus and memory first (${evidence}) → did not reach sufficient confidence → external AI is the last resort.`
}
