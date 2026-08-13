// Presentation layer for COS provenance. Keep execution telemetry semantics strict while avoiding
// the misleading impression that retrieved evidence was never consulted simply because it was not cited.
import * as base from './cosOrchestrationEnterprise'

export const confidenceThreshold = base.confidenceThreshold
export const externalFallbackEnabled = base.externalFallbackEnabled
export const isProvenanceIntrospection = base.isProvenanceIntrospection
export const requestsExternalAction = base.requestsExternalAction
export const authoritativeProvenance = base.authoritativeProvenance
export const escalationReason = base.escalationReason
export const logEscalation = base.logEscalation
export const independentReasonerHealth = base.independentReasonerHealth

type FunnelStage = { retrieved:number; relevant:number; selected:number; injected:number; cited:number }
type EvidenceFunnel = { knowledgeGraph:FunnelStage; learnedCorpus:FunnelStage; enterpriseMemory:FunnelStage; userMemory:FunnelStage }

function count(value:unknown):number { const n=Number(value??0); return Number.isFinite(n)?Math.max(0,n):0 }

function evidenceStatus(value:any):string {
  const retrieved=count(value?.retrieved_count??value?.evidence_count)
  const relevant=count(value?.relevant_count)
  const selected=count(value?.selected_count)
  const injected=count(value?.injected_count)
  const cited=count(value?.evidence_count)
  if(value?.used||cited>0) return 'USED'
  if(injected>0) return 'INJECTED — NOT CITED'
  if(selected>0) return 'SELECTED — NOT INJECTED'
  if(relevant>0) return 'RETRIEVED — RELEVANT, NOT SELECTED'
  if(retrieved>0) return 'RETRIEVED — NOT RELEVANT'
  return 'NOT CONSULTED'
}

function funnelText(value:any,singular:string,plural:string):string {
  const retrieved=count(value?.retrieved_count??value?.evidence_count)
  const relevant=count(value?.relevant_count)
  const selected=count(value?.selected_count)
  const injected=count(value?.injected_count)
  const cited=count(value?.evidence_count)
  return `${evidenceStatus(value)} — ${retrieved} retrieved → ${relevant} relevant → ${selected} selected → ${injected} injected → ${cited} cited ${cited===1?singular:plural}.`
}

function originFunnelText(value:EvidenceFunnel|null,skill:FunnelStage|null):string {
  if(!value&&!skill) return 'origin evidence funnel was not recorded'
  const evidence=value
    ? `KG ${value.knowledgeGraph.injected} injected/${value.knowledgeGraph.cited} cited; corpus ${value.learnedCorpus.injected}/${value.learnedCorpus.cited} cited; Enterprise Memory ${value.enterpriseMemory.injected}/${value.enterpriseMemory.cited} cited; user memory ${value.userMemory.injected}/${value.userMemory.cited} cited`
    : 'KG/corpus/Enterprise Memory/user-memory origin funnel was not recorded'
  const skills=skill?`; skills ${skill.injected} injected/${skill.cited} cited`:''
  return `${evidence}${skills}`
}

