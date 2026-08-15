// Stable COS entrypoint. Ordinary reasoning delegates to the enterprise implementation.
// Freshness-sensitive questions follow the informed-human path instead:
// short-TTL cache -> sufficiently recent sourced memory -> live authoritative verification ->
// local evidence-only synthesis. External model memory is never a factual authority here.

import {
  tryCOSFirstAnswer as tryEnterpriseCOSFirstAnswer,
  type COSFirstAnswerResult,
  type COSProvenance,
  type COSEvidenceFunnel,
  type EvidenceFunnelStage,
} from './cosFirstAnswerEnterprise'
import { freshnessPolicyForQuestion } from './cosFreshnessPolicy'
import { answerFreshnessSensitiveQuestion } from './freshnessAwareAnswer'
import {
  COS_VOLATILE_CACHE_POLICY_VERSION,
  readVolatileAnswerCache,
  writeVolatileAnswerCache,
} from './cosVolatileAnswerCache'

export type { COSFirstAnswerResult, COSProvenance, COSEvidenceFunnel, EvidenceFunnelStage } from './cosFirstAnswerEnterprise'

const ZERO_STAGE: EvidenceFunnelStage = { retrieved:0, relevant:0, selected:0, injected:0, cited:0 }
const ZERO_FUNNEL: COSEvidenceFunnel = {
  knowledgeGraph:{ ...ZERO_STAGE },
  learnedCorpus:{ ...ZERO_STAGE },
  enterpriseMemory:{ ...ZERO_STAGE },
  userMemory:{ ...ZERO_STAGE },
}

function freshnessProvenance(input:{
  localModelInvoked:boolean
  localModel:string|null
  cacheHit?:{ storedAt:string; groundedAt:string; ageMs:number; expiresAt:number|null; urls:string[] }|null
  answer?:Awaited<ReturnType<typeof answerFreshnessSensitiveQuestion>>|null
  policy:ReturnType<typeof freshnessPolicyForQuestion>
}):COSProvenance & Record<string,unknown>{
  const answer=input.answer??null
  const fromCache=Boolean(input.cacheHit)
  return {
    responseSource:fromCache?'semantic_cache':'local_cos_reasoning',
    externalAiInvoked:false,
    localModelInvoked:input.localModelInvoked,
    reasonerLabel:input.localModel?`independent-local:${input.localModel}`:null,
    internalSystemsConsulted:[
      ...(fromCache?['Freshness Answer Cache']:[]),
      ...(answer?.memoryAttempted?['Recent Sourced Memory']:[]),
      ...(answer?.liveAttempted?['Live Authoritative Verification']:[]),
      ...(input.localModelInvoked?['Local Evidence Synthesizer']:[]),
    ],
    knowledgeFactsUsed:0,
    learnedItemsUsed:0,
    enterpriseMemoriesUsed:0,
    userMemoriesUsed:0,
    cognitiveSkillsUsed:0,
    enterpriseMemoryStatus:'not_consulted_freshness_path',
    enterpriseMemoryOrganizationId:null,
    evidenceFunnel:ZERO_FUNNEL,
    cognitiveSkillFunnel:{ ...ZERO_STAGE },
    ...(fromCache?{
      cacheOrigin:{
        storedAt:input.cacheHit!.storedAt,
        policyVersion:COS_VOLATILE_CACHE_POLICY_VERSION,
        retrievedThisTurn:{facts:0,learned:0,enterprise:0,memories:0,skills:0},
        originEvidenceFunnel:ZERO_FUNNEL,
        originCognitiveSkillFunnel:{ ...ZERO_STAGE },
      },
    }:{}),
    autonomousResearchAttempted:Boolean(answer?.liveAttempted),
    researchDocumentsAcquired:answer?.liveSources.length??0,
    knowledgeNewlyRetained:0,
    freshnessAwareness:{
      required:input.policy.required,
      reason:input.policy.reason,
      maxMemoryAgeMs:input.policy.maxMemoryAgeMs,
      forceLiveVerification:input.policy.forceLiveVerification,
      cacheHit:fromCache,
      cacheAgeMs:input.cacheHit?.ageMs??null,
      cacheExpiresAt:input.cacheHit?.expiresAt==null?null:new Date(input.cacheHit.expiresAt).toISOString(),
      cacheOriginGroundedAt:input.cacheHit?.groundedAt??null,
      source:fromCache?'cache':answer?.source??null,
      memoryAttempted:answer?.memoryAttempted??false,
      memorySufficient:answer?.memorySufficient??false,
      memoryReason:answer?.memoryReason??null,
      memorySources:answer?.memorySources.map(source=>({id:source.id,title:source.title,url:source.url,observedAt:source.observedAt??null,authority:source.authority??null}))??[],
      liveAttempted:answer?.liveAttempted??false,
      liveSufficient:answer?.liveSufficient??false,
      liveReason:answer?.liveReason??null,
      liveSources:answer?.liveSources.map(source=>({id:source.id,title:source.title,url:source.url,authority:source.authority??null}))??[],
      groundedAt:answer?.groundedAt??input.cacheHit?.groundedAt??null,
      synthesisStatus:answer?.synthesisStatus??(fromCache?'cache_reuse':'not_run'),
      failedClosed:answer ? !answer.ok : false,
    },
  } as COSProvenance & Record<string,unknown>
}

export async function tryCOSFirstAnswer(input:{prompt:string;userId?:string|null;language?:string;privileged?:boolean}):Promise<COSFirstAnswerResult>{
  const policy=freshnessPolicyForQuestion(input.prompt)
  if(!policy.required)return tryEnterpriseCOSFirstAnswer(input)

  // Explicit "verify/check the source" requests deliberately bypass remembered/cache answers.
  if(!policy.forceLiveVerification){
    const cached=await readVolatileAnswerCache({prompt:input.prompt,language:input.language||'en'})
    if(cached){
      const provenance=freshnessProvenance({
        localModelInvoked:false,
        localModel:null,
        policy,
        cacheHit:{
          storedAt:new Date(cached.createdAt).toISOString(),
          groundedAt:cached.value.groundedAt,
          ageMs:cached.ageMs,
          expiresAt:cached.expiresAt,
          urls:cached.value.liveSources.map(source=>source.url),
        },
      })
      return { handled:true, reply:cached.value.reply, confidence:0.95, provenance }
    }
  }

  const answer=await answerFreshnessSensitiveQuestion({question:input.prompt,policy})
  const provenance=freshnessProvenance({
    localModelInvoked:answer.localModelInvoked,
    localModel:answer.localModel,
    answer,
    policy,
    cacheHit:null,
  })

  if(answer.ok&&answer.groundedAt){
    const cited=new Set(answer.sourceIds)
    const sources=answer.sources.filter(source=>cited.has(source.id)).map(source=>({
      id:source.id,
      title:source.title,
      url:source.url,
      snippet:source.snippet,
    }))
    void writeVolatileAnswerCache({
      prompt:input.prompt,
      language:input.language||'en',
      value:{
        reply:answer.reply,
        groundedAt:answer.groundedAt,
        liveSources:sources,
        externalProvider:null,
        externalModel:null,
      },
    })
  }

  // A failed freshness verification is still "handled": COS deliberately refuses to guess,
  // preventing the API route from escalating the factual answer to Gemini/model memory.
  return { handled:true, reply:answer.reply, confidence:answer.confidence, provenance }
}
