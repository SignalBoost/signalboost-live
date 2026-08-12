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

export type COSFirstAnswerResult =
  | { handled: true; reply: string; confidence: number; provenance: COSProvenance }
  | { handled: false; confidence: number; reason: string; provenance: COSProvenance }

export type COSProvenance = {
  responseSource: 'semantic_cache' | 'semantic_similarity' | 'local_cos_reasoning' | 'external_fallback_required'
  /** Present only when responseSource is 'semantic_similarity' — the cosine similarity score of the match, 0-1. */
  similarityScore?: number
  externalAiInvoked: false
  localModelInvoked: boolean
  reasonerLabel: string | null
  internalSystemsConsulted: string[]
  knowledgeFactsUsed: number
  learnedItemsUsed: number
  userMemoriesUsed: number
}

const STOP_WORDS = new Set(['about','after','again','also','because','before','being','could','does','from','have','into','more','most','should','that','their','there','these','they','this','those','through','under','what','when','where','which','while','with','would','your','you','and','the','for','are','how','why'])
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

type CachedCosAnswer = { reply:string; confidence:number; reasonerLabel:string|null }

function threshold(): number {
  const value = Number(process.env.COS_LOCAL_CONFIDENCE_THRESHOLD || '0.72')
  return Number.isFinite(value) ? Math.max(0.5, Math.min(0.98, value)) : 0.72
}

// A paraphrase match must be genuinely close, not merely topically related — 0.93
// is deliberately conservative for a first deployment of a system that has never
// been measured. Wrong on the strict side costs one extra reasoner call; wrong on
// the loose side means COS could answer a DIFFERENT question with a cached reply.
function semanticThreshold(): number {
  const value = Number(process.env.COS_SEMANTIC_SIMILARITY_THRESHOLD || '0.93')
  return Number.isFinite(value) ? Math.max(0.80, Math.min(0.999, value)) : 0.93
}

// Constructed once per module load, not per request — matches how cosServiceDb()
// and the exact-cache store are already used elsewhere in this file. Returns null
// wherever cosServiceDb() would (no Supabase service role configured), same as the
// exact-cache path; the semantic layer is then simply skipped, never a hard failure.
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

// ROI TELEMETRY — makes /api/admin/cos-independence's "estimated cost avoided" a real,
// non-zero number instead of the orphaned-metric it was before Aug 12. cos_ai_roi_metrics
// and SupabaseAIROIMetricsSink already existed; nothing on the actual production path
// (tryCOSFirstAnswer) ever called .record() — the only caller was lib/cos-core/cos-kernel.ts,
// which cosFirstAnswer does not go through. This wires the real path in directly.
//
// ESTIMATE, NOT MEASUREMENT — stated plainly rather than presented as fact. There is no
// way to know what a Claude call WOULD have cost without actually making it, which is the
// entire point of avoiding it. The number is a good-faith approximation at Anthropic's
// published Sonnet rates (input/output per 1K tokens, override-able via env so it tracks
// pricing changes without a code deploy), using output-length classes the file already
// computes — a semantic/exact cache hit reuses a previously-generated reply, so it stands
// in for a full generate call; a fresh local-reasoner answer assumes a comparable-length
// completion. Both are ESTIMATES of the counterfactual, not receipts.
function estimatedInputCostPer1k(): number {
  const value = Number(process.env.COS_BASELINE_INPUT_COST_PER_1K || '0.003')
  return Number.isFinite(value) && value >= 0 ? value : 0.003
}
function estimatedOutputCostPer1k(): number {
  const value = Number(process.env.COS_BASELINE_OUTPUT_COST_PER_1K || '0.015')
  return Number.isFinite(value) && value >= 0 ? value : 0.015
}
// ~4 characters per token is the standard rough English approximation used throughout
// this codebase's own cost-sizing comments; kept consistent rather than inventing a
// second constant that would silently disagree with the first.
function estimateAvoidedProviderCostUsd(promptCharsBefore: number, replyChars: number): number {
  const inputTokens = promptCharsBefore / 4
  const outputTokens = Math.max(replyChars, 200) / 4 // floor: a cached reply that is itself short still stood in for a real generate call
  return (inputTokens / 1000) * estimatedInputCostPer1k() + (outputTokens / 1000) * estimatedOutputCostPer1k()
}

let roiSinkInstance: SupabaseAIROIMetricsSink | null | undefined
function roiSink(): SupabaseAIROIMetricsSink | null {
  if (roiSinkInstance !== undefined) return roiSinkInstance
  const db = cosServiceDb()
  roiSinkInstance = db ? new SupabaseAIROIMetricsSink(db) : null
  return roiSinkInstance
}

