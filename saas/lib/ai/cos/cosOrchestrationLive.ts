import * as base from './cosOrchestrationEnterprise'

export const confidenceThreshold=base.confidenceThreshold
export const externalFallbackEnabled=base.externalFallbackEnabled
export const isProvenanceIntrospection=base.isProvenanceIntrospection
export const requestsExternalAction=base.requestsExternalAction
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

export function formatAuthoritativeProvenance(provenance:ReturnType<typeof base.authoritativeProvenance>&Record<string,unknown>,language:string):string{
  const recorded=provenance as any
  const original=base.formatAuthoritativeProvenance(provenance,language)
  return recorded?.live_system_state?`${original}\n\n${formatLive(recorded.live_system_state)}`:original
}
