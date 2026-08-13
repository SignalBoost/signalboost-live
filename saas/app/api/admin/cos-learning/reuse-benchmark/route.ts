import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { tryCOSFirstAnswer, type COSFirstAnswerResult } from '@/lib/ai/cos/cosFirstAnswer'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { answerContainsRetentionFixture, parseRetentionBenchmarkFixture, retentionBenchmarkParaphrase, retentionBenchmarkPersistenceQuestion, retentionBenchmarkQuestion, retentionBenchmarkSourceUri } from '@/lib/ai/cos/retentionBenchmark'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BENCHMARK_PROMPT='Robotic manipulation tactile kinematics spatial thermal probability: using COS internal learned knowledge where available, explain how a robot should combine tactile feedback, inverse kinematics or spatial geometry, probabilistic state estimation, and thermal constraints while handling an unpredictable deformable object. Give concrete mechanisms and observables, and distinguish retained evidence from inference.'
function reply(r:COSFirstAnswerResult){return r.handled?r.reply:''}
function failureReason(r:COSFirstAnswerResult){return 'reason' in r?r.reason:null}
function cacheHit(r:COSFirstAnswerResult){return r.handled&&!r.provenance.localModelInvoked&&['semantic_cache','semantic_similarity'].includes(r.provenance.responseSource)}
function view(r:COSFirstAnswerResult){const p=r.provenance;return{handled:r.handled,confidence:r.confidence,responseSource:p.responseSource,similarityScore:p.similarityScore??null,localModelInvoked:p.localModelInvoked,reasonerLabel:p.reasonerLabel,externalAiInvoked:p.externalAiInvoked,knowledgeGraph:p.evidenceFunnel.knowledgeGraph,learnedCorpus:p.evidenceFunnel.learnedCorpus,knowledgeFactsCited:p.knowledgeFactsCited??0,learnedItemsCited:p.learnedItemsCited??0,cacheOrigin:p.cacheOrigin??null}}