/**
 * Fire-and-forget, matching every other cache write in this file — never blocks or
 * fails the answer being returned. Called ONLY on a handled:true return, i.e. only
 * when COS is actually about to answer WITHOUT calling external AI: this is a
 * verifiable claim (an external call provably did not happen on this path), not a
 * prediction about what the caller will do next. The external_fallback_required
 * path deliberately does NOT record here — at that point in the code nothing has
 * decided yet whether the caller will actually escalate, and recording a "cost
 * incurred" entry for a call that has not happened would be the same kind of
 * unearned claim this whole codebase has spent this week learning to refuse.
 */
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
  return [...new Set(prompt.toLowerCase().replace(/[^a-z0-9\s_-]/g, ' ').split(/\s+/).map(p => p.trim()).filter(p => p.length >= 4 && !STOP_WORDS.has(p)))].slice(0, 6)
}
/**
 * The subject a knowledge gap is filed under. Anchored to a curriculum domain wherever the question
 * belongs to one: gaps used to take their subject from the user's own words, producing study
 * subjects like "multi-tenant saas suddenly shows" that no source adapter could search usefully and
 * that split one real topic across a row per phrasing. Prompt terms remain the fallback so a
 * question outside the curriculum is still recorded rather than dropped.
 */
function subjectFromPrompt(prompt: string): string {
  return nearestFoundationalSubject(prompt) || queryTerms(prompt).slice(0, 4).join(' ') || 'general reasoning'
}
function safeText(value: unknown, max = 1200): string { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max) }

/**
 * The reasoner's instructions.
 *
 * The previous version asked only for correct, honestly-scoped JSON — and got exactly that: answers
 * that were true, safe and useless. Four interchangeable buckets ("resource contention",
 * "configuration differences", "network issues") that fit any latency question ever asked.
 * Correctness was never the missing thing. SPECIFICITY was.
 *
 * So this asks for what a generic answer cannot fake: the mechanism, the observable that would
 * confirm it, and what would rule it out. A model that cannot name the observable cannot produce a
 * convincing generic answer either — which is the point. It should then score itself low and
 * escalate, instead of filling the space with plausible categories.
 */
