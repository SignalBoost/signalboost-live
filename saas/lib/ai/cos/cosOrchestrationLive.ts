import * as base from './cosOrchestrationEnterprise'

export const confidenceThreshold=base.confidenceThreshold
export const externalFallbackEnabled=base.externalFallbackEnabled
export const isProvenanceIntrospection=base.isProvenanceIntrospection
// Fresh/precise factual grounding is a COS reasoning concern, not an instruction to invoke
// an external AI provider. Only actual execution/tool requests count as external actions here.
export const requestsExternalAction=base.requestsExternalAction
export const escalationReason=base.escalationReason
export const logEscalation=base.logEscalation
export const independentReasonerHealth=base.independentReasonerHealth

export function authoritativeProvenance(cos:any,external:{invoked:boolean;provider?:string|null;model?:string|null}){
  const recorded=base.authoritativeProvenance(cos,external) as any
  const evidence=cos?.provenance?.authoritativeEvidence
  if(evidence&&typeof evidence==='object'){
    const sources=Array.isArray(evidence.sources)?evidence.sources:[]
    recorded.autonomous_research={
      ...(recorded.autonomous_research||{}),
      used:Boolean(evidence.used),
      documents_acquired:sources.length,
      new_knowledge_retained:0,
    }
    recorded.live_external_evidence={
      used:Boolean(evidence.used),
      attempted:true,
      retrieved_at:evidence.retrievedAt||null,
      error:evidence.sufficient===false?'Authoritative evidence was insufficient for the configured policy.':null,
      sources:sources.map((source:any)=>({
        id:source?.id||'AUTH',
        title:source?.title||'authoritative source',
        url:source?.url||null,
        authority_tier:source?.authorityTier||null,
        authority_score:source?.authorityScore??null,
      })),
    }
    recorded.authoritative_grounding={
      used:Boolean(evidence.used),
      policy_mode:evidence.policyMode||null,
      policy_reason:evidence.policyReason||null,
      freshness_required:Boolean(evidence.freshnessRequired),
      search_query:evidence.searchQuery||null,
      retrieved_at:evidence.retrievedAt||null,
      sufficient:Boolean(evidence.sufficient),
      minimum_citations:Number(evidence.minimumCitations||0),
      synthesis_status:evidence.synthesisStatus||null,
    }
  }
  return recorded
}

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
  const volatileCache=provenance?.volatile_answer_cache
  const externalInvoked=Boolean(provenance?.external_ai?.invoked)
  const externalAccepted=provenance?.external_ai?.accepted!==false
  const externalMaterial=externalInvoked&&externalAccepted
  const localInvoked=Boolean(provenance?.local_reasoning?.invoked)
  const researchUsed=Boolean(provenance?.autonomous_research?.used)
  const liveEvidence=provenance?.live_external_evidence
  const authoritativeGrounding=provenance?.authoritative_grounding
  if(origin?.from_cache){
    const written=origin.stored_at?` written ${origin.stored_at}`:''
    const model=origin.model?` by ${origin.model}`:''
    lines.push(`Answer Origin          : CACHE —${written}${model}.`)
  }
  if(volatileCache?.used){
    lines.push(`Volatile Answer Cache  : USED — live-grounded answer reused; age ${count(volatileCache.age_ms)} ms${volatileCache.expires_at?`; expires ${volatileCache.expires_at}`:''}.`)
    if(volatileCache.original_grounded_at)lines.push(`Original Live Grounding: ${volatileCache.original_grounded_at}${volatileCache.original_external_provider?` — ${volatileCache.original_external_provider}${volatileCache.original_external_model?` / ${volatileCache.original_external_model}`:''}`:''}.`)
    const originSources=Array.isArray(volatileCache.origin_live_sources)?volatileCache.origin_live_sources:[]
    for(const source of originSources)lines.push(`  [${source?.id||'LIVE'}] ${source?.title||'source'} — ${source?.url||'URL unavailable'}`)
  }
  if(provenance?.deterministic_utility?.used){
    const utility=String(provenance.deterministic_utility.utility||'server utility')
    lines.push(`Deterministic Utility  : ${utility}`)
  }
  if(provenance?.semantic_cache?.used)lines.push(`Semantic Cache         : USED — ${count(provenance.semantic_cache.evidence_count)} cached result contributed.`)
  if(contributed(provenance?.enterprise_memory))lines.push(`Enterprise Memory      : USED — ${funnel(provenance.enterprise_memory)}.`)
  if(contributed(provenance?.knowledge_graph))lines.push(`Knowledge Graph        : USED — ${funnel(provenance.knowledge_graph)}.`)
  if(contributed(provenance?.learned_corpus))lines.push(`Learned Corpus         : USED — ${funnel(provenance.learned_corpus)}.`)
  if(contributed(provenance?.cognitive_skills))lines.push(`Cognitive Skills       : USED — ${funnel(provenance.cognitive_skills)}. Procedural guidance; not factual grounding.`)
  if(contributed(provenance?.user_memory))lines.push(`User Memory            : USED — ${funnel(provenance.user_memory)}.`)
  if(liveEvidence?.used){
    const sources=Array.isArray(liveEvidence.sources)?liveEvidence.sources:[]
    lines.push(`Live External Evidence : USED — ${sources.length} authoritative source${sources.length===1?'':'s'} retrieved${liveEvidence.retrieved_at?` at ${liveEvidence.retrieved_at}`:''}.`)
    for(const source of sources)lines.push(`  [${source?.id||'AUTH'}] ${source?.title||'source'} — ${source?.url||'URL unavailable'}${source?.authority_tier?` (${source.authority_tier})`:''}`)
  }
  if(authoritativeGrounding?.used)lines.push(`Authoritative Grounding: USED — policy ${authoritativeGrounding.policy_mode||'unknown'}; ${authoritativeGrounding.synthesis_status||'unknown'}; model memory was not accepted as factual authority.`)
  if(researchUsed)lines.push(`Autonomous Research    : USED — ${count(provenance.autonomous_research.documents_acquired)} live documents acquired; ${count(provenance.autonomous_research.new_knowledge_retained)} retained as new durable knowledge.`)
  if(localInvoked&&!externalMaterial)lines.push(`Local Reasoning Engine : INVOKED — ${provenance.local_reasoning.model||'local model'}.`)
  if(externalMaterial)lines.push(`External AI Provider   : INVOKED — ${provenance.external_ai.provider||'unknown'}${provenance.external_ai.model?` / ${provenance.external_ai.model}`:''}.`)

  const consultedOnly:string[]=[]
  for(const [label,item] of [
    ['Enterprise Memory',provenance?.enterprise_memory],
    ['Knowledge Graph',provenance?.knowledge_graph],
    ['Learned Corpus',provenance?.learned_corpus],
    ['Cognitive Skills',provenance?.cognitive_skills],
    ['User Memory',provenance?.user_memory],
  ] as const){if(!contributed(item)&&consulted(item))consultedOnly.push(`${label}: ${funnel(item)}`)}
  if(localInvoked&&externalMaterial)consultedOnly.push(`Local Reasoning Engine: ${provenance.local_reasoning.model||'local model'} invoked, but its draft was superseded and did not generate the recorded answer`)
  if(externalInvoked&&!externalAccepted)consultedOnly.push(`External AI Provider: ${provenance.external_ai.provider||'unknown'}${provenance.external_ai.model?` / ${provenance.external_ai.model}`:''} invoked, but its synthesis was rejected by the grounding gate`)
  if(consultedOnly.length)lines.push('','Consulted but not material','──────────────────────────',consultedOnly.join('; ')+'.')

  const notUsed:string[]=[]
  if(!provenance?.semantic_cache?.used)notUsed.push('Semantic Cache')
  if(!contributed(provenance?.enterprise_memory)&&!consulted(provenance?.enterprise_memory))notUsed.push('Enterprise Memory')
  if(!contributed(provenance?.knowledge_graph)&&!consulted(provenance?.knowledge_graph))notUsed.push('Knowledge Graph')
  if(!contributed(provenance?.learned_corpus)&&!consulted(provenance?.learned_corpus))notUsed.push('Learned Corpus')
  if(!researchUsed)notUsed.push('Autonomous Research')
  if(!localInvoked)notUsed.push('Local Reasoning Engine')
  if(!externalInvoked)notUsed.push('External AI Provider')
  if(notUsed.length)lines.push('','Explicitly not used','───────────────────',notUsed.map(label=>`${label}: NOT USED.`).join(' '))

  const learned=count(provenance?.autonomous_research?.new_knowledge_retained)
  const acquired=count(provenance?.autonomous_research?.documents_acquired)
  lines.push('','Request Learning','────────────────',learned>0?`${acquired} documents acquired; ${learned} new knowledge items retained.`:acquired>0?`${acquired} live documents were retrieved for this request; 0 new knowledge items were retained.`:'No new knowledge was acquired or retained during this request.')

  if(provenance?.local_reasoning?.confidence!=null)lines.push(`COS Confidence         : ${Number(provenance.local_reasoning.confidence).toFixed(2)} — threshold ${Number(provenance.local_reasoning.threshold??0).toFixed(2)}.`)
  return lines.join('\n')
}

export function formatAuthoritativeProvenance(provenance:ReturnType<typeof authoritativeProvenance>&Record<string,unknown>,language:string):string{
  const recorded=provenance as any
  const concise=formatMaterialProvenance(recorded)
  const localized=language!=='en'?`${concise}\n\nNote: provenance labels remain explicit and stable; the recorded values above are language-independent telemetry.`:concise
  return recorded?.live_system_state?`${localized}\n\n${formatLive(recorded.live_system_state)}`:localized
}
