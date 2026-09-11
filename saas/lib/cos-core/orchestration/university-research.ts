import { RunnableLambda } from '@langchain/core/runnables'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'

export type UniversityResearchInput = { runId:string; agentId:string; subject:string; question:string; contextRefs?:string[] }
export type UniversityResearchSource = { id:string; uri:string; title?:string; sourceKind?:string; metadata?:Record<string,unknown> }
export type UniversityResearchProvenance = { sourceId:string; sourceUri:string; observedAt:string; locator?:string; contentHash?:string }
export type UniversityResearchClaim = { statement:string; evidenceRefs?:string[]; confidence?:number }
export type UniversityResearchSourceEvidence = { sourceId:string; summary:string; claims:UniversityResearchClaim[]; provenance:UniversityResearchProvenance[] }
export type UniversityResearchSourceFailure = { sourceId:string; reason:string }
export type UniversityResearchContradiction = { topic:string; statementA:string; statementB:string; sourceIds:string[]; evidenceRefs?:string[] }
export type UniversityResearchReview = { status:'approved_for_handoff'|'needs_revision'; reviewerRole:string; reason?:string; evidenceRefs?:string[] }
export type UniversityResearchPlanStats = { proposedSources:number; selectedSources:number; truncatedSources:number; concurrency:number }
export type UniversityResearchCheckpointStage = 'planned'|'researched'|'contradictions_mapped'|'synthesized'|'reviewed'|'handed_off'
export type UniversityResearchCheckpoint<TSynthesis=unknown,THandoff=unknown> = {
  version:1; input:UniversityResearchInput; completedStage:UniversityResearchCheckpointStage;
  plannedSources:UniversityResearchSource[]; planStats?:UniversityResearchPlanStats;
  evidence:UniversityResearchSourceEvidence[]; failures:UniversityResearchSourceFailure[];
  contradictions:UniversityResearchContradiction[]; synthesis?:TSynthesis; review?:UniversityResearchReview;
  handoff?:THandoff; trace:string[]
}
export type UniversityResearchTransition = { stage:UniversityResearchCheckpointStage; runId:string; sourceCount:number; evidenceCount:number; failureCount:number; contradictionCount:number; reviewStatus?:UniversityResearchReview['status'] }
export type UniversityResearchGraphDependencies<TSynthesis,THandoff> = {
  planSources:(input:UniversityResearchInput)=>Promise<UniversityResearchSource[]>|UniversityResearchSource[]
  researchSource:(ctx:{input:UniversityResearchInput;source:UniversityResearchSource;index:number;total:number})=>Promise<UniversityResearchSourceEvidence>|UniversityResearchSourceEvidence
  identifyContradictions:(ctx:{input:UniversityResearchInput;evidence:UniversityResearchSourceEvidence[];failures:UniversityResearchSourceFailure[]})=>Promise<UniversityResearchContradiction[]>|UniversityResearchContradiction[]
  synthesize:(ctx:{input:UniversityResearchInput;evidence:UniversityResearchSourceEvidence[];failures:UniversityResearchSourceFailure[];contradictions:UniversityResearchContradiction[];planStats:UniversityResearchPlanStats})=>Promise<TSynthesis>|TSynthesis
  specialistReview:(ctx:{input:UniversityResearchInput;evidence:UniversityResearchSourceEvidence[];failures:UniversityResearchSourceFailure[];contradictions:UniversityResearchContradiction[];synthesis?:TSynthesis;planStats:UniversityResearchPlanStats})=>Promise<UniversityResearchReview>|UniversityResearchReview
  durableHandoff:(ctx:{input:UniversityResearchInput;evidence:UniversityResearchSourceEvidence[];failures:UniversityResearchSourceFailure[];contradictions:UniversityResearchContradiction[];synthesis?:TSynthesis;review:UniversityResearchReview;planStats:UniversityResearchPlanStats})=>Promise<THandoff>|THandoff
  persistCheckpoint:(checkpoint:UniversityResearchCheckpoint<TSynthesis,THandoff>)=>Promise<void>|void
  onTransition?:(event:UniversityResearchTransition)=>Promise<void>|void
}
export type UniversityResearchGraphResult<TSynthesis,THandoff> = {
  status:UniversityResearchReview['status']; input:UniversityResearchInput; planStats:UniversityResearchPlanStats;
  evidence:UniversityResearchSourceEvidence[]; failures:UniversityResearchSourceFailure[]; contradictions:UniversityResearchContradiction[];
  synthesis?:TSynthesis; review:UniversityResearchReview; handoff:THandoff; trace:string[]; academicAuthority:'none'
}

