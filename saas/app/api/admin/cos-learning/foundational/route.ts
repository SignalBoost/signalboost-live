import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { ContinuousLearningDirector } from '@/lib/cos-core/layers/learning'
import { ContinuousLearningCycle } from '@/lib/cos-core/layers/learning/cycle'
import { foundationalKnowledgeGaps, FOUNDATIONAL_KNOWLEDGE_DOMAINS } from '@/lib/cos-core/layers/learning/foundational'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources'
import { createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=300

export async function GET(){
  const guard=await requireOwner(); if(!guard.ok)return NextResponse.json({error:guard.error},{status:guard.status})
  const adapters=createLiveLearningAdapters()
  return NextResponse.json({ok:true,enabled:process.env.COS_LIVE_SOURCES_ENABLED==='true',domains:FOUNDATIONAL_KNOWLEDGE_DOMAINS.map(d=>({id:d.id,subject:d.subject,questions:d.questions.length})),questions:foundationalKnowledgeGaps().length,sourceAdapters:adapters.map(a=>a.kind)})
}

export async function POST(){
  const guard=await requireOwner(); if(!guard.ok)return NextResponse.json({error:guard.error},{status:guard.status})
  if(process.env.COS_LIVE_SOURCES_ENABLED!=='true') return NextResponse.json({ok:false,error:'COS_LIVE_SOURCES_ENABLED must be true before foundational acquisition can run.'},{status:409})
  const stores=createSupabaseCOSStores(); if(!stores)return NextResponse.json({ok:false,error:'COS Supabase service store is not configured.'},{status:503})
  const adapters=createLiveLearningAdapters(); if(!adapters.length)return NextResponse.json({ok:false,error:'No approved live learning adapters are configured.'},{status:409})
  const director=new ContinuousLearningDirector(stores.continuousLearning,{allowedSourceKinds:new Set(['work_experience','engineering_history','official_documentation','research_paper','scientific_journal','library_material','news_article','public_dataset','video_transcript','approved_public_web']),minimumConfidence:.72,maxCandidatesPerCycle:50,maxExternalCostUsdPerCycle:1})
  const cycle=new ContinuousLearningCycle(director,adapters)
  const result=await cycle.run(foundationalKnowledgeGaps())
  return NextResponse.json({ok:true,curriculumQuestions:foundationalKnowledgeGaps().length,sourceAdapters:adapters.map(a=>a.kind),result})
}
