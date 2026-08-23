// saas/lib/ai/cos/cosFirstAnswerEnterprise.ts
import { createHash } from 'node:crypto'
import { callCosReasoner, resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { classifyRunpodFailure, runpodCapacityUnavailableReason } from '@/lib/ai/cos/runpodCapacityError'
import { configuredRunpodPodId } from '@/lib/ai/cos/runpodConfig'
import { loadUserMemories } from '@/lib/ai/tools/userMemory'
import { cosServiceDb, SupabaseAIROIMetricsSink, SupabaseKnowledgeStore } from '@/lib/cos-core/storage/supabase'
import { SupabaseExactCacheStore } from '@/lib/cos-core/storage/exactSupabase'
import { createExactCacheKey } from '@/lib/cos-core/layers/exact-cache'
import { KnowledgeLayer } from '@/lib/cos-core/layers/knowledge'
import { generateLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'
import { domainCompatibleContext, rankContextCandidates, relevanceTerms } from '@/lib/ai/cos/contextRelevance'
import { countPendingLearnedCorpusEmbeddings, queryNearestLearnedCorpus } from '@/lib/ai/cos/learnedCorpusSemantic'
import { assessAnswerSpecificity, specificityReason } from '@/lib/ai/cos/answerSpecificity'
import { promptAppearsDiagnostic } from '@/lib/ai/cos/reasonerQuality'
import { parseLocalResult, citedEvidence, citedIndexedValues } from '@/lib/ai/cos/reasonerOutput'
import { cosAnswerPolicyVersion, cosCacheTaskId, cosCacheMaxAgeMs, cachedAnswerIsCurrent } from '@/lib/ai/cos/cosAnswerPolicy'
import { citedKnowledgeEvidenceCount, groundedEvidenceCeiling } from '@/lib/ai/cos/groundingConfidence'
import { retrieveValidatedCognitiveSkills, recordCitedCognitiveSkillReuse } from '@/lib/ai/cos/cognitiveSkillContext'
import { resolveCosEnterpriseMemoryScope } from '@/lib/ai/cos/cosEnterpriseMemory'
import { retrieveEnterpriseMemoryContext } from '@/lib/enterprise/memory/retriever'
import { classifyProblemClass } from '@/lib/ai/cos/cosProblemClass'
import { selectLearnedCorpusRows, classifyLearnedEvidence, learnedEvidenceLabel } from '@/lib/ai/cos/learnedEvidenceClass'
import { ENTERPRISE_MEMORY_DEFINITION, SEMANTIC_ANSWER_CACHE_DEFINITION, MEMORY_LAYER_COMPARISON_GUARDRAIL, canonicalSelfKnowledgeContribution } from '@/lib/ai/cos/cosMemoryLayerDefinitions'
import { stripInternalEvidenceIds } from '@/lib/ai/cos/answerEvidenceIdHygiene'

export type EvidenceFunnelStage = { retrieved:number; relevant:number; selected:number; injected:number; cited:number }
export type COSEvidenceFunnel = {
  knowledgeGraph: EvidenceFunnelStage
  learnedCorpus: EvidenceFunnelStage
  enterpriseMemory: EvidenceFunnelStage
  userMemory: EvidenceFunnelStage
}
export type COSFirstAnswerResult =
  | { handled:true; reply:string; confidence:number; provenance:COSProvenance }
  | { handled:false; confidence:number; reason:string; bestEffortReply?:string; provenance:COSProvenance }

export type COSProvenance = {
  responseSource:'semantic_cache'|'semantic_similarity'|'local_cos_reasoning'|'external_fallback_required'
  similarityScore?:number
  externalAiInvoked:false
  localModelInvoked:boolean
  reasonerLabel:string|null
  internalSystemsConsulted:string[]
  knowledgeFactsUsed:number
  learnedItemsUsed:number
  enterpriseMemoriesUsed:number
  userMemoriesUsed:number
  cognitiveSkillsUsed:number
  enterpriseMemoryStatus:string
  enterpriseMemoryOrganizationId:string|null
  evidenceFunnel:COSEvidenceFunnel
  cognitiveSkillFunnel:EvidenceFunnelStage
  knowledgeFactsCited?:number
  learnedItemsCited?:number
  enterpriseMemoriesCited?:number
  userMemoriesCited?:number
  cognitiveSkillsCited?:number
  canonicalSelfKnowledgeUsed?:{enterpriseMemoryDefinition:boolean; semanticCacheDefinition:boolean}
  cacheOrigin?:{
    storedAt:string|null
    policyVersion:string|null
    retrievedThisTurn:{facts:number;learned:number;enterprise:number;memories:number;skills?:number}
    originEvidenceFunnel?:COSEvidenceFunnel|null
    originCognitiveSkillFunnel?:EvidenceFunnelStage|null
  }
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

type CachedAnswerOrigin = {
  knowledgeFactsUsed:number
  learnedItemsUsed:number
  enterpriseMemoriesUsed:number
  userMemoriesUsed:number
  cognitiveSkillsUsed:number
  knowledgeFactsCited:number
  learnedItemsCited:number
  enterpriseMemoriesCited:number
  userMemoriesCited:number
  cognitiveSkillsCited:number
  evidenceFunnel?:COSEvidenceFunnel
  cognitiveSkillFunnel?:EvidenceFunnelStage
  canonicalSelfKnowledgeUsed?:{enterpriseMemoryDefinition:boolean; semanticCacheDefinition:boolean}
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
  enterpriseMemories:string[]
  memories:string[]
  skills:string[]
  skillIds:string[]
  enterpriseMemoryStatus:string
  enterpriseMemoryOrganizationId:string|null
  funnel:{
    knowledgeGraph:RetrievalCounts
    learnedCorpus:RetrievalCounts
    enterpriseMemory:RetrievalCounts
    userMemory:RetrievalCounts
    cognitiveSkills:RetrievalCounts
  }
}

function threshold():number {
  const value = Number(process.env.COS_LOCAL_CONFIDENCE_THRESHOLD || '0.72')
  return Number.isFinite(value) ? Math.max(.5, Math.min(.98, value)) : .72
}
function semanticThreshold():number {
  const value = Number(process.env.COS_SEMANTIC_SIMILARITY_THRESHOLD || '0.93')
  return Number.isFinite(value) ? Math.max(.80, Math.min(.999, value)) : .93
}
function knowledgeFactSimilarityThreshold():number {
  const value = Number(process.env.COS_KNOWLEDGE_FACT_SIMILARITY_THRESHOLD || '0.55')
  return Number.isFinite(value) ? Math.max(.25, Math.min(.95, value)) : .55
}
function learnedContextSimilarityThreshold():number {
  const value = Number(process.env.COS_LEARNED_CONTEXT_SIMILARITY_THRESHOLD || '0.45')
  return Number.isFinite(value) ? Math.max(.20, Math.min(.95, value)) : .45
}
function userMemorySimilarityThreshold():number {
  const value = Number(process.env.COS_USER_MEMORY_SIMILARITY_THRESHOLD || '0.52')
  return Number.isFinite(value) ? Math.max(.20, Math.min(.95, value)) : .52
}
function enterpriseMemorySimilarityThreshold():number {
  const value = Number(process.env.COS_ENTERPRISE_MEMORY_SIMILARITY_THRESHOLD || '0.52')
  return Number.isFinite(value) ? Math.max(.30, Math.min(.95, value)) : .52
}
function knowledgeFactRetrievalBudgetMs():number {
  const value = Number(process.env.COS_KNOWLEDGE_FACT_RETRIEVAL_BUDGET_MS || '5000')
  return Number.isFinite(value) ? Math.max(500, Math.min(15000, value)) : 5000
}
function answerPolicyVersion():string {
  return cosAnswerPolicyVersion({
    reasonerSystemPrompt:COS_REASONER_SYSTEM_PROMPT('English'),
    model:process.env.LOCAL_AI_MODEL?.trim() || null,
    threshold:threshold(),
  })
}

function cacheHitProvenance(
  payload:CachedCosAnswer,
  base:{
    knowledgeFactsUsed:number
    learnedItemsUsed:number
    enterpriseMemoriesUsed:number
    userMemoriesUsed:number
    cognitiveSkillsUsed:number
    enterpriseMemoryStatus:string
    enterpriseMemoryOrganizationId:string|null
    internalSystemsConsulted:string[]
    evidenceFunnel:COSEvidenceFunnel
    cognitiveSkillFunnel:EvidenceFunnelStage
  },
  responseSource:'semantic_cache'|'semantic_similarity',
  similarityScore?:number,
):COSProvenance {
  const origin = payload.origin
  return {
    responseSource,
    externalAiInvoked:false,
    localModelInvoked:false,
    reasonerLabel:payload.reasonerLabel,
    internalSystemsConsulted:base.internalSystemsConsulted,
    knowledgeFactsUsed:origin?.knowledgeFactsUsed ?? 0,
    learnedItemsUsed:origin?.learnedItemsUsed ?? 0,
    enterpriseMemoriesUsed:origin?.enterpriseMemoriesUsed ?? 0,
    userMemoriesUsed:origin?.userMemoriesUsed ?? 0,
    cognitiveSkillsUsed:origin?.cognitiveSkillsUsed ?? 0,
    enterpriseMemoryStatus:base.enterpriseMemoryStatus,
    enterpriseMemoryOrganizationId:base.enterpriseMemoryOrganizationId,
    evidenceFunnel:base.evidenceFunnel,
    cognitiveSkillFunnel:base.cognitiveSkillFunnel,
    knowledgeFactsCited:origin?.knowledgeFactsCited ?? 0,
    learnedItemsCited:origin?.learnedItemsCited ?? 0,
    enterpriseMemoriesCited:origin?.enterpriseMemoriesCited ?? 0,
    userMemoriesCited:origin?.userMemoriesCited ?? 0,
    cognitiveSkillsCited:origin?.cognitiveSkillsCited ?? 0,
    cacheOrigin:{
      storedAt:payload.storedAt ?? null,
      policyVersion:payload.policyVersion ?? null,
      retrievedThisTurn:{
        facts:base.evidenceFunnel.knowledgeGraph.retrieved,
        learned:base.evidenceFunnel.learnedCorpus.retrieved,
        enterprise:base.evidenceFunnel.enterpriseMemory.retrieved,
        memories:base.evidenceFunnel.userMemory.retrieved,
        skills:base.cognitiveSkillFunnel.retrieved,
      },
      originEvidenceFunnel:origin?.evidenceFunnel ?? null,
      originCognitiveSkillFunnel:origin?.cognitiveSkillFunnel ?? null,
    },
    ...(similarityScore === undefined ? {} : { similarityScore }),
  }
}

let knowledgeLayer:KnowledgeLayer|null|undefined
function semanticKnowledgeLayer():KnowledgeLayer|null {
  if (knowledgeLayer !== undefined) return knowledgeLayer
  const db = cosServiceDb()
  knowledgeLayer = db ? new KnowledgeLayer({
    generateEmbedding:generateLocalEmbedding,
    store:new SupabaseKnowledgeStore(db),
    similarityThreshold:semanticThreshold(),
    onError:error => console.error('cosFirstAnswer: semantic cache error', error),
  }) : null
  return knowledgeLayer
}

function estimatedInputCostPer1k():number {
  const value = Number(process.env.COS_BASELINE_INPUT_COST_PER_1K || '0.003')
  return Number.isFinite(value) && value >= 0 ? value : .003
}
function estimatedOutputCostPer1k():number {
  const value = Number(process.env.COS_BASELINE_OUTPUT_COST_PER_1K || '0.015')
  return Number.isFinite(value) && value >= 0 ? value : .015
}
function estimateAvoidedProviderCostUsd(promptCharsBefore:number, replyChars:number):number {
  const inputTokens = promptCharsBefore / 4
  const outputTokens = Math.max(replyChars, 200) / 4
  return (inputTokens / 1000) * estimatedInputCostPer1k() + (outputTokens / 1000) * estimatedOutputCostPer1k()
}
let roiSinkInstance:SupabaseAIROIMetricsSink|null|undefined
function roiSink():SupabaseAIROIMetricsSink|null {
  if (roiSinkInstance !== undefined) return roiSinkInstance
  const db = cosServiceDb()
  roiSinkInstance = db ? new SupabaseAIROIMetricsSink(db) : null
  return roiSinkInstance
}
function recordAvoidedCost(source:'semantic_similarity'|'exact_cache'|'local_reasoner', promptChars:number, replyChars:number, latencyMs:number):void {
  const sink = roiSink()
  if (!sink) return
  void sink.record({
    taskId:'cos-first-answer',
    source,
    providerCalls:0,
    estimatedProviderCostUsd:0,
    estimatedCostAvoidedUsd:estimateAvoidedProviderCostUsd(promptChars, replyChars),
    promptCharactersBefore:promptChars,
    promptCharactersAfter:promptChars,
    latencyMs,
  }).catch(error => console.error('cosFirstAnswer: ROI recording failed', error))
}

function queryTerms(prompt:string):string[] { return relevanceTerms(prompt).slice(0, 12) }
function subjectFromPrompt(prompt:string):string { return classifyProblemClass(prompt) }
function safeText(value:unknown, max=1200):string {
  let raw:string
  if (typeof value === 'string') raw = value
  else if (value && typeof value === 'object') {
    try { raw = JSON.stringify(value) ?? String(value) } catch { raw = String(value) }
  } else raw = String(value ?? '')
  return raw.replace(/\s+/g, ' ').trim().slice(0, max)
}
function organizationMemoryCitationCount(answer:string):number {
  const seen = new Set<number>()
  for (const match of String(answer ?? '').matchAll(/\[OEM(\d{1,2})\]/g)) {
    const index = Number(match[1])
    if (Number.isInteger(index) && index > 0) seen.add(index)
  }
  return seen.size
}
function rejectedLearningRow(row:any):boolean {
  return String(row?.fact_extraction_error ?? '').trim().toLowerCase().startsWith('relevance_rejected:')
}
function corpusCandidateText(row:{ subject?:unknown; summary?:unknown; facts?:unknown }):string {
  const factText = Array.isArray(row.facts) ? row.facts.slice(0, 6).map(fact => safeText(fact, 400)).join(' ') : ''
  return [safeText(row.subject, 240), safeText(row.summary, 1200), factText].filter(Boolean).join(' ')
}
function enterpriseCandidateText(item:any):string {
  return [
    safeText(item?.kind, 80),
    safeText(item?.workspace, 120),
    Array.isArray(item?.taskTags) ? item.taskTags.map((tag:unknown) => safeText(tag, 100)).join(' ') : '',
    safeText(item?.payload, 1800),
  ].filter(Boolean).join(' ')
}
export function COS_REASONER_SYSTEM_PROMPT(language:string):string {
  return [
    "You are COS, SignalBoost's independent PRIMARY reasoning layer.",
    'Reason from the question, your own model knowledge, and any supplied internal evidence.',
    `AUTHORITATIVE COS DEFINITIONS: ${ENTERPRISE_MEMORY_DEFINITION}`,
    `AUTHORITATIVE COS DEFINITIONS: ${SEMANTIC_ANSWER_CACHE_DEFINITION}`,
    `SCOPE RULE: ${MEMORY_LAYER_COMPARISON_GUARDRAIL}`,
    'These AUTHORITATIVE COS DEFINITIONS are foundational platform knowledge that is always true and always available to you — they are not retrieved evidence and require no [KG#]/[CL#]/[OEM#] citation to use. When a question asks what a COS component is, how two COS components differ, or anything else these definitions directly answer, answer directly from them. The absence of a matching [KG#]/[CL#]/[OEM#] row is not a reason to decline or hedge on a question these definitions already answer.',
    '',
    'SELF-KNOWLEDGE AND IMPROVEMENT BOUNDARIES:',
    '- COS can propose or implement governed changes to application code, prompts, retrieval, tools, workflows, knowledge, and validated procedures. Such changes require tests and approved deployment; do not claim they happened unless supplied evidence says so.',
    '- COS cannot autonomously retrain its provider/base-model weights, alter its own model weights, or silently deploy itself. Describe model training or provider upgrades as a separate approved training and deployment process.',
    '- For business-idea requests, do original product reasoning rather than reciting web lists: connect each proposal to the user\'s stated assets and constraints; state the target customer, painful workflow, distinctive wedge, revenue mechanism, and smallest credible first release. Reject ideas that are merely generic AI wrappers.',
    '',
    'ANSWER LIKE A SENIOR PRACTITIONER, NOT LIKE A CHECKLIST:',
    '- Lead with the mechanism the stated facts actually point at. If an observation rules something in or out, say so and say why.',
    '- For diagnostic or troubleshooting questions, every cause you name must carry the SPECIFIC OBSERVABLE that would confirm it: the exact metric, view, log field, query or counter someone would look at.',
    '- For diagnostic or troubleshooting questions, every cause must also carry what would FALSIFY it. A cause nothing could disprove is not a diagnosis.',
    '- Examples in this prompt illustrate answer quality only. They are never evidence and must not appear in an answer unless independently relevant to the user question.',
    '- When asked to rank, rank by fit to the stated facts and justify the order. Do not renumber a list of equals.',
    '- Three causes named precisely beat six named vaguely.',
    '- Naming a monitoring product is not naming a mechanism. For every cause, state the mechanism and then the observable that would show it.',
    '',
    'CITING INTERNAL EVIDENCE:',
    '- [KG#] = Knowledge Graph fact; [CL#] = learned-corpus evidence; [OEM#] = organization-scoped Enterprise Memory; [EM#] = saved per-user memory; [SK#] = validated procedural skill. Cite a label inline only when it genuinely informed the answer.',
    '- [OEM#], [KG#], and [CL#] may ground factual claims. [EM#] is user context, not independent factual corroboration. [SK#] is HOW-to-reason guidance, not factual corroboration.',
    '- If a supplied [KG#], [CL#], or [OEM#] directly supports a factual claim you make, use and cite it instead of silently restating the same claim only from pretrained knowledge.',
    '- NEVER cite an item that did not change what you wrote. Related-but-not-supporting evidence must remain uncited. An honest answer with zero factual citations is correct when supplied factual evidence was not useful.',
    '',
    'HONESTY:',
    '- Distinguish evidence from inference. Never invent sources, numbers or telemetry.',
    '- If you cannot name specific observables, say so plainly and set confidence low.',
    '',
    'MISSING EVIDENCE IS NOT A REASON TO PRODUCE NOTHING:',
    '- When the user asks you to CREATE something (content, a script, a plan, a draft) and the supporting data is absent, empty, or below its threshold, still produce the requested artifact using your ordinary judgement, then state in one short closing note what was missing and therefore did not inform it.',
    '- Refusing to create leaves the user with nothing, which is worse than an artifact that is merely not yet data-tuned. Reserve outright refusal for requests that are unsafe or genuinely impossible, never for thin evidence.',
    '- Never present ordinary judgement as if it were learned performance, and never invent weights, metrics, or heuristics to fill the gap. Say plainly which parts are judgement and which are evidence.',
    '',
    `Reply in ${language}.`,
    'Return ONLY strict JSON, nothing before the opening brace and nothing after the closing brace: {"answer":"complete answer","confidence":0.0}.',
  ].join('\n')
}

async function recordKnowledgeGap(prompt:string, confidence:number, reason:string):Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  try {
    const subject = subjectFromPrompt(prompt)
    const question = safeText(prompt, 2000)
    const capability = 'general_reasoning'
    const existing = await db.from('cos_learning_gaps').select('id,repeated_count')
      .eq('task_id', 'support').eq('subject', subject).eq('question', question).eq('capability', capability).maybeSingle()
    if (existing.data?.id) {
      await db.from('cos_learning_gaps').update({
        confidence,
        escalation_reason:safeText(reason, 1000),
        repeated_count:Number(existing.data.repeated_count || 1) + 1,
        status:'pending',
        last_seen_at:new Date().toISOString(),
        resolved_at:null,
      }).eq('id', existing.data.id)
    } else {
      await db.from('cos_learning_gaps').insert({
        task_id:'support', subject, question, capability, confidence,
        escalation_reason:safeText(reason, 1000), repeated_count:1, status:'pending', last_seen_at:new Date().toISOString(),
      })
    }
  } catch {}
}

async function resolveKnowledgeGap(prompt:string):Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  try {
    await db.from('cos_learning_gaps').update({
      status:'resolved', resolved_at:new Date().toISOString(), last_seen_at:new Date().toISOString(),
    }).eq('task_id', 'support').eq('question', safeText(prompt, 2000)).eq('capability', 'general_reasoning').in('status', ['pending','learning','failed'])
  } catch {}
}

async function semanticKnowledgeFacts(prompt:string, db:NonNullable<ReturnType<typeof cosServiceDb>>) {
  const work = (async () => {
    const vector = await generateLocalEmbedding(prompt)
    const rows = await new SupabaseKnowledgeStore(db).queryNearestFacts(vector, { matchCount:32, minSimilarity:0 })
    if (rows.some(row => row.predicate !== 'excluded_from_cos_retrieval' && Number(row.similarityScore || 0) >= knowledgeFactSimilarityThreshold())) return rows
    const pending = await db.from('cos_knowledge_facts').select('id', { count:'exact', head:true }).is('embedding', null)
    if (!pending.error && Number(pending.count ?? 0) > 0) {
      console.warn('cosFirstAnswer: relevant semantic fact coverage incomplete; lexical fallback remains active', { pending:pending.count })
      return null
    }
    return rows
  })().catch(error => {
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

async function semanticLearnedCorpus(prompt:string) {
  const work = (async () => {
    const vector = await generateLocalEmbedding(prompt)
    const rows = await queryNearestLearnedCorpus(vector, { matchCount:40, minSimilarity:0 })
    const hasRelevant = rows.some(row =>
      Number(row.similarity || 0) >= learnedContextSimilarityThreshold() && domainCompatibleContext(prompt, corpusCandidateText(row)),
    )
    if (hasRelevant) return rows
    const pending = await countPendingLearnedCorpusEmbeddings()
    if (Number(pending ?? 0) > 0) {
      console.warn('cosFirstAnswer: relevant semantic corpus coverage incomplete; lexical fallback remains active', { pending })
      return null
    }
    return rows
  })().catch(error => {
    console.warn('cosFirstAnswer: semantic corpus retrieval unavailable; lexical fallback will be used', error)
    return null
  })
  const budgetMs = knowledgeFactRetrievalBudgetMs()
  return Promise.race([
    work,
    new Promise<null>(resolve => setTimeout(() => {
      console.warn('cosFirstAnswer: semantic corpus retrieval exceeded budget; lexical fallback will be used', { budgetMs })
      resolve(null)
    }, budgetMs)),
  ])
}

function emptyRetrieval():RetrievalCounts { return { retrieved:0, relevant:0, selected:0 } }
function stage(counts:RetrievalCounts, injected:boolean, cited=0):EvidenceFunnelStage {
  return { ...counts, injected:injected ? counts.selected : 0, cited }
}

async function retrieveInternalContext(prompt:string, userId?:string|null, privileged=false):Promise<InternalContext> {
  const systems = ['semantic/exact cache preflight']
  const facts:string[] = []
  const learned:string[] = []
  const enterpriseMemories:string[] = []
  const memories:string[] = []
  const skills:string[] = []
  const skillIds:string[] = []
  const terms = queryTerms(prompt)
  const db = cosServiceDb()
  const funnel = {
    knowledgeGraph:emptyRetrieval(),
    learnedCorpus:emptyRetrieval(),
    enterpriseMemory:emptyRetrieval(),
    userMemory:emptyRetrieval(),
    cognitiveSkills:emptyRetrieval(),
  }
  let enterpriseMemoryStatus = privileged ? 'organization_not_found' : 'no_authorized_scope'
  let enterpriseMemoryOrganizationId:string|null = null

  if (db) {
    systems.push('Knowledge Graph', 'Continuous Learning Corpus')
    const [semanticResult, semanticLearnedResult] = await Promise.allSettled([
      semanticKnowledgeFacts(prompt, db),
      semanticLearnedCorpus(prompt),
    ])

    const semanticRows = semanticResult.status === 'fulfilled' ? semanticResult.value : null
    if (semanticRows !== null) {
      funnel.knowledgeGraph.retrieved = semanticRows.length
      const relevant = semanticRows.filter(row =>
        row.predicate !== 'excluded_from_cos_retrieval' && Number(row.similarityScore || 0) >= knowledgeFactSimilarityThreshold(),
      )
      funnel.knowledgeGraph.relevant = relevant.length
      const selected = relevant.slice(0, 16)
      funnel.knowledgeGraph.selected = selected.length
      for (const row of selected) {
        facts.push(`[KG${facts.length + 1}] ${safeText(row.subject,180)} — ${safeText(row.predicate,120)} — ${safeText(row.object,600)} [confidence ${Number(row.confidence || 0).toFixed(2)}; similarity ${Number(row.similarityScore || 0).toFixed(2)}; source ${safeText(row.source,180)}]`)
      }
    } else if (terms.length) {
      const factFilters = terms.flatMap(term => [`subject.ilike.%${term}%`, `predicate.ilike.%${term}%`, `object.ilike.%${term}%`]).join(',')
      const result = await db.from('cos_knowledge_facts').select('subject,predicate,object,confidence,source,updated_at')
        .or(factFilters).order('confidence', { ascending:false }).order('updated_at', { ascending:false }).order('subject', { ascending:true }).limit(32)
      if (!result.error) {
        const rows = (result.data ?? []).filter(row => row.predicate !== 'excluded_from_cos_retrieval')
        funnel.knowledgeGraph.retrieved = rows.length
        funnel.knowledgeGraph.relevant = rows.length
        const selected = rows.slice(0, 16)
        funnel.knowledgeGraph.selected = selected.length
        for (const row of selected) {
          facts.push(`[KG${facts.length + 1}] ${safeText(row.subject,180)} — ${safeText(row.predicate,120)} — ${safeText(row.object,600)} [confidence ${Number(row.confidence || 0).toFixed(2)}; source ${safeText(row.source,180)}]`)
        }
      }
    }

    const semanticLearned = semanticLearnedResult.status === 'fulfilled' ? semanticLearnedResult.value : null
    if (semanticLearned !== null) {
      funnel.learnedCorpus.retrieved = semanticLearned.length
      const relevant = semanticLearned.filter(row =>
        Number(row.similarity || 0) >= learnedContextSimilarityThreshold() && domainCompatibleContext(prompt, corpusCandidateText(row)),
      )
      funnel.learnedCorpus.relevant = relevant.length
      // Substantive rows take the limited injection slots first; metadata pointers fill leftovers.
      const selected = selectLearnedCorpusRows<(typeof relevant)[number]>(relevant, 6)
      funnel.learnedCorpus.selected = selected.length
      if (semanticLearned.length) systems.push('Continuous Learning semantic retrieval')
      for (const row of selected) {
        const evidenceFacts = Array.isArray(row.facts) ? row.facts.slice(0, 4).map(fact => safeText(fact,300)).join('; ') : ''
        learned.push(`[CL${learned.length + 1}] ${safeText(row.subject,180)}: ${safeText(row.summary,800)}${evidenceFacts ? ` Facts: ${evidenceFacts}` : ''} [${learnedEvidenceLabel(classifyLearnedEvidence(row))}; confidence ${Number(row.confidence || 0).toFixed(2)}; similarity ${Number(row.similarity || 0).toFixed(2)}; ${safeText(row.source_kind,80)} ${safeText(row.source_uri,280)}]`)
      }
    } else if (terms.length) {
      const learnedResult = await db.from('cos_continuous_learning')
        .select('subject,summary,facts,confidence,source_kind,source_uri,observed_at,fact_extraction_error')
        .or(terms.flatMap(term => [`subject.ilike.%${term}%`, `summary.ilike.%${term}%`]).join(','))
        .order('confidence', { ascending:false }).order('observed_at', { ascending:false }).order('source_uri', { ascending:true }).limit(128)
      if (!learnedResult.error) {
        const rows = (learnedResult.data ?? []).filter(row => !rejectedLearningRow(row))
        const candidates = rows.map(row => ({ item:row, text:corpusCandidateText(row) }))
        const ranked = await rankContextCandidates(prompt, candidates, { threshold:learnedContextSimilarityThreshold(), limit:candidates.length })
        funnel.learnedCorpus.retrieved = rows.length
        funnel.learnedCorpus.relevant = ranked.relevant.length
        // Same substance preference on the backfill-window path: candidates wrap the row in `item`.
        const rankedWithSummary = ranked.relevant.map(candidate => ({ ...candidate, summary: String((candidate.item as { summary?: unknown })?.summary ?? '') }))
        const selected = selectLearnedCorpusRows<(typeof rankedWithSummary)[number]>(rankedWithSummary, 6)
        funnel.learnedCorpus.selected = selected.length
        if (ranked.mode === 'semantic' && rows.length) systems.push('Continuous Learning semantic relevance')
        for (const candidate of selected) {
          const row = candidate.item
          const evidenceFacts = Array.isArray(row.facts) ? row.facts.slice(0, 4).map((fact:unknown) => safeText(fact,300)).join('; ') : ''
          learned.push(`[CL${learned.length + 1}] ${safeText(row.subject,180)}: ${safeText(row.summary,800)}${evidenceFacts ? ` Facts: ${evidenceFacts}` : ''} [${learnedEvidenceLabel(classifyLearnedEvidence(row))}; confidence ${Number(row.confidence || 0).toFixed(2)}; relevance ${candidate.similarity.toFixed(2)}; ${safeText(row.source_kind,80)} ${safeText(row.source_uri,280)}]`)
        }
      }
    }
  }

  const scopeResolution = await resolveCosEnterpriseMemoryScope({ privileged }).catch(() => ({ scope:null, status:'lookup_failed' as const }))
  enterpriseMemoryStatus = scopeResolution.status
  if (scopeResolution.scope) {
    enterpriseMemoryOrganizationId = scopeResolution.scope.organizationId
    systems.push('Organization Enterprise Memory')
    try {
      const context = await retrieveEnterpriseMemoryContext({
        organizationId:scopeResolution.scope.organizationId,
        workspace:scopeResolution.scope.workspace,
        taskTags:terms,
        limit:12,
      })
      const rows = context?.memories ?? []
      const candidates = rows.map(item => ({ item, text:enterpriseCandidateText(item) }))
      const ranked = await rankContextCandidates(prompt, candidates, { threshold:enterpriseMemorySimilarityThreshold(), limit:candidates.length })
      funnel.enterpriseMemory.retrieved = rows.length
      funnel.enterpriseMemory.relevant = ranked.relevant.length
      const selected = ranked.relevant.slice(0, 4)
      funnel.enterpriseMemory.selected = selected.length
      enterpriseMemoryStatus = rows.length ? (selected.length ? 'connected' : 'scoped_no_relevant_memory') : 'scoped_no_memory'
      if (ranked.mode === 'semantic' && rows.length) systems.push('Enterprise Memory semantic relevance')
      for (const candidate of selected) {
        const item = candidate.item
        enterpriseMemories.push(`[OEM${enterpriseMemories.length + 1}] [organization ${scopeResolution.scope.organizationId}; ${safeText(item.kind,60)}${item.workspace ? `; workspace ${safeText(item.workspace,80)}` : ''}] ${safeText(item.payload,850)} [confidence ${Number(item.confidence || 0).toFixed(2)}; retrieval_score ${Number(item.score || 0).toFixed(2)}; relevance ${candidate.similarity.toFixed(2)}]`)
      }
    } catch (error) {
      enterpriseMemoryStatus = 'retrieval_error'
      console.warn('[cos-enterprise-memory] retrieval failed', error)
    }
  }

  if (userId) {
    systems.push('Saved User Memory')
    const loaded = await loadUserMemories(userId).catch(() => [])
    const candidates = loaded.map(item => ({ item, text:`${safeText(item.kind,80)} ${safeText(item.content,1000)}` }))
    const ranked = await rankContextCandidates(prompt, candidates, { threshold:userMemorySimilarityThreshold(), limit:candidates.length })
    funnel.userMemory.retrieved = loaded.length
    funnel.userMemory.relevant = ranked.relevant.length
    const selected = ranked.relevant.slice(0, 4)
    funnel.userMemory.selected = selected.length
    if (ranked.mode === 'semantic' && loaded.length) systems.push('User memory semantic relevance')
    for (const candidate of selected) {
      const item = candidate.item
      memories.push(`[EM${memories.length + 1}] [${item.kind}] ${safeText(item.content,500)} [relevance ${candidate.similarity.toFixed(2)}]`)
    }
  }const cognitive = await retrieveValidatedCognitiveSkills(prompt).catch(error => {
    console.warn('[cos-cognitive-skill-context] ranking failed', error)
    return { retrieved:0, relevant:0, selected:0, items:[] }
  })
  funnel.cognitiveSkills = { retrieved:cognitive.retrieved, relevant:cognitive.relevant, selected:cognitive.selected }
  if (cognitive.retrieved > 0) systems.push('Validated Cognitive Skills')
  for (const item of cognitive.items) {
    skills.push(item.line)
    skillIds.push(item.id)
  }

  return {
    systems:[...new Set(systems)], facts, learned, enterpriseMemories, memories, skills, skillIds,
    enterpriseMemoryStatus, enterpriseMemoryOrganizationId, funnel,
  }
}

function executionFunnel(context:InternalContext, injected:boolean, cited={kg:0,cl:0,em:0}, enterpriseCited=0):COSEvidenceFunnel {
  return {
    knowledgeGraph:stage(context.funnel.knowledgeGraph, injected, cited.kg),
    learnedCorpus:stage(context.funnel.learnedCorpus, injected, cited.cl),
    enterpriseMemory:stage(context.funnel.enterpriseMemory, injected, enterpriseCited),
    userMemory:stage(context.funnel.userMemory, injected, cited.em),
  }
}
function executionSkillFunnel(context:InternalContext, injected:boolean, cited=0):EvidenceFunnelStage {
  return stage(context.funnel.cognitiveSkills, injected, cited)
}
function contextFingerprint(context:{facts:string[];learned:string[];enterpriseMemories:string[];memories:string[];skills:string[]}):string {
  return createHash('sha256').update(JSON.stringify({
    facts:context.facts, learned:context.learned, enterpriseMemories:context.enterpriseMemories, memories:context.memories, skills:context.skills,
  })).digest('hex')
}
async function readCachedAnswer(key:string):Promise<CachedCosAnswer|null> {
  const db = cosServiceDb()
  if (!db) return null
  try { return (await new SupabaseExactCacheStore(db).get<CachedCosAnswer>(key))?.value ?? null } catch { return null }
}
async function writeCachedAnswer(key:string, value:CachedCosAnswer):Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  try {
    const now = Date.now()
    await new SupabaseExactCacheStore(db).set(key, { value, createdAt:now, expiresAt:now + CACHE_TTL_MS })
  } catch {}
}

async function waitForCacheWritesWithinBudget(work: Promise<unknown>, budgetMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    await Promise.race([
      work.then(() => undefined),
      new Promise<void>(resolve => {
        timer = setTimeout(() => {
          console.warn('cosFirstAnswer: cache writes exceeded response budget; response continued while writes remain best-effort', { budgetMs })
          resolve()
        }, budgetMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function tryCOSFirstAnswer(input:{prompt:string;userId?:string|null;language?:string;privileged?:boolean;disableCache?:boolean}):Promise<COSFirstAnswerResult> {
  const startedAt = Date.now()
  const context = await retrieveInternalContext(input.prompt, input.userId, Boolean(input.privileged))
  const base = {
    externalAiInvoked:false as const,
    localModelInvoked:false,
    reasonerLabel:null as string|null,
    internalSystemsConsulted:context.systems,
    knowledgeFactsUsed:context.facts.length,
    learnedItemsUsed:context.learned.length,
    enterpriseMemoriesUsed:context.enterpriseMemories.length,
    userMemoriesUsed:context.memories.length,
    cognitiveSkillsUsed:context.skills.length,
    enterpriseMemoryStatus:context.enterpriseMemoryStatus,
    enterpriseMemoryOrganizationId:context.enterpriseMemoryOrganizationId,
    evidenceFunnel:executionFunnel(context, false),
    cognitiveSkillFunnel:executionSkillFunnel(context, false),
  }
  const contextWindow = [...context.facts, ...context.learned, ...context.enterpriseMemories, ...context.skills].join('\n')
  const scopedMemorySelected = context.enterpriseMemories.length > 0 || context.memories.length > 0
  const policyVersion = answerPolicyVersion()
  const cacheTaskId = cosCacheTaskId('cos-first-answer', policyVersion)
  const cacheMaxAgeMs = cosCacheMaxAgeMs()
  const knowledge = semanticKnowledgeLayer()

  if (!input.disableCache && knowledge && !scopedMemorySelected) {
    const nearest = await knowledge.lookupSemanticCache(cacheTaskId, input.prompt, contextWindow)
    if (nearest) {
      const payload = nearest.responsePayload as CachedCosAnswer|null
      const current = cachedAnswerIsCurrent(payload, policyVersion, cacheMaxAgeMs)
      if (payload?.reply && !current.ok) console.warn('cosFirstAnswer: semantic cache entry refused as stale', { reason:current.reason, similarity:nearest.similarityScore })
      if (payload?.reply && current.ok && payload.confidence >= threshold()) {
        recordAvoidedCost('semantic_similarity', input.prompt.length, payload.reply.length, Date.now() - startedAt)
        // Cache replay must be cleaned too: entries written before answer hygiene existed still
        // carry internal markers, and a cached leak is indistinguishable to the reader from a live
        // one (observed 2026-08-23 — an [OEM1] answer cached at 01:28 replayed verbatim).
        return { handled:true, reply:stripInternalEvidenceIds(payload.reply), confidence:payload.confidence, provenance:cacheHitProvenance(payload, base, 'semantic_similarity', nearest.similarityScore) }
      }
    }
  }

  const cacheKey = createExactCacheKey({
    taskId:cacheTaskId,
    prompt:input.prompt,
    contextFingerprint:contextFingerprint(context),
    policyVersion,
    knowledgeVersion:null,
  })
  const cached = input.disableCache ? null : await readCachedAnswer(cacheKey)
  const cachedCurrent = cachedAnswerIsCurrent(cached, policyVersion, cacheMaxAgeMs)
  if (cached?.reply && !cachedCurrent.ok) console.warn('cosFirstAnswer: exact cache entry refused as stale', { reason:cachedCurrent.reason })
  if (cached?.reply && cachedCurrent.ok && cached.confidence >= threshold()) {
    recordAvoidedCost('exact_cache', input.prompt.length, cached.reply.length, Date.now() - startedAt)
    return { handled:true, reply:stripInternalEvidenceIds(cached.reply), confidence:cached.confidence, provenance:cacheHitProvenance(cached, base, 'semantic_cache') }
  }

  if (process.env.COS_LOCAL_FIRST_ENABLED === 'false') {
    const reason = 'COS-first answering is disabled by COS_LOCAL_FIRST_ENABLED.'
    void recordKnowledgeGap(input.prompt, 0, reason)
    return { handled:false, confidence:0, reason, provenance:{ responseSource:'external_fallback_required', ...base } }
  }
  const resolved = resolveCosReasoner()
  if (!resolved.config) {
    const reason = 'reason' in resolved ? resolved.reason : 'Independent COS reasoner is not configured.'
    void recordKnowledgeGap(input.prompt, 0, reason)
    return { handled:false, confidence:0, reason, provenance:{ responseSource:'external_fallback_required', ...base } }
  }

  const internalContext = [
    context.facts.length ? `KNOWLEDGE GRAPH FACTS:\n${context.facts.join('\n')}` : '',
    context.learned.length ? `CONTINUOUS LEARNING CORPUS:\n${context.learned.join('\n')}` : '',
    context.enterpriseMemories.length ? `ORGANIZATION ENTERPRISE MEMORY:\n${context.enterpriseMemories.join('\n')}` : '',
    context.memories.length ? `SAVED USER MEMORY:\n${context.memories.join('\n')}` : '',
    context.skills.length ? `VALIDATED COGNITIVE PROCEDURAL SKILLS (HOW-TO GUIDANCE, NOT FACTUAL EVIDENCE):\n${context.skills.join('\n')}` : '',
  ].filter(Boolean).join('\n\n')

  // Captured outside the .catch() so the failure path below can distinguish a RunPod capacity
  // exhaustion from every other way a reasoner call can fail, instead of collapsing all of them
  // into one generic "did not return an answer" message with the real cause visible only in logs.
  let reasonerFailureMessage: string | null = null
  const reasoned = await callCosReasoner({
    temperature:Number(process.env.COS_REASONER_TEMPERATURE ?? '0'),
    maxTokens:Number(process.env.COS_REASONER_MAX_TOKENS || '6000'),
    systemPrompt:COS_REASONER_SYSTEM_PROMPT(input.language || 'English'),
    prompt:`${internalContext || 'No matching durable internal evidence was retrieved for this question.'}\n\nUSER QUESTION:\n${input.prompt}`,
  }).catch(error => {
    // Previously swallowed entirely (`.catch(() => null)`), so a wake-and-reason turn that failed
    // for ANY reason — cold-start timeout, aborted fetch, HTTP error from the endpoint, wake permission
    // denied mid-call — produced the identical generic "did not return an answer" message with zero
    // way to tell those apart from Vercel logs. Log the real error and elapsed time before discarding it.
    reasonerFailureMessage = error instanceof Error ? error.message : String(error)
    console.error('[cos-first-answer-reasoner-failed]', JSON.stringify({
      at: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      error: reasonerFailureMessage,
      errorName: error instanceof Error ? error.name : null,
    }))
    return null
  })

  const reasoningProvenance = {
    ...base,
    localModelInvoked:true,
    reasonerLabel:reasoned?.reasoner.label ?? resolved.config.label,
    evidenceFunnel:executionFunnel(context, true),
    cognitiveSkillFunnel:executionSkillFunnel(context, true),
  }
  if (!reasoned?.text) {
    // The one case this exists for: RunPod had no free GPU to start the pod. Everything else keeps
    // the exact prior wording, since escalationReason() in cosOrchestrationEnterprise.ts regex-matches
    // it into the 'local_reasoner_no_answer' code and nothing else should silently change that mapping.
    const capacity = reasonerFailureMessage ? classifyRunpodFailure(reasonerFailureMessage) : null
    const reason = capacity?.capacityUnavailable
      ? runpodCapacityUnavailableReason({ podId: configuredRunpodPodId(), originalMessage: reasonerFailureMessage! })
      : 'Independent COS inference did not return an answer.'
    void recordKnowledgeGap(input.prompt, 0, reason)
    return { handled:false, confidence:0, reason, provenance:{ responseSource:'external_fallback_required', ...reasoningProvenance } }
  }

  const parsed = parseLocalResult(reasoned.text)
  if (!parsed) {
    console.error('cosFirstAnswer: unparseable reasoner output', { characters:reasoned.text.length, raw:reasoned.text })
    const reason = `Independent COS inference returned an unparseable result after ${reasoned.text.length} characters. Raw output started: "${safeText(reasoned.text,240)}"`
    void recordKnowledgeGap(input.prompt, 0, reason)
    return { handled:false, confidence:0, reason, provenance:{ responseSource:'external_fallback_required', ...reasoningProvenance } }
  }
  if (parsed.truncated) {
    const maxTokens = Number(process.env.COS_REASONER_MAX_TOKENS || '6000')
    const reason = `Independent COS inference stopped mid-answer after ${reasoned.text.length} characters, so it never produced a confidence value. ${parsed.answer.length} characters were recoverable. Near the token ceiling, raise COS_REASONER_MAX_TOKENS (currently ${maxTokens}); far short of it, the call was cut off before the model finished.`
    void recordKnowledgeGap(input.prompt, 0, reason)
    return { handled:false, confidence:0, reason, provenance:{ responseSource:'external_fallback_required', ...reasoningProvenance } }
  }

  const cited = citedEvidence(parsed.answer)
  const enterpriseCited = organizationMemoryCitationCount(parsed.answer)
  const canonicalSelfKnowledgeUsed = canonicalSelfKnowledgeContribution(parsed.answer)
  const citedProvenance = {
    ...reasoningProvenance,
    knowledgeFactsCited:cited.kg,
    learnedItemsCited:cited.cl,
    enterpriseMemoriesCited:enterpriseCited,
    userMemoriesCited:cited.em,
    cognitiveSkillsCited:cited.sk,
    evidenceFunnel:executionFunnel(context, true, cited, enterpriseCited),
    cognitiveSkillFunnel:executionSkillFunnel(context, true, cited.sk),
    ...(canonicalSelfKnowledgeUsed.used ? { canonicalSelfKnowledgeUsed:{ enterpriseMemoryDefinition:canonicalSelfKnowledgeUsed.enterpriseMemoryDefinition, semanticCacheDefinition:canonicalSelfKnowledgeUsed.semanticCacheDefinition } } : {}),
  }
  const groundedCount = citedKnowledgeEvidenceCount({ kg:cited.kg, cl:cited.cl, oem:enterpriseCited })
  const ceiling = groundedEvidenceCeiling(groundedCount)
  const specificity = assessAnswerSpecificity(parsed.answer)
  const diagnosticQuestion = promptAppearsDiagnostic(input.prompt)
  const specificityCap = diagnosticQuestion ? specificity.cap : 1
  const confidence = Math.min(parsed.confidence, ceiling, specificityCap)
  if (specificity.applies && specificityCap < 1) {
    console.warn('cosFirstAnswer: answer specificity capped confidence', {
      score:specificity.score, cap:specificityCap, artifacts:specificity.artifacts, density:specificity.density,
      words:specificity.words, claimed:parsed.confidence, final:confidence,
    })
  }
  if (confidence < threshold()) {
    const cappedBySpecificity = specificity.applies && specificityCap < Math.min(parsed.confidence, ceiling)
    const reason = cappedBySpecificity
      ? `COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)}. ${specificityReason(specificity)}`
      : `COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)}.`
    void recordKnowledgeGap(input.prompt, confidence, reason)
    return { handled:false, confidence, reason, bestEffortReply:stripInternalEvidenceIds(parsed.answer), provenance:{ responseSource:'external_fallback_required', ...citedProvenance } }
  }

  const citedSkillIds = citedIndexedValues(parsed.answer, 'SK', context.skillIds)
  if (citedSkillIds.length) void recordCitedCognitiveSkillReuse(citedSkillIds)

  const storedAnswer:CachedCosAnswer = {
    // User-facing prose only: internal retrieval identifiers ([CL1], [LIVE2]) are prompt
    // scaffolding, and citation accounting above already ran against the raw answer. Leaked ids
    // confused a real user on 2026-08-22; see answerEvidenceIdHygiene.ts.
    reply:stripInternalEvidenceIds(parsed.answer),
    confidence,
    reasonerLabel:citedProvenance.reasonerLabel,
    policyVersion,
    storedAt:new Date().toISOString(),
    origin:{
      knowledgeFactsUsed:context.facts.length,
      learnedItemsUsed:context.learned.length,
      enterpriseMemoriesUsed:context.enterpriseMemories.length,
      userMemoriesUsed:context.memories.length,
      cognitiveSkillsUsed:context.skills.length,
      knowledgeFactsCited:cited.kg,
      learnedItemsCited:cited.cl,
      enterpriseMemoriesCited:enterpriseCited,
      userMemoriesCited:cited.em,
      cognitiveSkillsCited:cited.sk,
      evidenceFunnel:citedProvenance.evidenceFunnel,
      cognitiveSkillFunnel:citedProvenance.cognitiveSkillFunnel,
      ...(canonicalSelfKnowledgeUsed.used ? { canonicalSelfKnowledgeUsed:{ enterpriseMemoryDefinition:canonicalSelfKnowledgeUsed.enterpriseMemoryDefinition, semanticCacheDefinition:canonicalSelfKnowledgeUsed.semanticCacheDefinition } } : {}),
    },
  }
  const cacheWriteBudgetMs = Number(process.env.COS_CACHE_WRITE_BUDGET_MS ?? '8000')
  if (!input.disableCache) await waitForCacheWritesWithinBudget(
    Promise.allSettled([
      writeCachedAnswer(cacheKey, storedAnswer),
      knowledge ? knowledge.commitToMemory(cacheTaskId, input.prompt, contextWindow, storedAnswer) : Promise.resolve(),
    ]),
    cacheWriteBudgetMs,
  )
  recordAvoidedCost('local_reasoner', input.prompt.length, parsed.answer.length, Date.now() - startedAt)
  void resolveKnowledgeGap(input.prompt)
  // The LIVE return, not only the cached copy: an earlier fix stripped `storedAnswer.reply`
  // (what gets cached) but left this path raw, so fresh answers leaked [OEM1] while replays were
  // clean — backwards. Both paths strip now.
  return { handled:true, reply:stripInternalEvidenceIds(parsed.answer), confidence, provenance:{ responseSource:'local_cos_reasoning', ...citedProvenance } }
}

export function formatCosWorkflowStatement(result:COSFirstAnswerResult, language='en'):string {
  const p = result.provenance
  const evidence = `${p.knowledgeFactsUsed} knowledge facts, ${p.learnedItemsUsed} learned items, ${p.enterpriseMemoriesUsed} enterprise memories, ${p.cognitiveSkillsUsed} validated skills, ${p.userMemoriesUsed} saved memories`
  const source = p.responseSource === 'semantic_cache' ? 'exact-match cache' : p.responseSource === 'semantic_similarity' ? `semantic match, similarity ${(p.similarityScore ?? 0).toFixed(2)}` : p.reasonerLabel
  if (language === 'pt') return result.handled ? `Fluxo: COS consultou primeiro seu conhecimento, corpus, memória empresarial, habilidades validadas e memória do usuário (${evidence}) → respondeu via ${source} com confiança ${result.confidence.toFixed(2)}. Nenhuma IA externa foi chamada.` : `Fluxo: COS consultou primeiro sua memória interna (${evidence}) → não atingiu confiança suficiente → IA externa é apenas o último recurso.`
  if (language === 'es') return result.handled ? `Flujo: COS consultó primero su conocimiento, corpus, memoria empresarial, habilidades validadas y memoria del usuario (${evidence}) → respondió vía ${source} con confianza ${result.confidence.toFixed(2)}. No se llamó IA externa.` : `Flujo: COS consultó primero su memoria interna (${evidence}) → no alcanzó confianza suficiente → la IA externa es solo el último recurso.`
  return result.handled ? `Workflow: COS searched its knowledge, learning corpus, organization Enterprise Memory, validated skills and saved user memory first (${evidence}) → answered via ${source} at confidence ${result.confidence.toFixed(2)}. No external AI was called.` : `Workflow: COS searched its internal memory first (${evidence}) → did not reach sufficient confidence → external AI is the last resort.`
}