type State<TSynthesis,THandoff> = {
  input:UniversityResearchInput; maxSources:number; concurrency:number; completedStage:UniversityResearchCheckpointStage|'none';
  plannedSources:UniversityResearchSource[]; planStats?:UniversityResearchPlanStats; evidence:UniversityResearchSourceEvidence[];
  failures:UniversityResearchSourceFailure[]; contradictions:UniversityResearchContradiction[]; synthesis?:TSynthesis;
  review?:UniversityResearchReview; handoff?:THandoff; trace:string[]
}

const ResearchState = Annotation.Root({
  input:Annotation<UniversityResearchInput>(),
  maxSources:Annotation<number>({default:()=>24,reducer:(_a,b)=>b}),
  concurrency:Annotation<number>({default:()=>4,reducer:(_a,b)=>b}),
  completedStage:Annotation<UniversityResearchCheckpointStage|'none'>({default:()=> 'none',reducer:(_a,b)=>b}),
  plannedSources:Annotation<UniversityResearchSource[]>({default:()=>[],reducer:(_a,b)=>b}),
  planStats:Annotation<UniversityResearchPlanStats|undefined>({default:()=>undefined,reducer:(_a,b)=>b}),
  evidence:Annotation<UniversityResearchSourceEvidence[]>({default:()=>[],reducer:(_a,b)=>b}),
  failures:Annotation<UniversityResearchSourceFailure[]>({default:()=>[],reducer:(_a,b)=>b}),
  contradictions:Annotation<UniversityResearchContradiction[]>({default:()=>[],reducer:(_a,b)=>b}),
  synthesis:Annotation<unknown|undefined>({default:()=>undefined,reducer:(_a,b)=>b}),
  review:Annotation<UniversityResearchReview|undefined>({default:()=>undefined,reducer:(_a,b)=>b}),
  handoff:Annotation<unknown|undefined>({default:()=>undefined,reducer:(_a,b)=>b}),
  trace:Annotation<string[]>({default:()=>[],reducer:(a,b)=>a.concat(b)}),
})

const text=(value:unknown,max:number)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max)
const bounded=(value:number|undefined,fallback:number,min:number,max:number)=>Number.isSafeInteger(value)?Math.max(min,Math.min(max,Number(value))):fallback
const errorText=(error:unknown)=>error instanceof Error?text(error.message||error.name,1200):(text(error,1200)||'research_source_failed')

