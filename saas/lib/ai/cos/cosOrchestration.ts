// saas/lib/ai/cos/cosOrchestration.ts
// Shared COS routing and authoritative provenance policy used by live COS-first entrypoints.

import { resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { checkLocalInferenceHealth, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'

export function confidenceThreshold(): number {
  const value = Number(process.env.COS_LOCAL_CONFIDENCE_THRESHOLD || '0.72')
  return Number.isFinite(value) ? Math.max(0.5, Math.min(0.98, value)) : 0.72
}

export function externalFallbackEnabled(): boolean {
  return process.env.COS_EXTERNAL_AI_FALLBACK_ENABLED !== 'false'
}

export function isProvenanceIntrospection(input: string): boolean {
  const provenance = /\b(provenance|introspection|execution provenance|execution telemetry|audit trail|model contribution|model contributions|which model|what model|primary model|reasoner|semantic cache|enterprise memory|knowledge graph|learned corpus|learning corpus|cognitive skill|cognitive skills|procedural skill|procedural skills|autonomous research|external ai|external provider|internal systems?)\b/i
  const referent = /\b(previous|preceding|prior|last|just|that|this|answer|response|request|execution|used|invoked|contributed|generated|reasoning)\b/i
  return provenance.test(input) && referent.test(input)
}

export function requestsExternalAction(input: string): boolean {
  if (isProvenanceIntrospection(input)) return false
  const explicitExecution = /\b(run|execute|perform|investigate|check|fetch|pull|read|scan|audit|search|look up|research|deploy|commit|merge|create|update|delete|send|publish|queue|launch|start|fix|repair|change|modify|call the tool|use (?:the )?tools?)\b/i
  const target = /\b(repo|repository|github|vercel|supabase|logs?|metrics?|status page|production|database|table|file|route|api|web|internet|youtube|publication|magazine|journal|provider|campaign|prospect)\b/i
  return explicitExecution.test(input) && target.test(input)
}

type FunnelStage = { retrieved:number; relevant:number; selected:number; injected:number; cited:number }
type EvidenceFunnel = { knowledgeGraph:FunnelStage; learnedCorpus:FunnelStage; userMemory:FunnelStage }

function stage(value:any,fallbackRetrieved=0,fallbackCited=0,injectFallback=true):FunnelStage{
  return {
    retrieved:Number(value?.retrieved ?? fallbackRetrieved) || 0,
    relevant:Number(value?.relevant ?? fallbackRetrieved) || 0,
    selected:Number(value?.selected ?? fallbackRetrieved) || 0,
    injected:Number(value?.injected ?? (injectFallback ? fallbackRetrieved : 0)) || 0,
    cited:Number(value?.cited ?? fallbackCited) || 0,
  }
}

function originFunnel(p:any):EvidenceFunnel|null{
  if (!p?.cacheOrigin) return null
  const stored=p.cacheOrigin.originEvidenceFunnel
  if (stored) return {
    knowledgeGraph:stage(stored.knowledgeGraph),
    learnedCorpus:stage(stored.learnedCorpus),
    userMemory:stage(stored.userMemory),
  }
  const facts=Number(p?.knowledgeFactsUsed??0), learned=Number(p?.learnedItemsUsed??0), memories=Number(p?.userMemoriesUsed??0)
  return {
    knowledgeGraph:stage(null,facts,Number(p?.knowledgeFactsCited??0),true),
    learnedCorpus:stage(null,learned,Number(p?.learnedItemsCited??0),true),
    userMemory:stage(null,memories,Number(p?.userMemoriesCited??0),true),
  }
}

export function authoritativeProvenance(
  cos: any,
  external: { invoked: boolean; provider?: string | null; model?: string | null },
) {
  const p = cos?.provenance ?? null
  const semanticCacheHit = p?.responseSource === 'semantic_cache' || p?.responseSource === 'semantic_similarity'
  const thisTurn=p?.cacheOrigin?.retrievedThisTurn
  const kgFallback=semanticCacheHit ? Number(thisTurn?.facts??0) : Number(p?.knowledgeFactsUsed??0)
  const lcFallback=semanticCacheHit ? Number(thisTurn?.learned??0) : Number(p?.learnedItemsUsed??0)
  const umFallback=semanticCacheHit ? Number(thisTurn?.memories??0) : Number(p?.userMemoriesUsed??0)
  const skFallback=semanticCacheHit ? Number(thisTurn?.skills??0) : Number(p?.cognitiveSkillsUsed??0)
  const kg=stage(p?.evidenceFunnel?.knowledgeGraph,kgFallback,semanticCacheHit?0:Number(p?.knowledgeFactsCited??0),!semanticCacheHit)
  const lc=stage(p?.evidenceFunnel?.learnedCorpus,lcFallback,semanticCacheHit?0:Number(p?.learnedItemsCited??0),!semanticCacheHit)
  const um=stage(p?.evidenceFunnel?.userMemory,umFallback,semanticCacheHit?0:Number(p?.userMemoriesCited??0),!semanticCacheHit)
  const sk=stage(p?.cognitiveSkillFunnel,skFallback,semanticCacheHit?0:Number(p?.cognitiveSkillsCited??0),!semanticCacheHit)

  return {
    schema_version: 3,
    authority: 'server_execution_telemetry',
    model_generated: false,
    semantic_cache: { used: semanticCacheHit, evidence_count: semanticCacheHit ? 1 : 0 },
    // Enterprise Memory is a distinct organization-scoped subsystem. COS Primary does not yet
    // retrieve it, so never alias Knowledge Graph counters into this field just to make it look used.
    enterprise_memory: {
      used:false,
      retrieved_count:0,
      relevant_count:0,
      selected_count:0,
      injected_count:0,
      evidence_count:0,
      status:'not_connected_to_cos_primary',
    },
    knowledge_graph: { used:kg.cited>0,retrieved_count:kg.retrieved,relevant_count:kg.relevant,selected_count:kg.selected,injected_count:kg.injected,evidence_count:kg.cited },
    learned_corpus: { used:lc.cited>0,retrieved_count:lc.retrieved,relevant_count:lc.relevant,selected_count:lc.selected,injected_count:lc.injected,evidence_count:lc.cited },
    cognitive_skills: { used:sk.cited>0,retrieved_count:sk.retrieved,relevant_count:sk.relevant,selected_count:sk.selected,injected_count:sk.injected,evidence_count:sk.cited,semantics:'procedural_guidance_not_factual_evidence' },
    user_memory: { used:um.cited>0,retrieved_count:um.retrieved,relevant_count:um.relevant,selected_count:um.selected,injected_count:um.injected,evidence_count:um.cited },
    autonomous_research: {
      used: p?.autonomousResearchAttempted ?? false,
      documents_acquired: p?.researchDocumentsAcquired ?? 0,
      new_knowledge_retained: p?.knowledgeNewlyRetained ?? 0,
    },
    local_reasoning: {
      invoked: p?.localModelInvoked ?? false,
      model: semanticCacheHit ? null : p?.reasonerLabel ?? null,
      confidence: cos?.confidence ?? null,
      threshold: confidenceThreshold(),
    },
    external_ai: { invoked: external.invoked, provider: external.provider ?? null, model: external.model ?? null },
    answer_origin: {
      from_cache: semanticCacheHit,
      stored_at: p?.cacheOrigin?.storedAt ?? null,
      policy_version: p?.cacheOrigin?.policyVersion ?? null,
      model: semanticCacheHit ? p?.reasonerLabel ?? null : null,
      retrieved_this_turn: p?.cacheOrigin?.retrievedThisTurn ?? null,
      evidence_funnel: semanticCacheHit ? originFunnel(p) : null,
      cognitive_skill_funnel: semanticCacheHit ? p?.cacheOrigin?.originCognitiveSkillFunnel ?? null : null,
    },
  }
}

function usedLabel(value: boolean): string { return value ? 'USED' : 'NOT USED' }
function invokedLabel(value: boolean): string { return value ? 'INVOKED' : 'NOT INVOKED' }
function funnelText(value:any,singular:string,plural:string):string{
  const retrieved=Number(value?.retrieved_count??value?.evidence_count??0)
  const relevant=Number(value?.relevant_count??retrieved)
  const selected=Number(value?.selected_count??relevant)
  const injected=Number(value?.injected_count??selected)
  const cited=Number(value?.evidence_count??0)
  return `${usedLabel(Boolean(value?.used))} — ${retrieved} retrieved → ${relevant} relevant → ${selected} selected → ${injected} injected → ${cited} cited ${cited===1?singular:plural}.`
}
function originFunnelText(value:EvidenceFunnel|null,skill:FunnelStage|null):string{
  if(!value&&!skill) return 'origin evidence funnel was not recorded'
  const evidence=value
    ? `KG ${value.knowledgeGraph.injected} injected/${value.knowledgeGraph.cited} cited; corpus ${value.learnedCorpus.injected}/${value.learnedCorpus.cited} cited; memory ${value.userMemory.injected}/${value.userMemory.cited} cited`
    : 'KG/corpus/memory origin funnel was not recorded'
  const skills=skill?`; skills ${skill.injected} injected/${skill.cited} cited`:''
  return `${evidence}${skills}`
}

/** A component is USED only when evidence/guidance from it is demonstrably cited by the answer on this request. */
export function formatAuthoritativeProvenance(
  provenance: ReturnType<typeof authoritativeProvenance>,
  language: string,
): string {
  const recorded = provenance as any
  const lines = [
    'This is the real, recorded provenance for the immediately preceding answer. It is server execution telemetry, not a model-generated reconstruction.',
    '',
    'Provenance',
    '──────────',
  ]

  const origin=provenance.answer_origin
  if(origin?.from_cache){
    const written=origin.stored_at?`written ${origin.stored_at}`:'written on an earlier turn (no stored-at recorded)'
    const by=origin.model?` by ${origin.model}`:''
    const policy=origin.policy_version?`, under answer policy ${origin.policy_version}`:''
    lines.push(
      `Answer Origin         : SERVED FROM CACHE — reply ${written}${by}${policy}. No local reasoning ran on this request.`,
      `Origin Evidence       : ${originFunnelText(origin.evidence_funnel as EvidenceFunnel|null,origin.cognitive_skill_funnel as FunnelStage|null)}.`,
    )
  }

  if (recorded.deterministic_utility?.used) {
    const utility = String(recorded.deterministic_utility.utility || 'server utility')
    const timezone = recorded.deterministic_utility.timezone ? `; timezone ${recorded.deterministic_utility.timezone}` : ''
    lines.push(`Deterministic Utility : USED — ${utility}${timezone}`)
  }

  const enterpriseMemoryLine=recorded.enterprise_memory?.status==='not_connected_to_cos_primary'
    ? 'Enterprise Memory     : NOT USED — organization-scoped Enterprise Memory is not yet connected to COS Primary; Knowledge Graph counters are not substituted for it.'
    : `Enterprise Memory     : ${funnelText(provenance.enterprise_memory,'retained fact','retained facts')}`

  lines.push(
    `Semantic Cache        : ${usedLabel(provenance.semantic_cache.used)} — ${provenance.semantic_cache.evidence_count} cached result${provenance.semantic_cache.evidence_count === 1 ? '' : 's'} contributed.`,
    enterpriseMemoryLine,
    `Knowledge Graph       : ${funnelText(provenance.knowledge_graph,'graph-backed fact','graph-backed facts')}`,
    `Learned Corpus        : ${funnelText(provenance.learned_corpus,'learned item','learned items')}`,
    `Cognitive Skills      : ${funnelText(provenance.cognitive_skills,'procedural skill','procedural skills')} Procedural guidance does not count as factual grounding.`,
    `User Memory           : ${funnelText(provenance.user_memory,'saved memory','saved memories')}`,
    `Autonomous Research   : ${usedLabel(provenance.autonomous_research.used)} — ${provenance.autonomous_research.documents_acquired} documents acquired; ${provenance.autonomous_research.new_knowledge_retained} new knowledge items retained during this request.`,
    `Local Reasoning Engine: ${invokedLabel(provenance.local_reasoning.invoked)}${provenance.local_reasoning.model ? ` — ${provenance.local_reasoning.model}` : ''}.`,
    `External AI Provider  : ${invokedLabel(provenance.external_ai.invoked)}${provenance.external_ai.invoked ? ` — provider ${provenance.external_ai.provider || 'unknown'}${provenance.external_ai.model ? `; model ${provenance.external_ai.model}` : ''}` : ' — no OpenAI, Anthropic, Gemini, or other external model contributed to the recorded answer.'}`,
  )

  if (provenance.local_reasoning.confidence != null) {
    const inherited=origin?.from_cache?' Recorded when the cached answer was generated; no confidence gate ran on this request.':''
    lines.push(`COS Confidence        : ${Number(provenance.local_reasoning.confidence).toFixed(2)} — threshold ${provenance.local_reasoning.threshold.toFixed(2)}.${inherited}`)
  }
  if (language !== 'en') lines.push('', 'Note: provenance labels remain explicit and stable; the recorded values above are language-independent telemetry.')
  return lines.join('\n')
}

export function escalationReason(
  cos: any,
  localError: string | null,
  requestedAction: boolean,
): { code: string; detail: string } {
  if (localError) return { code: 'local_reasoner_exception', detail: localError }
  if (requestedAction) return { code: 'explicit_external_action', detail: 'Delegated requested external action to governed executor.' }
  if (cos && !cos.handled) {
    const detail = String(cos.reason || 'COS declined the request without a reason.')
    if (/not configured/i.test(detail)) return { code: 'local_reasoner_not_configured', detail }
    if (/below escalation threshold/i.test(detail)) return { code: 'confidence_below_threshold', detail }
    if (/did not return an answer/i.test(detail)) return { code: 'local_reasoner_no_answer', detail }
    if (/unparseable/i.test(detail)) return { code: 'local_reasoner_unparseable', detail }
    return { code: 'cos_first_declined', detail }
  }
  return { code: 'cos_first_unavailable', detail: 'COS-first attempt unavailable.' }
}

export function logEscalation(event: Record<string, unknown>): void {
  console.warn('[cos-escalation-audit]', JSON.stringify({ at: new Date().toISOString(), ...event }))
}

export async function independentReasonerHealth(): Promise<{ configured: boolean; healthy: boolean; model: string | null; error: string | null }> {
  const resolved = resolveCosReasoner()
  if ('reason' in resolved) return { configured: false, healthy: false, model: null, error: resolved.reason }
  try {
    const health = await checkLocalInferenceHealth(localInferenceConfigFromEnv())
    return { configured: true, healthy: health.ok, model: health.model, error: health.error ?? null }
  } catch (error) {
    return {
      configured: true,
      healthy: false,
      model: process.env.LOCAL_AI_MODEL?.trim() || null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
