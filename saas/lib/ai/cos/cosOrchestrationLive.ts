import * as base from './cosOrchestrationEnterprise'
import { requiresFreshExternalEvidence } from './cosFreshnessPolicy'

export const confidenceThreshold=base.confidenceThreshold
export const externalFallbackEnabled=base.externalFallbackEnabled
export const isProvenanceIntrospection=base.isProvenanceIntrospection
export function requestsExternalAction(input:string):boolean{return requiresFreshExternalEvidence(input)||base.requestsExternalAction(input)}
export const authoritativeProvenance=base.authoritativeProvenance
export const escalationReason=base.escalationReason
export const logEscalation=base.logEscalation
export const independentReasonerHealth=base.independentReasonerHealth

function value(v:unknown):string{return v==null?'unknown':String(v)}
function entries(v:any):string{if(!v||typeof v!=='object')return'none';const rows=Object.entries(v).sort(([a],[b])=>a.localeCompare(b));return rows.length?rows.map(([k,n])=>`${k} ${n}`).join(', '):'none'}
function formatLive(state:any):string{
  const local=state?.localReasoner??{},em=state?.enterpriseMemory??{},kg=state?.knowledgeGraph??{},cl=state?.learnedCorpus??{},skills=state?.cognitiveSkills??{},cache=state?.cache??{},user=state?.userMemory??{},last=state?.lastTurnRecord??null,deployment=state?.deployment??{}
  return [
    'LIVE SYSTEM STATE — queried now; independent of the prior-answer usage flags',
    `Generated              : ${value(state?.generatedAt)}`,
    `Deployment             : ${value(deployment.environment)} @ ${value(deployment.commitSha)}`,
    `Local Reasoner         : ${local.healthy?'HEALTHY':local.configured?'UNHEALTHY':'NOT CONFIGURED'}${local.model?` — ${local.model}`:''}${local.error?`; ${local.error}`:''}`,
    `Enterprise Memory      : ${value(em.status)} — org ${value(em.organizationId)}; organization ${value(em.organizationRows)}, intelligence ${value(em.intelligenceSnapshots)}, repository ${value(em.repositorySnapshots)}, campaign ${value(em.campaignMemories)}, confidence ${value(em.confidenceHistory)}; retrievable ${value(em.retrievableItems)} (${entries(em.kinds)})`,
    `Knowledge Graph        : ${value(kg.activeFacts)} active; ${value(kg.quarantinedFacts)} quarantined; latest ${value(kg.latestUpdatedAt)}`,
    `Learned Corpus         : ${value(cl.total)} total; ${value(cl.relevanceRejected)} relevance-rejected; sources ${entries(cl.bySourceKind)}; latest observed ${value(cl.latestObservedAt)}`,
    `Cognitive Skills       : ${value(skills.validated)} validated; latest ${value(skills.latestUpdatedAt)}`,
    `Cache                  : ${value(cache.semanticRecords)} semantic records; ${value(cache.exactRecords)} exact records`,
    `User Memory            : ${user.available?`${value(user.records)} records`:'no authenticated user scope'}`,
    `Last Provenance Record : ${last?`${value(last.updatedAt)}${last.source?` — ${last.source}`:''}`:'none'}`,
  ].join('\n')
}

function count(v:unknown):number{const n=Number(v??0);return Number.isFinite(n)?Math.max(0,n):0}
function funnel(v:any):string{return`${count(v?.retrieved_count)} retrieved → ${count(v?.relevant_count)} relevant → ${count(v?.selected_count)} selected → ${count(v?.injected_count)} injected → ${count(v?.evidence_count)} cited`}
function contributed(v:any):boolean{return Boolean(v?.used)||count(v?.evidence_count)>0}
function consulted(v:any):boolean{return count(v?.retrieved_count)>0||count(v?.relevant_count)>0||count(v?.selected_count)>0||count(v?.injected_count)>0}

