import type { CosFreshnessPolicy } from '@/lib/ai/cos/cosFreshnessPolicy'
import { retrieveFreshMemoryEvidence, type FreshMemoryEvidenceSource } from '@/lib/ai/cos/freshMemoryEvidence'
import { researchLiveAuthoritativeEvidence, type LiveAuthoritativeSource } from '@/lib/ai/cos/liveAuthoritativeEvidence'
import { renderGroundedEvidenceReply, synthesizeGroundedEvidence, type GroundingEvidence } from '@/lib/ai/cos/groundedEvidenceSynthesis'

export type FreshnessAnswerSource = 'fresh_memory' | 'live_verification' | 'failed_closed'

export type FreshnessAwareAnswer = {
  ok: boolean
  reply: string
  source: FreshnessAnswerSource
  confidence: number
  localModelInvoked: boolean
  localModel: string | null
  groundedAt: string | null
  sources: GroundingEvidence[]
  sourceIds: string[]
  memoryAttempted: boolean
  memorySufficient: boolean
  memoryReason: string
  liveAttempted: boolean
  liveSufficient: boolean
  liveReason: string | null
  synthesisStatus: string
  error: string | null
}

function memoryToGrounding(source:FreshMemoryEvidenceSource):GroundingEvidence{return{id:source.id,title:source.title||source.host,url:source.url,snippet:source.snippet,observedAt:source.observedAt,authority:source.authority}}
function liveToGrounding(source:LiveAuthoritativeSource):GroundingEvidence{return{id:source.id,title:source.title||source.host,url:source.url,snippet:source.snippet,observedAt:null,authority:source.authorityTier}}
function minimumMemoryCitations(sources:FreshMemoryEvidenceSource[]):number{return sources.some(source=>source.authority==='primary')?1:Math.min(2,Math.max(1,sources.length))}
function minimumLiveCitations(sources:LiveAuthoritativeSource[]):number{return sources.some(source=>source.authorityTier==='primary')?1:Math.min(2,Math.max(1,sources.length))}
function failReply(reason:string):string{return`COS could not verify this freshness-sensitive fact with sufficiently current, sourced evidence. It will not substitute model memory or guess. ${reason}`.trim()}

export async function answerFreshnessSensitiveQuestion(input:{
  question:string
  policy:CosFreshnessPolicy
  nowMs?:number
}):Promise<FreshnessAwareAnswer>{
  const nowMs=input.nowMs??Date.now()
  const memory=await retrieveFreshMemoryEvidence(input.question,input.policy,nowMs)

  if(memory.sufficient&&memory.sources.length){
    const evidence=memory.sources.map(memoryToGrounding)
    const synthesis=await synthesizeGroundedEvidence({question:input.question,sources:evidence,minimumCitations:minimumMemoryCitations(memory.sources)})
    if(synthesis.status==='answered'&&synthesis.answer){
      const groundedAt=new Date(nowMs).toISOString()
      return{
        ok:true,
        reply:renderGroundedEvidenceReply({answer:synthesis.answer,sourceIds:synthesis.sourceIds,sources:evidence,groundedAt,fromMemory:true}),
        source:'fresh_memory',confidence:0.9,localModelInvoked:true,localModel:synthesis.model,groundedAt,sources:evidence,sourceIds:synthesis.sourceIds,
        memoryAttempted:true,memorySufficient:true,memoryReason:memory.reason,
        liveAttempted:false,liveSufficient:false,liveReason:null,synthesisStatus:synthesis.status,error:null,
      }
    }
    // Conflicting or insufficient remembered evidence is a reason to check the world now, not to
    // let pretrained model knowledge break the tie.
  }

  const live=await researchLiveAuthoritativeEvidence(input.question,new Date(nowMs))
  if(!live.sufficient||!live.sources.length){
    const reason=live.reason||'live authoritative evidence was unavailable'
    return{
      ok:false,reply:failReply(reason),source:'failed_closed',confidence:0,localModelInvoked:false,localModel:null,groundedAt:live.retrievedAt||null,sources:live.sources.map(liveToGrounding),sourceIds:[],
      memoryAttempted:memory.attempted,memorySufficient:memory.sufficient,memoryReason:memory.reason,
      liveAttempted:true,liveSufficient:false,liveReason:reason,synthesisStatus:'not_run',error:reason,
    }
  }

  const evidence=live.sources.map(liveToGrounding)
  const synthesis=await synthesizeGroundedEvidence({question:input.question,sources:evidence,minimumCitations:minimumLiveCitations(live.sources)})
  if(synthesis.status==='answered'&&synthesis.answer){
    return{
      ok:true,
      reply:renderGroundedEvidenceReply({answer:synthesis.answer,sourceIds:synthesis.sourceIds,sources:evidence,groundedAt:live.retrievedAt,fromMemory:false}),
      source:'live_verification',confidence:live.sources.some(source=>source.authorityTier==='primary')?0.97:0.9,localModelInvoked:true,localModel:synthesis.model,groundedAt:live.retrievedAt,sources:evidence,sourceIds:synthesis.sourceIds,
      memoryAttempted:memory.attempted,memorySufficient:memory.sufficient,memoryReason:memory.reason,
      liveAttempted:true,liveSufficient:true,liveReason:live.reason,synthesisStatus:synthesis.status,error:null,
    }
  }

  const reason=synthesis.status==='conflict'?'live authoritative sources conflict':synthesis.error||'live evidence did not establish the requested fact'
  return{
    ok:false,reply:failReply(reason),source:'failed_closed',confidence:0,localModelInvoked:synthesis.invoked,localModel:synthesis.model||null,groundedAt:live.retrievedAt,sources:evidence,sourceIds:synthesis.sourceIds,
    memoryAttempted:memory.attempted,memorySufficient:memory.sufficient,memoryReason:memory.reason,
    liveAttempted:true,liveSufficient:true,liveReason:live.reason,synthesisStatus:synthesis.status,error:reason,
  }
}
