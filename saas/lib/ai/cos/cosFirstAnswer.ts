// saas/lib/ai/cos/cosFirstAnswer.ts
import { createHash } from 'node:crypto'
import { callCosReasoner, resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { loadUserMemories } from '@/lib/ai/tools/userMemory'
import { cosServiceDb, SupabaseAIROIMetricsSink, SupabaseKnowledgeStore } from '@/lib/cos-core/storage/supabase'
import { SupabaseExactCacheStore } from '@/lib/cos-core/storage/exactSupabase'
import { createExactCacheKey } from '@/lib/cos-core/layers/exact-cache'
import { KnowledgeLayer } from '@/lib/cos-core/layers/knowledge'
import { generateLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'
import { nearestFoundationalSubject } from '@/lib/cos-core/layers/learning/foundational'
import { assessAnswerSpecificity, specificityReason } from '@/lib/ai/cos/answerSpecificity'
import { parseLocalResult, citedEvidence } from '@/lib/ai/cos/reasonerOutput'
import { cosAnswerPolicyVersion, cosCacheTaskId, cosCacheMaxAgeMs, cachedAnswerIsCurrent } from '@/lib/ai/cos/cosAnswerPolicy'

export type EvidenceFunnelStage = {
  retrieved: number
  relevant: number
  selected: number
  injected: number
  cited: number
}

export type COSEvidenceFunnel = {
  knowledgeGraph: EvidenceFunnelStage
  learnedCorpus: EvidenceFunnelStage
  userMemory: EvidenceFunnelStage
}

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
  /** Legacy selected-context counts retained for existing telemetry consumers. */
  knowledgeFactsUsed: number
  learnedItemsUsed: number
  userMemoriesUsed: number
  /** Current-request retrieval funnel. USED is earned only at the cited stage. */
  evidenceFunnel: COSEvidenceFunnel
  knowledgeFactsCited?: number
  learnedItemsCited?: number
  userMemoriesCited?: number
  /** Cache metadata is separate from current-request execution telemetry. */
  cacheOrigin?: {
    storedAt: string | null
    policyVersion: string | null
    retrievedThisTurn: { facts: number; learned: number; memories: number }
    originEvidenceFunnel?: COSEvidenceFunnel | null
  }
}

const STOP_WORDS = new Set(['about','after','again','also','because','before','being','could','does','from','have','into','more','most','should','that','their','there','these','they','this','those','through','under','what','when','where','which','while','with','would','your','you','and','the','for','are','how','why'])
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

type CachedAnswerOrigin = {
  knowledgeFactsUsed:number
  learnedItemsUsed:number
  userMemoriesUsed:number
  knowledgeFactsCited:number
  learnedItemsCited:number
  userMemoriesCited:number
  evidenceFunnel?: COSEvidenceFunnel
}
type CachedCosAnswer = {
  reply:string
  confidence:number
  reasonerLabel:string|null
  policyVersion?:string|null
  storedAt?:string|null
  origin?:CachedAnswerOrigin
}
type RetrievalCounts = { retrieved:number; relevant:number; selected:number }
type InternalContext = {
  systems:string[]
  facts:string[]
  learned:string[]
  memories:string[]
  funnel:{ knowledgeGraph:RetrievalCounts; learnedCorpus:RetrievalCounts; userMemory:RetrievalCounts }
}

function threshold(): number {
  const value = Number(process.env.COS_LOCAL_CONFIDENCE_THRESHOLD || '0.72')
  return Number.isFinite(value) ? Math.max(0.5, Math.min(0.98, value)) : 0.72
}

function semanticThreshold(): number {
  const value = Number(process.env.COS_SEMANTIC_SIMILARITY_THRESHOLD || '0.93')
  return Number.isFinite(value) ? Math.max(0.80, Math.min(0.999, value)) : 0.93
}

function knowledgeFactSimilarityThreshold(): number {
  const value = Number(process.env.COS_KNOWLEDGE_FACT_SIMILARITY_THRESHOLD || '0.55')
  return Number.isFinite(value) ? Math.max(0.25, Math.min(0.95, value)) : 0.55
}

function knowledgeFactRetrievalBudgetMs(): number {
  const value = Number(process.env.COS_KNOWLEDGE_FACT_RETRIEVAL_BUDGET_MS || '5000')
  return Number.isFinite(value) ? Math.max(500, Math.min(15_000, value)) : 5000
}

function answerPolicyVersion(): string {
  return cosAnswerPolicyVersion({
    reasonerSystemPrompt: COS_REASONER_SYSTEM_PROMPT('English'),
    model: process.env.LOCAL_AI_MODEL?.trim() || null,
    threshold: threshold(),
  })
}

function cacheHitProvenance(
  payload: CachedCosAnswer,
  base: {
    knowledgeFactsUsed:number
    learnedItemsUsed:number
    userMemoriesUsed:number
    internalSystemsConsulted:string[]
    evidenceFunnel:COSEvidenceFunnel
  },
  responseSource: 'semantic_cache' | 'semantic_similarity',
  similarityScore?: number,
): COSProvenance {
  const origin = payload.origin
  return {
    responseSource,
    externalAiInvoked: false,
    localModelInvoked: false,
    reasonerLabel: payload.reasonerLabel,
    internalSystemsConsulted: base.internalSystemsConsulted,
    knowledgeFactsUsed: origin?.knowledgeFactsUsed ?? 0,
    learnedItemsUsed: origin?.learnedItemsUsed ?? 0,
    userMemoriesUsed: origin?.userMemoriesUsed ?? 0,
    evidenceFunnel: base.evidenceFunnel,
    knowledgeFactsCited: origin?.knowledgeFactsCited ?? 0,
    learnedItemsCited: origin?.learnedItemsCited ?? 0,
    userMemoriesCited: origin?.userMemoriesCited ?? 0,
    cacheOrigin: {
      storedAt: payload.storedAt ?? null,
      policyVersion: payload.policyVersion ?? null,
      retrievedThisTurn: {
        facts: base.evidenceFunnel.knowledgeGraph.retrieved,
        learned: base.evidenceFunnel.learnedCorpus.retrieved,
        memories: base.evidenceFunnel.userMemory.retrieved,
      },
      originEvidenceFunnel: origin?.evidenceFunnel ?? null,
    },
    ...(similarityScore === undefined ? {} : { similarityScore }),
  }
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
  void sink.record({
    taskId: 'cos-first-answer',
    source,
    providerCalls: 0,
    estimatedProviderCostUsd: 0,
    estimatedCostAvoidedUsd: estimateAvoidedProviderCostUsd(promptChars, replyChars),
    promptCharactersBefore: promptChars,
    promptCharactersAfter: promptChars,
    latencyMs,
  }).catch((error) => console.error('cosFirstAnswer: ROI recording failed', error))
}

function queryTerms(prompt: string): string[] {
  return [...new Set(prompt.toLowerCase().replace(/[^a-z0-9\s_-]/g, ' ').split(/\s+/).map(p => p.trim()).filter(p => p.length >= 4 && !STOP_WORDS.has(p)))].slice(0, 6)
}
function subjectFromPrompt(prompt: string): string {
  return nearestFoundationalSubject(prompt) || queryTerms(prompt).slice(0, 4).join(' ') || 'general reasoning'
}
function safeText(value: unknown, max = 1200): string { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max) }

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
    '- Naming a monitoring product is not naming a mechanism. "Check Grafana" says where to look, not what happened. For every cause, state the MECHANISM — what changed by itself with no deployment (statistics refreshed and a query plan flipped, a working set outgrew a cache or pool tier, data crossed a threshold only some tenants cross, a neighbour workload shifted) — and only then the observable that would show it.',
    '',
    'CITING INTERNAL EVIDENCE:',
    '- Supplied evidence lines are labelled [KG#], [CL#], [EM#]. When one genuinely informs a claim, cite its label inline. NEVER cite an item that did not change what you wrote — an honest answer with zero citations is correct when the evidence was not useful, and false citations are worse than none.',
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