async function canary(req:NextRequest,userId:string){
 const db=cosServiceDb();if(!db)return NextResponse.json({ok:false,error:'COS persistent store unavailable.'},{status:503})
 const id=req.nextUrl.searchParams.get('runId')?.trim().toLowerCase()||''
 let q=db.from('cos_continuous_learning').select('content_hash,source_kind,source_uri,source_title,observed_at,subject,summary,facts,confidence,created_at,fact_extraction_status').eq('source_kind','benchmark_fixture')
 q=id?q.eq('source_uri',retentionBenchmarkSourceUri(id)):q.order('created_at',{ascending:false}).limit(1)
 const stored=await q.maybeSingle();if(stored.error)return NextResponse.json({ok:false,error:stored.error.message},{status:500})
 const f=stored.data?parseRetentionBenchmarkFixture(stored.data):null;if(!f)return NextResponse.json({ok:false,error:'No valid COS retention benchmark fixture exists.'},{status:404})
 const k=await db.from('cos_knowledge_facts').select('id',{count:'exact',head:true}).eq('source',f.sourceUri),kgFactCount=k.error?null:k.count??0
 if(req.nextUrl.searchParams.get('proof')==='persistence'){
  const r=await tryCOSFirstAnswer({prompt:retentionBenchmarkPersistenceQuestion(f.protocol),userId,language:'en',privileged:true}),a=reply(r),p=r.provenance
  const assertions={durableCorpusRowPresent:true,answerCorrectFromRetainedCanary:answerContainsRetentionFixture(a,f),durableEvidenceRetrieved:p.evidenceFunnel.learnedCorpus.retrieved>0||p.evidenceFunnel.knowledgeGraph.retrieved>0,durableEvidenceSelected:p.evidenceFunnel.learnedCorpus.selected>0||p.evidenceFunnel.knowledgeGraph.selected>0,durableEvidenceCited:(p.learnedItemsCited??0)+(p.knowledgeFactsCited??0)>0,externalAiNotInvoked:p.externalAiInvoked===false}
  return NextResponse.json({ok:Object.values(assertions).every(Boolean),benchmark:'COS Learning & Retention Benchmark',proof:'persistence',runId:f.runId,canary:{protocol:f.protocol,quorum:`${f.quorumRequired} of ${f.quorumTotal}`,marker:f.marker},kgFactCount,freshLocalRetrieval:p.localModelInvoked,answer:a,provenance:view(r),assertions})
 }
 const prompt=retentionBenchmarkQuestion(f.protocol),fresh=await tryCOSFirstAnswer({prompt,userId,language:'en',privileged:true}),exact=await tryCOSFirstAnswer({prompt,userId,language:'en',privileged:true}),semantic=await tryCOSFirstAnswer({prompt:retentionBenchmarkParaphrase(f.protocol),userId,language:'en',privileged:true}),fa=reply(fresh),ea=reply(exact),sa=reply(semantic),p=fresh.provenance
 const assertions={durableCorpusRowPresent:true,learnedCorpusRetrieved:p.evidenceFunnel.learnedCorpus.retrieved>0,learnedCorpusSelected:p.evidenceFunnel.learnedCorpus.selected>0,learnedCorpusCited:(p.learnedItemsCited??0)>0,firstAnswerCorrect:answerContainsRetentionFixture(fa,f),firstAnswerLocalReasoning:p.localModelInvoked&&p.responseSource==='local_cos_reasoning',exactRepeatCorrect:answerContainsRetentionFixture(ea,f),exactRepeatCacheHit:cacheHit(exact),semanticParaphraseCorrect:answerContainsRetentionFixture(sa,f),semanticParaphraseCacheHit:cacheHit(semantic),externalAiNeverInvoked:!p.externalAiInvoked&&!exact.provenance.externalAiInvoked&&!semantic.provenance.externalAiInvoked}
 return NextResponse.json({ok:Object.values(assertions).every(Boolean),benchmark:'COS Learning & Retention Benchmark',proof:'cache-and-retention',runId:f.runId,canary:{protocol:f.protocol,quorum:`${f.quorumRequired} of ${f.quorumTotal}`,marker:f.marker},retainedAt:stored.data?.created_at??null,kgFactCount,fresh:{answer:fa,provenance:view(fresh)},exactRepeat:{answer:ea,provenance:view(exact)},semanticParaphrase:{answer:sa,provenance:view(semantic)},assertions})
}

export async function GET(req:NextRequest){
 const a=await getAccess();if(!a.userId)return NextResponse.json({ok:false,error:'Not signed in.'},{status:401});if(!a.isOwner&&!a.isAdmin)return NextResponse.json({ok:false,error:'Owner or admin access required.'},{status:403});if(req.nextUrl.searchParams.get('mode')==='canary')return canary(req,a.userId)
 const db=cosServiceDb();if(!db)return NextResponse.json({ok:false,error:'COS persistent store unavailable.'},{status:503})
 const terms=['robot','tactile','kinematic','spatial','thermal','probabil'],filters=terms.flatMap(t=>[`subject.ilike.%${t}%`,`summary.ilike.%${t}%`]).join(','),retained=await db.from('cos_continuous_learning').select('subject,summary,confidence,source_kind,source_uri,observed_at').or(filters).order('confidence',{ascending:false}).limit(12)
 if(retained.error)return NextResponse.json({ok:false,error:retained.error.message},{status:500})
 const prompt=`${BENCHMARK_PROMPT} Benchmark run ${Date.now()}.`,r=await tryCOSFirstAnswer({prompt,userId:a.userId,language:'en',privileged:true}),p=r.provenance,assertions={retainedRoboticsEvidencePresent:(retained.data??[]).length>0,cosHandledIndependently:r.handled,learnedCorpusConsulted:p.internalSystemsConsulted.includes('Continuous Learning Corpus'),learnedItemsSuppliedToAnswer:p.learnedItemsUsed>0,localReasonerPrimary:p.localModelInvoked&&p.reasonerLabel?.startsWith('independent-local:')===true,externalAiNotInvoked:p.externalAiInvoked===false}
 return NextResponse.json({ok:Object.values(assertions).every(Boolean),prompt,retainedEvidenceCount:(retained.data??[]).length,answer:r.handled?r.reply:null,confidence:r.confidence,reason:failureReason(r),provenance:p,assertions})
}
