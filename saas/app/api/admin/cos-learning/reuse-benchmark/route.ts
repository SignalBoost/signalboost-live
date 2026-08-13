import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { tryCOSFirstAnswer, type COSFirstAnswerResult } from '@/lib/ai/cos/cosFirstAnswer'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  answerContainsRetentionFixture,
  parseRetentionBenchmarkFixture,
  retentionBenchmarkParaphrase,
  retentionBenchmarkPersistenceQuestion,
  retentionBenchmarkQuestion,
  retentionBenchmarkSourceUri,
} from '@/lib/ai/cos/retentionBenchmark'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BENCHMARK_PROMPT = 'Robotic manipulation tactile kinematics spatial thermal probability: using COS internal learned knowledge where available, explain how a robot should combine tactile feedback, inverse kinematics or spatial geometry, probabilistic state estimation, and thermal constraints while handling an unpredictable deformable object. Give concrete mechanisms and observables, and distinguish retained evidence from inference.'

function reply(result: COSFirstAnswerResult): string {
  return result.handled ? result.reply : ''
}
function isCacheHit(result: COSFirstAnswerResult): boolean {
  return result.handled && !result.provenance.localModelInvoked && ['semantic_cache','semantic_similarity'].includes(result.provenance.responseSource)
}
function compact(result: COSFirstAnswerResult) {
  const p = result.provenance
  return {
    handled: result.handled, confidence: result.confidence, responseSource: p.responseSource,
    similarityScore: p.similarityScore ?? null, localModelInvoked: p.localModelInvoked,
    reasonerLabel: p.reasonerLabel, externalAiInvoked: p.externalAiInvoked,
    knowledgeGraph: p.evidenceFunnel.knowledgeGraph, learnedCorpus: p.evidenceFunnel.learnedCorpus,
    knowledgeFactsCited: p.knowledgeFactsCited ?? 0, learnedItemsCited: p.learnedItemsCited ?? 0,
    cacheOrigin: p.cacheOrigin ?? null,
  }
}

async function canary(req: NextRequest, userId: string) {
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok:false, error:'COS persistent store unavailable.' }, { status:503 })
  const runId = req.nextUrl.searchParams.get('runId')?.trim().toLowerCase() || ''
  let q = db.from('cos_continuous_learning')
    .select('content_hash,source_kind,source_uri,source_title,observed_at,subject,summary,facts,confidence,created_at,fact_extraction_status')
    .eq('source_kind','benchmark_fixture')
  q = runId ? q.eq('source_uri',retentionBenchmarkSourceUri(runId)) : q.order('created_at',{ascending:false}).limit(1)
  const stored = await q.maybeSingle()
  if (stored.error) return NextResponse.json({ok:false,error:stored.error.message},{status:500})
  const fixture = stored.data ? parseRetentionBenchmarkFixture(stored.data) : null
  if (!fixture) return NextResponse.json({ok:false,error:'No valid COS retention benchmark fixture exists.'},{status:404})
  const kg = await db.from('cos_knowledge_facts').select('id',{count:'exact',head:true}).eq('source',fixture.sourceUri)
  const kgFactCount = kg.error ? null : kg.count ?? 0

  if (req.nextUrl.searchParams.get('proof') === 'persistence') {
    const result = await tryCOSFirstAnswer({prompt:retentionBenchmarkPersistenceQuestion(fixture.protocol),userId,language:'en',privileged:true})
    const answer = reply(result), p = result.provenance
    const assertions = {
      durableCorpusRowPresent:true,
      answerCorrectFromRetainedCanary:answerContainsRetentionFixture(answer,fixture),
      durableEvidenceRetrieved:p.evidenceFunnel.learnedCorpus.retrieved>0 || p.evidenceFunnel.knowledgeGraph.retrieved>0,
      durableEvidenceSelected:p.evidenceFunnel.learnedCorpus.selected>0 || p.evidenceFunnel.knowledgeGraph.selected>0,
      durableEvidenceCited:(p.learnedItemsCited??0)+(p.knowledgeFactsCited??0)>0,
      externalAiNotInvoked:p.externalAiInvoked===false,
    }
    return NextResponse.json({ok:Object.values(assertions).every(Boolean),benchmark:'COS Learning & Retention Benchmark',proof:'persistence',runId:fixture.runId,canary:{protocol:fixture.protocol,quorum:`${fixture.quorumRequired} of ${fixture.quorumTotal}`,marker:fixture.marker},kgFactCount,freshLocalRetrieval:p.localModelInvoked,answer,provenance:compact(result),assertions})
  }

  const question = retentionBenchmarkQuestion(fixture.protocol)
  const fresh = await tryCOSFirstAnswer({prompt:question,userId,language:'en',privileged:true})
  const exact = await tryCOSFirstAnswer({prompt:question,userId,language:'en',privileged:true})
  const semantic = await tryCOSFirstAnswer({prompt:retentionBenchmarkParaphrase(fixture.protocol),userId,language:'en',privileged:true})
  const fa=reply(fresh), ea=reply(exact), sa=reply(semantic), p=fresh.provenance
  const assertions = {
    durableCorpusRowPresent:true,
    learnedCorpusRetrieved:p.evidenceFunnel.learnedCorpus.retrieved>0,
    learnedCorpusSelected:p.evidenceFunnel.learnedCorpus.selected>0,
    learnedCorpusCited:(p.learnedItemsCited??0)>0,
    firstAnswerCorrect:answerContainsRetentionFixture(fa,fixture),
    firstAnswerLocalReasoning:p.localModelInvoked && p.responseSource==='local_cos_reasoning',
    exactRepeatCorrect:answerContainsRetentionFixture(ea,fixture), exactRepeatCacheHit:isCacheHit(exact),
    semanticParaphraseCorrect:answerContainsRetentionFixture(sa,fixture), semanticParaphraseCacheHit:isCacheHit(semantic),
    externalAiNeverInvoked:!p.externalAiInvoked&&!exact.provenance.externalAiInvoked&&!semantic.provenance.externalAiInvoked,
  }
  return NextResponse.json({ok:Object.values(assertions).every(Boolean),benchmark:'COS Learning & Retention Benchmark',proof:'cache-and-retention',runId:fixture.runId,canary:{protocol:fixture.protocol,quorum:`${fixture.quorumRequired} of ${fixture.quorumTotal}`,marker:fixture.marker},retainedAt:stored.data?.created_at??null,kgFactCount,fresh:{answer:fa,provenance:compact(fresh)},exactRepeat:{answer:ea,provenance:compact(exact)},semanticParaphrase:{answer:sa,provenance:compact(semantic)},assertions})
}