async function semanticKnowledgeFacts(prompt: string, db: NonNullable<ReturnType<typeof cosServiceDb>>) {
  const work = (async () => {
    const vector = await generateLocalEmbedding(prompt)
    const rows = await new SupabaseKnowledgeStore(db).queryNearestFacts(vector, { matchCount: 32, minSimilarity: 0 })
    if (rows.some(row => Number(row.similarityScore || 0) >= knowledgeFactSimilarityThreshold())) return rows

    // During migration/backfill a relevant fact may still have a NULL embedding and be invisible
    // to pgvector. Keep lexical fallback only for that incomplete-coverage case.
    const pending = await db.from('cos_knowledge_facts').select('id', { count: 'exact', head: true }).is('embedding', null)
    if (!pending.error && Number(pending.count ?? 0) > 0) {
      console.warn('cosFirstAnswer: relevant semantic fact coverage incomplete; lexical fallback remains active', { pending: pending.count })
      return null
    }
    return rows
  })().catch((error) => {
    console.warn('cosFirstAnswer: semantic knowledge retrieval unavailable; lexical fallback will be used', error)
    return null
  })
  const budgetMs = knowledgeFactRetrievalBudgetMs()
  return Promise.race([
    work,
    new Promise<null>(resolve => setTimeout(() => {
      console.warn('cosFirstAnswer: semantic knowledge retrieval exceeded budget; lexical fallback will be used', { budgetMs })
      resolve(null)
    }, budgetMs)),
  ])
}

