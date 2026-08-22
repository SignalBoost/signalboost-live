import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { ContinuousLearningDirector, DEFAULT_CONTINUOUS_LEARNING_POLICY } from '@/lib/cos-core/layers/learning'
import { ContinuousLearningCycle } from '@/lib/cos-core/layers/learning/cycle'
import { foundationalKnowledgeGaps, FOUNDATIONAL_KNOWLEDGE_DOMAINS } from '@/lib/cos-core/layers/learning/foundational'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources'
import { cosServiceDb, createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=300

const DEFAULT_BATCH_SIZE=3
const MAX_BATCH_SIZE=5

async function retainedCount(){
  const db=cosServiceDb(); if(!db)return null
  const {count,error}=await db.from('cos_continuous_learning').select('content_hash',{count:'exact',head:true})
  if(error){console.warn('cosLearning: retained count failed',error);return null}
  return count??0
}

export async function GET(){
  const guard=await requireOwner(); if(!guard.ok)return NextResponse.json({error:guard.error},{status:guard.status})
  const adapters=createLiveLearningAdapters()
  return NextResponse.json({ok:true,enabled:process.env.COS_LIVE_SOURCES_ENABLED==='true',domains:FOUNDATIONAL_KNOWLEDGE_DOMAINS.map(d=>({id:d.id,subject:d.subject,questions:d.questions.length})),questions:foundationalKnowledgeGaps().length,sourceAdapters:adapters.map(a=>a.id??a.kind),recommendedBatchSize:DEFAULT_BATCH_SIZE,retainedKnowledge:await retainedCount()})
}

export async function POST(req:NextRequest){
  const guard=await requireOwner(); if(!guard.ok)return NextResponse.json({error:guard.error},{status:guard.status})
  try {
    if(process.env.COS_LIVE_SOURCES_ENABLED!=='true') return NextResponse.json({ok:false,error:'COS_LIVE_SOURCES_ENABLED must be true before foundational acquisition can run.'},{status:409})
    const stores=createSupabaseCOSStores(); if(!stores)return NextResponse.json({ok:false,error:'COS Supabase service store is not configured.'},{status:503})
    const adapters=createLiveLearningAdapters(); if(!adapters.length)return NextResponse.json({ok:false,error:'No approved live learning adapters are configured.'},{status:409})
    const body=await req.json().catch(()=>({})) as {offset?:unknown;limit?:unknown}
    const allGaps=foundationalKnowledgeGaps()
    const offset=Math.max(0,Math.min(allGaps.length,Number.isFinite(Number(body.offset))?Math.floor(Number(body.offset)):0))
    const requestedLimit=Number.isFinite(Number(body.limit))?Math.floor(Number(body.limit)):DEFAULT_BATCH_SIZE
    const limit=Math.max(1,Math.min(MAX_BATCH_SIZE,requestedLimit))
    const batch=allGaps.slice(offset,offset+limit)
    // Keep the foundational route aligned with the shared admission policy. In particular,
    // metadata pointers have a governed 0.60 floor; hard-coding 0.72 here silently made the
    // configured YouTube metadata fallback impossible to retain.
    const director=new ContinuousLearningDirector(stores.continuousLearning,DEFAULT_CONTINUOUS_LEARNING_POLICY)
    const cycle=new ContinuousLearningCycle(director,adapters)
    const result=await cycle.run(batch)
    const nextOffset=offset+batch.length
    return NextResponse.json({ok:true,curriculumQuestions:allGaps.length,sourceAdapters:adapters.map(a=>a.id??a.kind),retainedKnowledge:await retainedCount(),batch:{offset,size:batch.length,nextOffset,done:nextOffset>=allGaps.length},result})
  } catch (error) {
    const message=error instanceof Error?error.message:String(error)
    console.error('cosLearning: foundational run failed',error)
    return NextResponse.json({ok:false,error:message||'Foundational learning run failed.'},{status:500})
  }
}