function normalizeInput(raw:UniversityResearchInput):UniversityResearchInput{
  const input={runId:text(raw.runId,180),agentId:text(raw.agentId,180),subject:text(raw.subject,300),question:text(raw.question,2000),contextRefs:(raw.contextRefs||[]).map(x=>text(x,500)).filter(Boolean).slice(0,50)}
  if(!input.runId||!input.agentId||!input.subject||!input.question)throw new Error('University research requires runId, agentId, subject, and question.')
  return input
}
function normalizeSource(raw:UniversityResearchSource):UniversityResearchSource{
  const source={...raw,id:text(raw.id,240),uri:text(raw.uri,2000),title:raw.title?text(raw.title,500):undefined,sourceKind:raw.sourceKind?text(raw.sourceKind,120):undefined}
  if(!source.id||!source.uri)throw new Error('University research sources require stable id and uri provenance.')
  return source
}
function validateEvidence(source:UniversityResearchSource,raw:UniversityResearchSourceEvidence):UniversityResearchSourceEvidence{
  if(!raw||text(raw.sourceId,240)!==source.id)throw new Error(`University research source ${source.id} returned mismatched evidence identity.`)
  const provenance=(raw.provenance||[]).map(p=>({...p,sourceId:text(p.sourceId,240),sourceUri:text(p.sourceUri,2000),observedAt:text(p.observedAt,120),locator:p.locator?text(p.locator,500):undefined,contentHash:p.contentHash?text(p.contentHash,200):undefined}))
  if(!provenance.length||provenance.some(p=>p.sourceId!==source.id||p.sourceUri!==source.uri||!p.observedAt||Number.isNaN(Date.parse(p.observedAt))))throw new Error(`University research source ${source.id} returned evidence without complete provenance.`)
  const claims=(raw.claims||[]).map(c=>({statement:text(c.statement,4000),evidenceRefs:(c.evidenceRefs||[]).map(x=>text(x,500)).filter(Boolean).slice(0,40),confidence:Number.isFinite(c.confidence)?Math.max(0,Math.min(1,Number(c.confidence))):undefined})).filter(c=>c.statement)
  const summary=text(raw.summary,12000)
  if(!summary&&!claims.length)throw new Error(`University research source ${source.id} returned no usable evidence.`)
  return {sourceId:source.id,summary,claims,provenance}
}
function validateContradictions(raw:UniversityResearchContradiction[],evidence:UniversityResearchSourceEvidence[]):UniversityResearchContradiction[]{
  const known=new Set(evidence.map(x=>x.sourceId))
  return(raw||[]).map(item=>{const sourceIds=[...new Set((item.sourceIds||[]).map(x=>text(x,240)).filter(Boolean))];const value={topic:text(item.topic,500),statementA:text(item.statementA,4000),statementB:text(item.statementB,4000),sourceIds,evidenceRefs:(item.evidenceRefs||[]).map(x=>text(x,500)).filter(Boolean).slice(0,80)};if(!value.topic||!value.statementA||!value.statementB)throw new Error('University research contradiction records require topic and both statements.');if(sourceIds.length<2||sourceIds.some(id=>!known.has(id)))throw new Error('University research contradiction records must reference at least two researched sources.');return value})
}
function validateReview(raw:UniversityResearchReview,evidenceCount:number):UniversityResearchReview{
  const review={status:raw.status,reviewerRole:text(raw.reviewerRole,240),reason:raw.reason?text(raw.reason,4000):undefined,evidenceRefs:(raw.evidenceRefs||[]).map(x=>text(x,500)).filter(Boolean).slice(0,100)}
  if(!['approved_for_handoff','needs_revision'].includes(review.status)||!review.reviewerRole)throw new Error('University research specialist review requires a valid status and reviewer role.')
  if(!evidenceCount&&review.status==='approved_for_handoff')throw new Error('University research cannot approve a handoff without provenance-backed evidence.')
  return review as UniversityResearchReview
}
async function parallelMap<T,R>(items:readonly T[],limit:number,worker:(item:T,index:number)=>Promise<R>):Promise<R[]>{
  const out=new Array<R>(items.length);let cursor=0
  const run=async()=>{while(true){const index=cursor++;if(index>=items.length)return;out[index]=await worker(items[index],index)}}
  await Promise.all(Array.from({length:Math.min(limit,Math.max(1,items.length))},()=>run()));return out
}
function assertResume<TSynthesis,THandoff>(input:UniversityResearchInput,checkpoint:UniversityResearchCheckpoint<TSynthesis,THandoff>){
  if(checkpoint.version!==1)throw new Error('Unsupported University research checkpoint version.')
  const prior=normalizeInput(checkpoint.input)
  if(prior.runId!==input.runId||prior.agentId!==input.agentId||prior.subject!==input.subject||prior.question!==input.question||JSON.stringify(prior.contextRefs||[])!==JSON.stringify(input.contextRefs||[]))throw new Error('University research checkpoint does not match the requested run.')
}