function emptyRetrieval(): RetrievalCounts { return { retrieved:0, relevant:0, selected:0 } }

async function retrieveInternalContext(prompt:string,userId?:string|null):Promise<InternalContext>{
  const systems=['semantic/exact cache preflight']
  const facts:string[]=[], learned:string[]=[], memories:string[]=[]
  const terms=queryTerms(prompt), db=cosServiceDb()
  const funnel={knowledgeGraph:emptyRetrieval(),learnedCorpus:emptyRetrieval(),userMemory:emptyRetrieval()}

  if(db){
    systems.push('Enterprise Memory / Knowledge Graph','Continuous Learning Corpus')
    const learnedPromise = terms.length
      ? db.from('cos_continuous_learning')
          .select('subject,summary,facts,confidence,source_kind,source_uri,observed_at')
          .or(terms.flatMap(t=>[`subject.ilike.%${t}%`,`summary.ilike.%${t}%`]).join(','))
          .order('confidence',{ascending:false}).order('observed_at',{ascending:false}).order('source_uri',{ascending:true}).limit(24)
      : Promise.resolve({ data: [], error: null })
    const [semanticResult, learnedResult] = await Promise.allSettled([semanticKnowledgeFacts(prompt, db), learnedPromise])

    const semanticRows = semanticResult.status === 'fulfilled' ? semanticResult.value : null
    if(semanticRows !== null){
      funnel.knowledgeGraph.retrieved=semanticRows.length
      const relevant=semanticRows.filter(r=>Number(r.similarityScore||0)>=knowledgeFactSimilarityThreshold())
      funnel.knowledgeGraph.relevant=relevant.length
      const selected=relevant.slice(0,16)
      funnel.knowledgeGraph.selected=selected.length
      for(const r of selected) facts.push(`[KG${facts.length+1}] ${safeText(r.subject,180)} — ${safeText(r.predicate,120)} — ${safeText(r.object,600)} [confidence ${Number(r.confidence||0).toFixed(2)}; similarity ${Number(r.similarityScore||0).toFixed(2)}; source ${safeText(r.source,180)}]`)
    } else if(terms.length) {
      const factFilters=terms.flatMap(t=>[`subject.ilike.%${t}%`,`predicate.ilike.%${t}%`,`object.ilike.%${t}%`]).join(',')
      const fr=await db.from('cos_knowledge_facts').select('subject,predicate,object,confidence,source,updated_at').or(factFilters).order('confidence',{ascending:false}).order('updated_at',{ascending:false}).order('subject',{ascending:true}).limit(32)
      if(!fr.error){
        const rows=fr.data??[]
        funnel.knowledgeGraph.retrieved=rows.length
        funnel.knowledgeGraph.relevant=rows.length
        const selected=rows.slice(0,16)
        funnel.knowledgeGraph.selected=selected.length
        for(const r of selected) facts.push(`[KG${facts.length+1}] ${safeText(r.subject,180)} — ${safeText(r.predicate,120)} — ${safeText(r.object,600)} [confidence ${Number(r.confidence||0).toFixed(2)}; source ${safeText(r.source,180)}]`)
      }
    }

    if(learnedResult.status==='fulfilled'&&!learnedResult.value.error){
      const rows=learnedResult.value.data??[]
      funnel.learnedCorpus.retrieved=rows.length
      // The learned corpus still uses its lexical gate today; keeping the stages explicit makes
      // the future semantic ranker measurable rather than invisible.
      funnel.learnedCorpus.relevant=rows.length
      const selected=rows.slice(0,12)
      funnel.learnedCorpus.selected=selected.length
      for(const r of selected){
        const ef=Array.isArray(r.facts)?r.facts.slice(0,4).map((f:unknown)=>safeText(f,300)).join('; '):''
        learned.push(`[CL${learned.length+1}] ${safeText(r.subject,180)}: ${safeText(r.summary,800)}${ef?` Facts: ${ef}`:''} [confidence ${Number(r.confidence||0).toFixed(2)}; ${safeText(r.source_kind,80)} ${safeText(r.source_uri,280)}]`)
      }
    }
  }

  if(userId){
    systems.push('User Enterprise Memory')
    const loaded=await loadUserMemories(userId).catch(()=>[])
    funnel.userMemory.retrieved=loaded.length
    const relevant=loaded.filter(item=>{const text=String(item.content??'').toLowerCase();return terms.some(term=>text.includes(term))})
    funnel.userMemory.relevant=relevant.length
    const selected=relevant.slice(-8)
    funnel.userMemory.selected=selected.length
    for(const item of selected) memories.push(`[EM${memories.length+1}] [${item.kind}] ${safeText(item.content,500)}`)
  }

  return {systems:[...new Set(systems)],facts,learned,memories,funnel}
}