function formatMaterialProvenance(provenance:any):string{
  const lines=[
    'This is the real, recorded provenance for the immediately preceding answer. It is server execution telemetry, not a model-generated reconstruction.',
    '',
    'Material Contributors',
    '─────────────────────',
  ]
  const origin=provenance?.answer_origin
  const externalInvoked=Boolean(provenance?.external_ai?.invoked)
  const localInvoked=Boolean(provenance?.local_reasoning?.invoked)
  if(origin?.from_cache){
    const written=origin.stored_at?` written ${origin.stored_at}`:''
    const model=origin.model?` by ${origin.model}`:''
    lines.push(`Answer Origin          : CACHE —${written}${model}.`)
  }
  if(provenance?.deterministic_utility?.used){
    const utility=String(provenance.deterministic_utility.utility||'server utility')
    lines.push(`Deterministic Utility  : ${utility}`)
  }
  if(provenance?.semantic_cache?.used)lines.push(`Semantic Cache         : ${count(provenance.semantic_cache.evidence_count)} cached result contributed.`)
  if(contributed(provenance?.enterprise_memory))lines.push(`Enterprise Memory      : ${funnel(provenance.enterprise_memory)}.`)
  if(contributed(provenance?.knowledge_graph))lines.push(`Knowledge Graph        : ${funnel(provenance.knowledge_graph)}.`)
  if(contributed(provenance?.learned_corpus))lines.push(`Learned Corpus         : ${funnel(provenance.learned_corpus)}.`)
  if(contributed(provenance?.cognitive_skills))lines.push(`Cognitive Skills       : ${funnel(provenance.cognitive_skills)}. Procedural guidance; not factual grounding.`)
  if(contributed(provenance?.user_memory))lines.push(`User Memory            : ${funnel(provenance.user_memory)}.`)
  if(localInvoked&&!externalInvoked)lines.push(`Local Reasoning Engine : ${provenance.local_reasoning.model||'local model'} — invoked.`)
  if(externalInvoked)lines.push(`External AI Provider   : ${provenance.external_ai.provider||'unknown'}${provenance.external_ai.model?` / ${provenance.external_ai.model}`:''} — invoked.`)

  const consultedOnly:string[]=[]
  for(const [label,item] of [
    ['Enterprise Memory',provenance?.enterprise_memory],
    ['Knowledge Graph',provenance?.knowledge_graph],
    ['Learned Corpus',provenance?.learned_corpus],
    ['Cognitive Skills',provenance?.cognitive_skills],
    ['User Memory',provenance?.user_memory],
  ] as const){if(!contributed(item)&&consulted(item))consultedOnly.push(`${label}: ${funnel(item)}`)}
  if(localInvoked&&externalInvoked)consultedOnly.push(`Local Reasoning Engine: ${provenance.local_reasoning.model||'local model'} invoked, but its draft was superseded and did not generate the recorded answer`)
  if(consultedOnly.length)lines.push('','Consulted but not material','──────────────────────────',consultedOnly.join('; ')+'.')

  const learned=count(provenance?.autonomous_research?.new_knowledge_retained)
  const acquired=count(provenance?.autonomous_research?.documents_acquired)
  lines.push('','Request Learning','────────────────',learned>0||acquired>0?`${acquired} documents acquired; ${learned} new knowledge items retained.`:'No new knowledge was acquired or retained during this request.')

  if(provenance?.local_reasoning?.confidence!=null)lines.push(`COS Confidence         : ${Number(provenance.local_reasoning.confidence).toFixed(2)} — threshold ${Number(provenance.local_reasoning.threshold??0).toFixed(2)}.`)
  return lines.join('\n')
}

export function formatAuthoritativeProvenance(provenance:ReturnType<typeof base.authoritativeProvenance>&Record<string,unknown>,language:string):string{
  const recorded=provenance as any
  const concise=formatMaterialProvenance(recorded)
  const localized=language!=='en'?`${concise}\n\nNote: provenance labels remain explicit and stable; the recorded values above are language-independent telemetry.`:concise
  return recorded?.live_system_state?`${localized}\n\n${formatLive(recorded.live_system_state)}`:localized
}