export function createUniversityResearchGraph<TSynthesis,THandoff>(deps:UniversityResearchGraphDependencies<TSynthesis,THandoff>){
  type S=State<TSynthesis,THandoff>
  const persist=async(state:S,patch:Partial<S>,stage:UniversityResearchCheckpointStage)=>{const trace=[...state.trace,...(patch.trace||[])];const next={...state,...patch,completedStage:stage,trace} as S;await deps.persistCheckpoint({version:1,input:next.input,completedStage:stage,plannedSources:[...next.plannedSources],planStats:next.planStats?{...next.planStats}:undefined,evidence:[...next.evidence],failures:[...next.failures],contradictions:[...next.contradictions],synthesis:next.synthesis,review:next.review?{...next.review}:undefined,handoff:next.handoff,trace});await deps.onTransition?.({stage,runId:next.input.runId,sourceCount:next.plannedSources.length,evidenceCount:next.evidence.length,failureCount:next.failures.length,contradictionCount:next.contradictions.length,reviewStatus:next.review?.status})}
  const resume=RunnableLambda.from(async()=>({trace:[] as string[]})).withConfig({runName:'university_research_resume'})
  const plan=RunnableLambda.from(async(raw:typeof ResearchState.State)=>{const state=raw as S;const proposed=await deps.planSources(state.input);if(!Array.isArray(proposed))throw new Error('University research source planning must return an array.');const normalized=proposed.map(normalizeSource);const ids=new Set<string>();for(const source of normalized){if(ids.has(source.id))throw new Error(`University research source plan contains duplicate id ${source.id}.`);ids.add(source.id)}const plannedSources=normalized.slice(0,state.maxSources);if(!plannedSources.length)throw new Error('University research source planning returned no usable sources.');const planStats={proposedSources:normalized.length,selectedSources:plannedSources.length,truncatedSources:Math.max(0,normalized.length-plannedSources.length),concurrency:state.concurrency};const patch={plannedSources,planStats,completedStage:'planned' as const,trace:[`plan:${plannedSources.length}:truncated:${planStats.truncatedSources}`]};await persist(state,patch,'planned');return patch}).withConfig({runName:'university_research_plan'})
  const research=RunnableLambda.from(async(raw:typeof ResearchState.State)=>{const state=raw as S;const outcomes=await parallelMap(state.plannedSources,state.concurrency,async(source,index):Promise<{evidence?:UniversityResearchSourceEvidence;failure?:UniversityResearchSourceFailure}>=>{try{return{evidence:validateEvidence(source,await deps.researchSource({input:state.input,source,index,total:state.plannedSources.length}))}}catch(error){return{failure:{sourceId:source.id,reason:errorText(error)}}}});const evidence=outcomes.flatMap(x=>x.evidence?[x.evidence]:[]),failures=outcomes.flatMap(x=>x.failure?[x.failure]:[]);const patch={evidence,failures,completedStage:'researched' as const,trace:[`research:${evidence.length}:failures:${failures.length}`]};await persist(state,patch,'researched');return patch}).withConfig({runName:'university_research_sources'})
  const contradictions=RunnableLambda.from(async(raw:typeof ResearchState.State)=>{const state=raw as S;const values=validateContradictions(await deps.identifyContradictions({input:state.input,evidence:state.evidence,failures:state.failures}),state.evidence);const patch={contradictions:values,completedStage:'contradictions_mapped' as const,trace:[`contradictions:${values.length}`]};await persist(state,patch,'contradictions_mapped');return patch}).withConfig({runName:'university_research_contradictions'})
  const synthesize=RunnableLambda.from(async(raw:typeof ResearchState.State)=>{const state=raw as S;if(!state.planStats)throw new Error('University research synthesis requires a source plan.');const synthesis=await deps.synthesize({input:state.input,evidence:state.evidence,failures:state.failures,contradictions:state.contradictions,planStats:state.planStats});const patch={synthesis,completedStage:'synthesized' as const,trace:['synthesize']};await persist(state,patch,'synthesized');return patch}).withConfig({runName:'university_research_synthesis'})
  const review=RunnableLambda.from(async(raw:typeof ResearchState.State)=>{const state=raw as S;if(!state.planStats)throw new Error('University research specialist review requires a source plan.');const review=validateReview(await deps.specialistReview({input:state.input,evidence:state.evidence,failures:state.failures,contradictions:state.contradictions,synthesis:state.synthesis,planStats:state.planStats}),state.evidence.length);const patch={review,completedStage:'reviewed' as const,trace:[`review:${review.status}`]};await persist(state,patch,'reviewed');return patch}).withConfig({runName:'university_research_specialist_review'})
  const handoff=RunnableLambda.from(async(raw:typeof ResearchState.State)=>{const state=raw as S;if(!state.planStats||!state.review)throw new Error('University research durable handoff requires source plan and specialist review.');const handoff=await deps.durableHandoff({input:state.input,evidence:state.evidence,failures:state.failures,contradictions:state.contradictions,synthesis:state.synthesis,review:state.review,planStats:state.planStats});const patch={handoff,completedStage:'handed_off' as const,trace:['handoff']};await persist(state,patch,'handed_off');return patch}).withConfig({runName:'university_research_durable_handoff'})
  const routeResume=(raw:typeof ResearchState.State):'plan'|'research'|'contradictions'|'synthesize'|'review'|'handoff'|'done'=>{const state=raw as S;switch(state.completedStage){case'planned':return'research';case'researched':return'contradictions';case'contradictions_mapped':return state.evidence.length?'synthesize':'review';case'synthesized':return'review';case'reviewed':return'handoff';case'handed_off':return'done';default:return'plan'}}
  const routeAfterContradictions=(raw:typeof ResearchState.State):'synthesize'|'review'=>(raw as S).evidence.length?'synthesize':'review'
  return new StateGraph(ResearchState).addNode('resume_step',resume).addNode('plan_step',plan).addNode('research_step',research).addNode('contradiction_step',contradictions).addNode('synthesis_step',synthesize).addNode('review_step',review).addNode('handoff_step',handoff).addEdge(START,'resume_step').addConditionalEdges('resume_step',routeResume,{plan:'plan_step',research:'research_step',contradictions:'contradiction_step',synthesize:'synthesis_step',review:'review_step',handoff:'handoff_step',done:END}).addEdge('plan_step','research_step').addEdge('research_step','contradiction_step').addConditionalEdges('contradiction_step',routeAfterContradictions,{synthesize:'synthesis_step',review:'review_step'}).addEdge('synthesis_step','review_step').addEdge('review_step','handoff_step').addEdge('handoff_step',END).compile()
}