function executionFunnel(context:InternalContext,injected:boolean,cited={kg:0,cl:0,em:0}):COSEvidenceFunnel{
  const stage=(counts:RetrievalCounts,citedCount:number):EvidenceFunnelStage=>({...counts,injected:injected?counts.selected:0,cited:citedCount})
  return {
    knowledgeGraph:stage(context.funnel.knowledgeGraph,cited.kg),
    learnedCorpus:stage(context.funnel.learnedCorpus,cited.cl),
    userMemory:stage(context.funnel.userMemory,cited.em),
  }
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
  const base={
    externalAiInvoked:false as const,
    localModelInvoked:false,
    reasonerLabel:null as string|null,
    internalSystemsConsulted:context.systems,
    knowledgeFactsUsed:context.facts.length,
    learnedItemsUsed:context.learned.length,
    userMemoriesUsed:context.memories.length,
    evidenceFunnel:executionFunnel(context,false),
  }
  const contextWindow=[...context.facts,...context.learned].join('\n')

  const policyVersion=answerPolicyVersion()
  const cacheTaskId=cosCacheTaskId('cos-first-answer',policyVersion)
  const cacheMaxAgeMs=cosCacheMaxAgeMs()
  const knowledge=semanticKnowledgeLayer()
  if(knowledge){
    const nearest=await knowledge.lookupSemanticCache(cacheTaskId,input.prompt,contextWindow)
    if(nearest){
      const payload=nearest.responsePayload as CachedCosAnswer|null
      const current=cachedAnswerIsCurrent(payload,policyVersion,cacheMaxAgeMs)
      if(payload?.reply&&!current.ok) console.warn('cosFirstAnswer: semantic cache entry refused as stale',{reason:current.reason,similarity:nearest.similarityScore})
      if(payload?.reply&&current.ok&&payload.confidence>=threshold()){
        recordAvoidedCost('semantic_similarity',input.prompt.length,payload.reply.length,Date.now()-startedAt)
        return {handled:true,reply:payload.reply,confidence:payload.confidence,provenance:cacheHitProvenance(payload,base,'semantic_similarity',nearest.similarityScore)}
      }
    }
  }

  const cacheKey=createExactCacheKey({taskId:cacheTaskId,prompt:input.prompt,contextFingerprint:contextFingerprint(context),policyVersion,knowledgeVersion:null})
  const cached=await readCachedAnswer(cacheKey)
  const cachedCurrent=cachedAnswerIsCurrent(cached,policyVersion,cacheMaxAgeMs)
  if(cached?.reply&&!cachedCurrent.ok) console.warn('cosFirstAnswer: exact cache entry refused as stale',{reason:cachedCurrent.reason})
  if(cached&&cached.reply&&cachedCurrent.ok&&cached.confidence>=threshold()){
    recordAvoidedCost('exact_cache',input.prompt.length,cached.reply.length,Date.now()-startedAt)
    return {handled:true,reply:cached.reply,confidence:cached.confidence,provenance:cacheHitProvenance(cached,base,'semantic_cache')}
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
  const internalContext=[
    context.facts.length?`KNOWLEDGE GRAPH FACTS:\n${context.facts.join('\n')}`:'',
    context.learned.length?`CONTINUOUS LEARNING CORPUS:\n${context.learned.join('\n')}`:'',
    context.memories.length?`USER ENTERPRISE MEMORY:\n${context.memories.join('\n')}`:'',
  ].filter(Boolean).join('\n\n')
  const reasoned=await callCosReasoner({
    temperature:Number(process.env.COS_REASONER_TEMPERATURE??'0'),
    maxTokens:Number(process.env.COS_REASONER_MAX_TOKENS||'6000'),
    systemPrompt:COS_REASONER_SYSTEM_PROMPT(input.language||'English'),
    prompt:`${internalContext||'No matching durable internal evidence was retrieved for this question.'}\n\nUSER QUESTION:\n${input.prompt}`,
  }).catch(()=>null)
  const reasoningProvenance={...base,localModelInvoked:true,reasonerLabel:reasoned?.reasoner.label??resolved.config.label,evidenceFunnel:executionFunnel(context,true)}

  if(!reasoned?.text){
    const reason='Independent COS inference did not return an answer.';void recordKnowledgeGap(input.prompt,0,reason)
    return{handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...reasoningProvenance}}
  }
  const parsed=parseLocalResult(reasoned.text)
  if(!parsed){
    console.error('cosFirstAnswer: unparseable reasoner output',{characters:reasoned.text.length,raw:reasoned.text})
    const reason=`Independent COS inference returned an unparseable result after ${reasoned.text.length} characters. Raw output started: "${safeText(reasoned.text,240)}"`
    void recordKnowledgeGap(input.prompt,0,reason)
    return{handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...reasoningProvenance}}
  }
  if(parsed.truncated){
    const maxTokens=Number(process.env.COS_REASONER_MAX_TOKENS||'6000')
    console.error('cosFirstAnswer: reasoner output truncated mid-answer',{characters:reasoned.text.length,salvagedCharacters:parsed.answer.length,maxTokens,raw:reasoned.text})
    const reason=`Independent COS inference stopped mid-answer after ${reasoned.text.length} characters, so it never produced a confidence value. ${parsed.answer.length} characters were recoverable. Near the token ceiling, raise COS_REASONER_MAX_TOKENS (currently ${maxTokens}); far short of it, the call was cut off before the model finished.`
    void recordKnowledgeGap(input.prompt,0,reason)
    return{handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...reasoningProvenance}}
  }

  const cited=citedEvidence(parsed.answer)
  const citedProvenance={
    ...reasoningProvenance,
    knowledgeFactsCited:cited.kg,
    learnedItemsCited:cited.cl,
    userMemoriesCited:cited.em,
    evidenceFunnel:executionFunnel(context,true,cited),
  }
  const ceiling=evidenceCount>=5?.96:evidenceCount>=2?.90:evidenceCount===1?.84:.78
  const specificity=assessAnswerSpecificity(parsed.answer)
  const confidence=Math.min(parsed.confidence,ceiling,specificity.cap)
  if(specificity.applies&&specificity.cap<1) console.warn('cosFirstAnswer: answer specificity capped confidence',{score:specificity.score,cap:specificity.cap,artifacts:specificity.artifacts,density:specificity.density,words:specificity.words,claimed:parsed.confidence,final:confidence})

  if(confidence<threshold()){
    const cappedBySpecificity=specificity.applies&&specificity.cap<Math.min(parsed.confidence,ceiling)
    const reason=cappedBySpecificity
      ?`COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)}. ${specificityReason(specificity)}`
      :`COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)}.`
    void recordKnowledgeGap(input.prompt,confidence,reason)
    return{handled:false,confidence,reason,bestEffortReply:parsed.answer,provenance:{responseSource:'external_fallback_required',...citedProvenance}}
  }

  const storedAnswer:CachedCosAnswer={
    reply:parsed.answer,
    confidence,
    reasonerLabel:citedProvenance.reasonerLabel,
    policyVersion,
    storedAt:new Date().toISOString(),
    origin:{
      knowledgeFactsUsed:context.facts.length,
      learnedItemsUsed:context.learned.length,
      userMemoriesUsed:context.memories.length,
      knowledgeFactsCited:cited.kg,
      learnedItemsCited:cited.cl,
      userMemoriesCited:cited.em,
      evidenceFunnel:citedProvenance.evidenceFunnel,
    },
  }
  const cacheWriteBudgetMs=Number(process.env.COS_CACHE_WRITE_BUDGET_MS??'8000')
  await Promise.race([
    Promise.allSettled([
      writeCachedAnswer(cacheKey,storedAnswer),
      knowledge?knowledge.commitToMemory(cacheTaskId,input.prompt,contextWindow,storedAnswer):Promise.resolve(),
    ]),
    new Promise<void>(resolve=>setTimeout(()=>{console.warn('cosFirstAnswer: cache write exceeded its budget and was abandoned',{budgetMs:cacheWriteBudgetMs});resolve()},cacheWriteBudgetMs)),
  ])

  recordAvoidedCost('local_reasoner',input.prompt.length,parsed.answer.length,Date.now()-startedAt)
  void resolveKnowledgeGap(input.prompt)
  return{handled:true,reply:parsed.answer,confidence,provenance:{responseSource:'local_cos_reasoning',...citedProvenance}}
}