export function COS_REASONER_SYSTEM_PROMPT(language: string): string {
  return [
    "You are COS, SignalBoost's independent PRIMARY reasoning layer.",
    'Reason from the question, your own model knowledge, and any supplied internal evidence.',
    '',
    'ANSWER LIKE A SENIOR PRACTITIONER, NOT LIKE A CHECKLIST:',
    '- Lead with the mechanism the stated facts actually point at. If an observation rules something in or out, say so and say why.',
    '- Every cause you name must carry the SPECIFIC OBSERVABLE that would confirm it: the exact metric, view, log field, query or counter someone would look at. "Monitor resource usage" is not an observable. "pg_stat_activity wait_event distribution" is.',
    '- Every cause must also carry what would FALSIFY it. A cause nothing could disprove is not a diagnosis.',
    '- When asked to rank, rank by fit to the stated facts and justify the order. Do not renumber a list of equals.',
    '- Three causes named precisely beat six named vaguely.',
    '',
    'HONESTY:',
    '- Distinguish evidence from inference. Never invent sources, numbers or telemetry.',
    '- If you cannot name specific observables, you do not know this well enough. Say so plainly and set confidence low. A low-confidence answer that escalates is correct behaviour; a confident generic answer is the failure.',
    '',
    `Reply in ${language}.`,
    'Return ONLY strict JSON, nothing before the opening brace and nothing after the closing brace — no preamble, no markdown fence, no trailing note: {"answer":"complete answer","confidence":0.0}.',
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

async function retrieveInternalContext(prompt:string,userId?:string|null){
  const systems=['semantic/exact cache preflight']; const facts:string[]=[], learned:string[]=[], memories:string[]=[]; const terms=queryTerms(prompt); const db=cosServiceDb()
  if(db&&terms.length){
    systems.push('Enterprise Memory / Knowledge Graph','Continuous Learning Corpus')
    const factFilters=terms.flatMap(t=>[`subject.ilike.%${t}%`,`predicate.ilike.%${t}%`,`object.ilike.%${t}%`]).join(',')
    const learnedFilters=terms.flatMap(t=>[`subject.ilike.%${t}%`,`summary.ilike.%${t}%`]).join(',')
    const [fr,lr]=await Promise.allSettled([
      db.from('cos_knowledge_facts').select('subject,predicate,object,confidence,source,updated_at').or(factFilters).order('confidence',{ascending:false}).limit(16),
      db.from('cos_continuous_learning').select('subject,summary,facts,confidence,source_kind,source_uri,observed_at').or(learnedFilters).order('confidence',{ascending:false}).limit(12),
    ])
    if(fr.status==='fulfilled'&&!fr.value.error) for(const r of fr.value.data??[]) facts.push(`${safeText(r.subject,180)} — ${safeText(r.predicate,120)} — ${safeText(r.object,600)} [confidence ${Number(r.confidence||0).toFixed(2)}; source ${safeText(r.source,180)}]`)
    if(lr.status==='fulfilled'&&!lr.value.error) for(const r of lr.value.data??[]){ const ef=Array.isArray(r.facts)?r.facts.slice(0,4).map((f:unknown)=>safeText(f,300)).join('; '):''; learned.push(`${safeText(r.subject,180)}: ${safeText(r.summary,800)}${ef?` Facts: ${ef}`:''} [confidence ${Number(r.confidence||0).toFixed(2)}; ${safeText(r.source_kind,80)} ${safeText(r.source_uri,280)}]`) }
  }
  if(userId){ systems.push('User Enterprise Memory'); const loaded=await loadUserMemories(userId).catch(()=>[]); for(const item of loaded.slice(-20)) memories.push(`[${item.kind}] ${safeText(item.content,500)}`) }
  return {systems:[...new Set(systems)],facts,learned,memories}
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
  // Internal COS knowledge is always consulted before deciding whether a reasoner or external fallback is required.
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

  const cacheKey=createExactCacheKey({taskId:'cos-first-answer',prompt:input.prompt,contextFingerprint:contextFingerprint(context),policyVersion:`threshold:${threshold().toFixed(2)}`,knowledgeVersion:null})
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
  const internalContext=[context.facts.length?`KNOWLEDGE GRAPH FACTS:\n${context.facts.join('\n')}`:'',context.learned.length?`CONTINUOUS LEARNING CORPUS:\n${context.learned.join('\n')}`:'',context.memories.length?`USER ENTERPRISE MEMORY:\n${context.memories.join('\n')}`:''].filter(Boolean).join('\n\n')
  const reasoned=await callCosReasoner({temperature:.15,maxTokens:Number(process.env.COS_REASONER_MAX_TOKENS||'6000'),systemPrompt:COS_REASONER_SYSTEM_PROMPT(input.language||'English'),prompt:`${internalContext||'No matching durable internal evidence was retrieved for this question.'}\n\nUSER QUESTION:\n${input.prompt}`}).catch(()=>null)
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
  const ceiling=evidenceCount>=5?.96:evidenceCount>=2?.90:evidenceCount===1?.84:.78
  // Three independent ceilings, and the lowest wins. The model's own number says how sure it feels;
  // the evidence ceiling says how much it had to go on; the specificity cap says whether the answer
  // names anything checkable. Only the last one can catch a fluent, confident, useless answer —
  // self-assessment never will, and with no external provider configured there is no second opinion
  // to appeal to.
  const specificity=assessAnswerSpecificity(parsed.answer)
  const confidence=Math.min(parsed.confidence,ceiling,specificity.cap)
  if(specificity.applies&&specificity.cap<1){console.warn('cosFirstAnswer: answer specificity capped confidence',{score:specificity.score,cap:specificity.cap,artifacts:specificity.artifacts,density:specificity.density,words:specificity.words,claimed:parsed.confidence,final:confidence})}
  if(confidence<threshold()){
    const cappedBySpecificity=specificity.applies&&specificity.cap<Math.min(parsed.confidence,ceiling)
    const reason=cappedBySpecificity
      ?`COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)}. ${specificityReason(specificity)}`
      :`COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)}.`
    void recordKnowledgeGap(input.prompt,confidence,reason)
    return{handled:false,confidence,reason,provenance:{responseSource:'external_fallback_required',...provenance}}
  }
  void writeCachedAnswer(cacheKey,{reply:parsed.answer,confidence,reasonerLabel:provenance.reasonerLabel})
  if(knowledge){void knowledge.commitToMemory('cos-first-answer',input.prompt,contextWindow,{reply:parsed.answer,confidence,reasonerLabel:provenance.reasonerLabel} as CachedCosAnswer)}
  // NOT recorded as "avoided" in the ROI-estimate sense the cache hits above are: this
  // is COS's OWN independent reasoner actually running (real RunPod compute, real
  // latency), not a free reuse of prior work. It still avoided calling Claude/OpenAI —
  // recorded with providerCalls:0 and estimatedProviderCostUsd:0 to stay honest that
  // no cloud spend occurred, while estimatedCostAvoidedUsd reflects what a cloud
  // provider WOULD have cost, per the same estimate function as the cache paths.
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