export function formatAuthoritativeProvenance(
  provenance: ReturnType<typeof base.authoritativeProvenance>,
  language: string,
): string {
  const recorded=provenance as any
  const origin=provenance.answer_origin
  const lines=[
    'This is the real, recorded provenance for the immediately preceding answer. It is server execution telemetry, not a model-generated reconstruction.',
    '',
    'Status semantics: USED means cited/contributed to the answer; RETRIEVED means COS found it but did not rely on it; NOT CONSULTED means zero retrieval.',
    '',
    'Provenance',
    '──────────',
  ]

  if(origin?.from_cache){
    const written=origin.stored_at?`written ${origin.stored_at}`:'written on an earlier turn (no stored-at recorded)'
    const by=origin.model?` by ${origin.model}`:''
    const policy=origin.policy_version?`, under answer policy ${origin.policy_version}`:''
    lines.push(
      `Answer Origin         : SERVED FROM CACHE — reply ${written}${by}${policy}.`,
      `Origin Evidence       : ${originFunnelText(origin.evidence_funnel as EvidenceFunnel|null,origin.cognitive_skill_funnel as FunnelStage|null)}.`,
    )
  }

  if(recorded.deterministic_utility?.used){
    const utility=String(recorded.deterministic_utility.utility||'server utility')
    const timezone=recorded.deterministic_utility.timezone?`; timezone ${recorded.deterministic_utility.timezone}`:''
    lines.push(`Deterministic Utility : USED — ${utility}${timezone}`)
  }

  let enterpriseMemoryLine:string
  const enterpriseStatus=String(recorded.enterprise_memory?.status||'')
  if(enterpriseStatus==='not_connected_to_cos_primary') {
    enterpriseMemoryLine='Enterprise Memory     : LEGACY TURN — Enterprise Memory was not connected to COS Primary when this recorded answer was generated.'
  } else if(['no_authorized_scope','not_authorized'].includes(enterpriseStatus)) {
    enterpriseMemoryLine='Enterprise Memory     : NOT AVAILABLE — no authorized organization scope was available for this request.'
  } else {
    const status=enterpriseStatus?` Status: ${enterpriseStatus}.`:''
    enterpriseMemoryLine=`Enterprise Memory     : ${funnelText(provenance.enterprise_memory,'organization memory item','organization memory items')}${status}`
  }

  const localReasoningLine=origin?.from_cache&&!provenance.local_reasoning.invoked
    ? 'Local Reasoning Engine: SKIPPED — CACHE HIT; no new local-model inference was needed for this request.'
    : `Local Reasoning Engine: ${provenance.local_reasoning.invoked?'INVOKED':'NOT INVOKED'}${provenance.local_reasoning.model?` — ${provenance.local_reasoning.model}`:''}.`

  lines.push(
    `Semantic Cache        : ${provenance.semantic_cache.used?'USED':'NOT USED'} — ${provenance.semantic_cache.evidence_count} cached result${provenance.semantic_cache.evidence_count===1?'':'s'} contributed.`,
    enterpriseMemoryLine,
    `Knowledge Graph       : ${funnelText(provenance.knowledge_graph,'graph-backed fact','graph-backed facts')}`,
    `Learned Corpus        : ${funnelText(provenance.learned_corpus,'learned item','learned items')}`,
    `Cognitive Skills      : ${funnelText(provenance.cognitive_skills,'procedural skill','procedural skills')} Procedural guidance does not count as factual grounding.`,
    `User Memory           : ${funnelText(provenance.user_memory,'saved memory','saved memories')}`,
    `Autonomous Research   : ${provenance.autonomous_research.used?'USED':'NOT RUN'} — ${provenance.autonomous_research.documents_acquired} documents acquired; ${provenance.autonomous_research.new_knowledge_retained} new knowledge items retained during this request.`,
    localReasoningLine,
    `External AI Provider  : ${provenance.external_ai.invoked?'INVOKED':'NOT INVOKED — expected unless COS requires governed escalation'}${provenance.external_ai.invoked?` — provider ${provenance.external_ai.provider||'unknown'}${provenance.external_ai.model?`; model ${provenance.external_ai.model}`:''}`:''}.`,
  )

  if(provenance.local_reasoning.confidence!=null){
    const inherited=origin?.from_cache?' Recorded when the cached answer was generated; no confidence gate ran on this request.':''
    lines.push(`COS Confidence        : ${Number(provenance.local_reasoning.confidence).toFixed(2)} — threshold ${provenance.local_reasoning.threshold.toFixed(2)}.${inherited}`)
  }
  if(language!=='en') lines.push('','Note: provenance labels remain explicit and stable; the recorded values above are language-independent telemetry.')
  return lines.join('\n')
}