export function formatCosWorkflowStatement(result:COSFirstAnswerResult,language='en'):string{
  const p=result.provenance,evidence=`${p.knowledgeFactsUsed} knowledge facts, ${p.learnedItemsUsed} learned items, ${p.userMemoriesUsed} memories`
  const source=p.responseSource==='semantic_cache'?'exact-match cache':p.responseSource==='semantic_similarity'?`semantic match, similarity ${(p.similarityScore??0).toFixed(2)}`:p.reasonerLabel
  if(language==='pt') return result.handled?`Fluxo: COS consultou primeiro seu conhecimento, corpus e memória (${evidence}) → respondeu via ${source} com confiança ${result.confidence.toFixed(2)}. Nenhuma IA externa foi chamada.`:`Fluxo: COS consultou primeiro seu conhecimento, corpus e memória (${evidence}) → não atingiu confiança suficiente → IA externa é apenas o último recurso.`
  if(language==='es') return result.handled?`Flujo: COS consultó primero su conocimiento, corpus y memoria (${evidence}) → respondió vía ${source} con confianza ${result.confidence.toFixed(2)}. No se llamó IA externa.`:`Flujo: COS consultó primero su conocimiento, corpus y memoria (${evidence}) → no alcanzó confianza suficiente → la IA externa es solo el último recurso.`
  return result.handled?`Workflow: COS searched its knowledge, learning corpus and memory first (${evidence}) → answered via ${source} at confidence ${result.confidence.toFixed(2)}. No external AI was called.`:`Workflow: COS searched its knowledge, learning corpus and memory first (${evidence}) → did not reach sufficient confidence → external AI is the last resort.`
}