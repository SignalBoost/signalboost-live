import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { loadUserMemories } from '@/lib/ai/tools/userMemory'
import { resolveCosEnterpriseMemoryScope } from '@/lib/ai/cos/cosEnterpriseMemory'
import { retrieveEnterpriseMemoryContext } from '@/lib/enterprise/memory/retriever'
import { getAdminSupabase } from '@/utils/supabase/server'
import { independentReasonerHealth, externalFallbackEnabled } from '@/lib/ai/cos/cosOrchestrationEnterprise'

export type CosLiveSystemState = {
  generatedAt:string
  deployment:{commitSha:string|null;environment:string|null}
  localReasoner:{configured:boolean;healthy:boolean;model:string|null;error:string|null}
  externalFallbackEnabled:boolean
  enterpriseMemory:{status:string;organizationId:string|null;organizationRows:number|null;intelligenceSnapshots:number|null;repositorySnapshots:number|null;campaignMemories:number|null;confidenceHistory:number|null;retrievableItems:number|null;kinds:Record<string,number>}
  knowledgeGraph:{activeFacts:number|null;quarantinedFacts:number|null;latestUpdatedAt:string|null}
  learnedCorpus:{total:number|null;relevanceRejected:number|null;bySourceKind:Record<string,number>;latestObservedAt:string|null}
  cognitiveSkills:{validated:number|null;latestUpdatedAt:string|null}
  cache:{semanticRecords:number|null;exactRecords:number|null}
  userMemory:{available:boolean;records:number|null}
  lastTurnRecord:{source:string|null;updatedAt:string|null}|null
}

function n(result:any):number|null{return !result?.error&&typeof result?.count==='number'?result.count:null}
function s(value:unknown):string|null{const v=String(value??'').trim();return v||null}

export async function buildCosLiveSystemState(args:{userId?:string|null;privileged:boolean}):Promise<CosLiveSystemState>{
  const generatedAt=new Date().toISOString(),db=cosServiceDb()
  const reasonerPromise=independentReasonerHealth().catch(error=>({configured:false,healthy:false,model:null,error:error instanceof Error?error.message:String(error)}))
  let knowledgeGraph:CosLiveSystemState['knowledgeGraph']={activeFacts:null,quarantinedFacts:null,latestUpdatedAt:null}
  let learnedCorpus:CosLiveSystemState['learnedCorpus']={total:null,relevanceRejected:null,bySourceKind:{},latestObservedAt:null}
  let cognitiveSkills:CosLiveSystemState['cognitiveSkills']={validated:null,latestUpdatedAt:null}
  let cache:CosLiveSystemState['cache']={semanticRecords:null,exactRecords:null}
  let lastTurnRecord:CosLiveSystemState['lastTurnRecord']=null
  if(db){
    const [kgTotal,kgQ,kgLatest,clTotal,clRejected,clRows,clLatest,skills,skillLatest,semantic,exact,lastTurn]=await Promise.all([
      db.from('cos_knowledge_facts').select('id',{count:'exact',head:true}),
      db.from('cos_knowledge_facts').select('id',{count:'exact',head:true}).eq('predicate','excluded_from_cos_retrieval'),
      db.from('cos_knowledge_facts').select('updated_at').order('updated_at',{ascending:false}).limit(1).maybeSingle(),
      db.from('cos_continuous_learning').select('content_hash',{count:'exact',head:true}),
      db.from('cos_continuous_learning').select('content_hash',{count:'exact',head:true}).like('fact_extraction_error','relevance_rejected:%'),
      db.from('cos_continuous_learning').select('source_kind').limit(5000),
      db.from('cos_continuous_learning').select('observed_at').order('observed_at',{ascending:false}).limit(1).maybeSingle(),
      db.from('cos_cognitive_skills').select('id',{count:'exact',head:true}).eq('status','validated'),
      db.from('cos_cognitive_skills').select('updated_at').eq('status','validated').order('updated_at',{ascending:false}).limit(1).maybeSingle(),
      db.from('cos_knowledge_records').select('id',{count:'exact',head:true}),
      db.from('cos_exact_cache').select('cache_key',{count:'exact',head:true}),
      args.userId?db.from('cos_latest_turn_provenance').select('source,updated_at').eq('user_id',args.userId).maybeSingle():Promise.resolve({data:null,error:null}),
    ])
    const total=n(kgTotal),quarantined=n(kgQ)
    knowledgeGraph={activeFacts:total==null||quarantined==null?null:Math.max(0,total-quarantined),quarantinedFacts:quarantined,latestUpdatedAt:kgLatest.error?null:s(kgLatest.data?.updated_at)}
    const bySourceKind:Record<string,number>={}
    if(!clRows.error)for(const row of clRows.data??[]){const kind=s((row as any).source_kind)||'unknown';bySourceKind[kind]=(bySourceKind[kind]??0)+1}
    learnedCorpus={total:n(clTotal),relevanceRejected:n(clRejected),bySourceKind,latestObservedAt:clLatest.error?null:s(clLatest.data?.observed_at)}
    cognitiveSkills={validated:n(skills),latestUpdatedAt:skillLatest.error?null:s(skillLatest.data?.updated_at)}
    cache={semanticRecords:n(semantic),exactRecords:n(exact)}
    if(!lastTurn.error&&lastTurn.data)lastTurnRecord={source:s(lastTurn.data.source),updatedAt:s(lastTurn.data.updated_at)}
  }
  let enterpriseMemory:CosLiveSystemState['enterpriseMemory']={status:args.privileged?'scope_lookup_pending':'not_authorized',organizationId:null,organizationRows:null,intelligenceSnapshots:null,repositorySnapshots:null,campaignMemories:null,confidenceHistory:null,retrievableItems:null,kinds:{}}
  if(args.privileged){
    const scope=await resolveCosEnterpriseMemoryScope({privileged:true});enterpriseMemory.status=scope.status
    if(scope.scope){
      const orgId=scope.scope.organizationId,admin=getAdminSupabase()
      const [org,intelligence,repositories,campaigns,confidence,context]=await Promise.all([
        admin.from('enterprise_organizations').select('id',{count:'exact',head:true}).eq('id',orgId),
        admin.from('enterprise_intelligence_snapshots').select('id',{count:'exact',head:true}).eq('organization_id',orgId),
        admin.from('enterprise_repository_snapshots').select('id',{count:'exact',head:true}).eq('organization_id',orgId),
        admin.from('enterprise_campaign_memory').select('id',{count:'exact',head:true}).eq('organization_id',orgId),
        admin.from('enterprise_confidence_history').select('id',{count:'exact',head:true}).eq('organization_id',orgId),
        retrieveEnterpriseMemoryContext({organizationId:orgId,limit:50}).catch(()=>null),
      ])
      const kinds:Record<string,number>={};for(const item of context?.memories??[])kinds[item.kind]=(kinds[item.kind]??0)+1
      enterpriseMemory={status:scope.status,organizationId:orgId,organizationRows:n(org),intelligenceSnapshots:n(intelligence),repositorySnapshots:n(repositories),campaignMemories:n(campaigns),confidenceHistory:n(confidence),retrievableItems:context?.memories.length??0,kinds}
    }
  }
  const memories=args.userId?await loadUserMemories(args.userId).catch(()=>[]):[]
  return{generatedAt,deployment:{commitSha:s(process.env.VERCEL_GIT_COMMIT_SHA),environment:s(process.env.VERCEL_ENV)},localReasoner:await reasonerPromise,externalFallbackEnabled:externalFallbackEnabled(),enterpriseMemory,knowledgeGraph,learnedCorpus,cognitiveSkills,cache,userMemory:{available:Boolean(args.userId),records:args.userId?memories.length:null},lastTurnRecord}
}