export async function runUniversityResearchGraph<TSynthesis,THandoff>(input:UniversityResearchInput,deps:UniversityResearchGraphDependencies<TSynthesis,THandoff>,options:{maxSources?:number;concurrency?:number;recursionLimit?:number;resumeFrom?:UniversityResearchCheckpoint<TSynthesis,THandoff>}={}):Promise<UniversityResearchGraphResult<TSynthesis,THandoff>>{
  const normalized=normalizeInput(input),resume=options.resumeFrom;if(resume)assertResume(normalized,resume)
  const finalState=await createUniversityResearchGraph(deps).invoke({input:normalized,maxSources:bounded(options.maxSources,24,1,64),concurrency:bounded(options.concurrency,4,1,8),completedStage:resume?.completedStage||'none',plannedSources:resume?[...resume.plannedSources]:[],planStats:resume?.planStats?{...resume.planStats,concurrency:bounded(options.concurrency??resume.planStats.concurrency,4,1,8)}:undefined,evidence:resume?[...resume.evidence]:[],failures:resume?[...resume.failures]:[],contradictions:resume?[...resume.contradictions]:[],synthesis:resume?.synthesis,review:resume?.review?{...resume.review}:undefined,handoff:resume?.handoff,trace:resume?[...resume.trace,`resume:${resume.completedStage}`]:[]},{recursionLimit:bounded(options.recursionLimit,24,12,40)}) as State<TSynthesis,THandoff>
  if(!finalState.planStats||!finalState.review||finalState.handoff===undefined)throw new Error('University research graph ended without durable reviewed handoff evidence.')
  return Object.freeze({status:finalState.review.status,input:finalState.input,planStats:finalState.planStats,evidence:[...finalState.evidence],failures:[...finalState.failures],contradictions:[...finalState.contradictions],synthesis:finalState.synthesis,review:{...finalState.review},handoff:finalState.handoff,trace:[...finalState.trace],academicAuthority:'none'})
}