export async function GET(req: NextRequest) {
  const access = await getAccess()
  if (!access.userId) return NextResponse.json({ok:false,error:'Not signed in.'},{status:401})
  if (!access.isOwner && !access.isAdmin) return NextResponse.json({ok:false,error:'Owner or admin access required.'},{status:403})
  if (req.nextUrl.searchParams.get('mode')==='canary') return canary(req,access.userId)

  const db=cosServiceDb()
  if (!db) return NextResponse.json({ok:false,error:'COS persistent store unavailable.'},{status:503})
  const terms=['robot','tactile','kinematic','spatial','thermal','probabil']
  const filters=terms.flatMap(t=>[`subject.ilike.%${t}%`,`summary.ilike.%${t}%`]).join(',')
  const retained=await db.from('cos_continuous_learning').select('subject,summary,confidence,source_kind,source_uri,observed_at').or(filters).order('confidence',{ascending:false}).limit(12)
  if (retained.error) return NextResponse.json({ok:false,error:retained.error.message},{status:500})
  const prompt=`${BENCHMARK_PROMPT} Benchmark run ${Date.now()}.`
  const result=await tryCOSFirstAnswer({prompt,userId:access.userId,language:'en',privileged:true}), p=result.provenance
  const assertions={retainedRoboticsEvidencePresent:(retained.data??[]).length>0,cosHandledIndependently:result.handled,learnedCorpusConsulted:p.internalSystemsConsulted.includes('Continuous Learning Corpus'),learnedItemsSuppliedToAnswer:p.learnedItemsUsed>0,localReasonerPrimary:p.localModelInvoked&&p.reasonerLabel?.startsWith('independent-local:')===true,externalAiNotInvoked:p.externalAiInvoked===false}
  return NextResponse.json({ok:Object.values(assertions).every(Boolean),prompt,retainedEvidenceCount:(retained.data??[]).length,answer:result.handled?result.reply:null,confidence:result.confidence,reason:result.handled?null:result.reason,provenance:p,assertions})
}