export function formatCosLiveSystemState(state:CosLiveSystemState):string{
  const sources=Object.entries(state.learnedCorpus.bySourceKind).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k} ${v}`).join(', ')||'none'
  const emKinds=Object.entries(state.enterpriseMemory.kinds).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k} ${v}`).join(', ')||'none'
  return['LIVE SYSTEM STATE — queried now; independent of prior-answer provenance',`Generated              : ${state.generatedAt}`,`Deployment             : ${state.deployment.environment||'unknown'} @ ${state.deployment.commitSha||'unknown commit'}`,`Local Reasoner         : ${state.localReasoner.healthy?'HEALTHY':state.localReasoner.configured?'UNHEALTHY':'NOT CONFIGURED'}${state.localReasoner.model?` — ${state.localReasoner.model}`:''}${state.localReasoner.error?`; ${state.localReasoner.error}`:''}`,`Enterprise Memory      : ${state.enterpriseMemory.status} — org ${state.enterpriseMemory.organizationId||'none'}; organization ${state.enterpriseMemory.organizationRows??'unknown'}, intelligence ${state.enterpriseMemory.intelligenceSnapshots??'unknown'}, repository ${state.enterpriseMemory.repositorySnapshots??'unknown'}, campaign ${state.enterpriseMemory.campaignMemories??'unknown'}, confidence ${state.enterpriseMemory.confidenceHistory??'unknown'}; retrievable ${state.enterpriseMemory.retrievableItems??'unknown'} (${emKinds})`,`Knowledge Graph        : ${state.knowledgeGraph.activeFacts??'unknown'} active; ${state.knowledgeGraph.quarantinedFacts??'unknown'} quarantined; latest ${state.knowledgeGraph.latestUpdatedAt||'unknown'}`,`Learned Corpus         : ${state.learnedCorpus.total??'unknown'} total; ${state.learnedCorpus.relevanceRejected??'unknown'} relevance-rejected; sources ${sources}; latest observed ${state.learnedCorpus.latestObservedAt||'unknown'}`,`Cognitive Skills       : ${state.cognitiveSkills.validated??'unknown'} validated; latest ${state.cognitiveSkills.latestUpdatedAt||'unknown'}`,`Cache                  : ${state.cache.semanticRecords??'unknown'} semantic records; ${state.cache.exactRecords??'unknown'} exact records`,`User Memory            : ${state.userMemory.available?`${state.userMemory.records??'unknown'} records`:'no authenticated user scope'}`,`Last Provenance Record : ${state.lastTurnRecord?.updatedAt||'none'}${state.lastTurnRecord?.source?` — ${state.lastTurnRecord.source}`:''}`].join('\n')
}
