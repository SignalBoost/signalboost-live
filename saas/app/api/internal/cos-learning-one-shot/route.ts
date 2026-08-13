import { NextRequest, NextResponse } from 'next/server'
import { ContinuousLearningDirector } from '@/lib/cos-core/layers/learning'
import { ContinuousLearningCycle } from '@/lib/cos-core/layers/learning/cycle'
import { foundationalKnowledgeGaps } from '@/lib/cos-core/layers/learning/foundational'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources'
import { cosServiceDb, createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'
import { extractFactsFromDocument, resolveExtractionBatch, toKnowledgeFact, type ExtractionSourceDocument } from '@/lib/ai/cos/knowledgeFactExtraction'
import { persistKnowledgeFactWithEmbedding } from '@/lib/ai/cos/knowledgeFactSemantic'
import { resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=300

const TOKEN='q0UF6q0xIOKL3zh5TLZS_Hpc_zAIz8RtD4ARwLKhXNs'
const EXPIRES_AT=Date.parse('2026-08-13T04:30:00Z')

function authorized(req:NextRequest){
  return Date.now() < EXPIRES_AT && req.nextUrl.searchParams.get('token') === TOKEN
}

async function corpusState(){
  const db=cosServiceDb(); if(!db)return null
  const [corpus,facts]=await Promise.all([
    db.from('cos_continuous_learning').select('source_uri',{count:'exact',head:true}),
    db.from('cos_knowledge_facts').select('id',{count:'exact',head:true}),
  ])
  return {studiedDocuments:corpus.error?null:corpus.count??0,knownFacts:facts.error?null:facts.count??0}
}

async function runFoundational(req:NextRequest){
  if(process.env.COS_LIVE_SOURCES_ENABLED!=='true')return NextResponse.json({ok:false,error:'COS_LIVE_SOURCES_ENABLED must be true.'},{status:409})
  const stores=createSupabaseCOSStores(); if(!stores)return NextResponse.json({ok:false,error:'COS Supabase service store is not configured.'},{status:503})
  const adapters=createLiveLearningAdapters(); if(!adapters.length)return NextResponse.json({ok:false,error:'No live learning adapters configured.'},{status:409})
  const all=foundationalKnowledgeGaps()
  const offset=Math.max(0,Math.min(all.length,Number(req.nextUrl.searchParams.get('offset')||0)))
  const limit=Math.max(1,Math.min(5,Number(req.nextUrl.searchParams.get('limit')||3)))
  const batch=all.slice(offset,offset+limit)
  const director=new ContinuousLearningDirector(stores.continuousLearning,{allowedSourceKinds:new Set(['work_experience','engineering_history','official_documentation','research_paper','scientific_journal','library_material','news_article','public_dataset','video_transcript','approved_public_web']),minimumConfidence:.72,maxCandidatesPerCycle:50,maxExternalCostUsdPerCycle:1})
  const cycle=new ContinuousLearningCycle(director,adapters)
  const result=await cycle.run(batch)
  return NextResponse.json({ok:true,phase:'foundational',batch:{offset,size:batch.length,nextOffset:offset+batch.length,done:offset+batch.length>=all.length},result,corpus:await corpusState()})
}

async function runExtract(req:NextRequest){
  const reasoner=resolveCosReasoner(); if(!reasoner.config)return NextResponse.json({ok:false,error:(reasoner as {reason:string}).reason},{status:409})
  const db=cosServiceDb(); const stores=createSupabaseCOSStores(); if(!db||!stores)return NextResponse.json({ok:false,error:'COS Supabase service store is not configured.'},{status:503})
  const limit=Math.max(1,Math.min(15,Number(req.nextUrl.searchParams.get('limit')||15)))
  const corpus=await db.from('cos_continuous_learning').select('content_hash,subject,summary,source_uri,source_title,confidence').order('confidence',{ascending:false}).limit(200)
  if(corpus.error)throw corpus.error
  const extracted=await db.from('cos_knowledge_facts').select('source'); if(extracted.error)throw extracted.error
  const documents:ExtractionSourceDocument[]=(corpus.data??[]).map(row=>({contentHash:String(row.content_hash),subject:String(row.subject??''),summary:String(row.summary??''),sourceUri:String(row.source_uri??''),sourceTitle:row.source_title?String(row.source_title):null,confidence:Number(row.confidence??0)}))
  const already=new Set((extracted.data??[]).map(row=>String(row.source)))
  const batch=resolveExtractionBatch(documents,already,limit,false)
  let factsWritten=0,proposed=0,rejectedUngrounded=0,rejectedMalformed=0
  const perDocument=[]
  for(const document of batch){
    const result=await extractFactsFromDocument(document)
    proposed+=result.proposed; rejectedUngrounded+=result.rejectedUngrounded; rejectedMalformed+=result.rejectedMalformed
    for(const triple of result.grounded){await persistKnowledgeFactWithEmbedding(stores.knowledge,toKnowledgeFact(triple,document.sourceUri));factsWritten++}
    perDocument.push({sourceUri:document.sourceUri,sourceTitle:document.sourceTitle,proposed:result.proposed,stored:result.grounded.length,rejectedUngrounded:result.rejectedUngrounded,rejectedMalformed:result.rejectedMalformed,error:result.error??null})
  }
  return NextResponse.json({ok:true,phase:'extract',reasoner:reasoner.config.label,documentsProcessed:batch.length,documentsRemaining:Math.max(0,documents.filter(d=>!already.has(d.sourceUri)).length-batch.length),proposed,factsWritten,rejectedUngrounded,rejectedMalformed,perDocument,corpus:await corpusState()})
}

export async function GET(req:NextRequest){
  if(!authorized(req))return NextResponse.json({error:'gone'},{status:410})
  try{
    const phase=req.nextUrl.searchParams.get('phase')
    if(phase==='foundational')return await runFoundational(req)
    if(phase==='extract')return await runExtract(req)
    return NextResponse.json({ok:true,expiresAt:new Date(EXPIRES_AT).toISOString(),corpus:await corpusState()})
  }catch(error){
    const message=error instanceof Error?error.message:String(error)
    console.error('cosLearningOneShot failed',error)
    return NextResponse.json({ok:false,error:message},{status:500})
  }
}
