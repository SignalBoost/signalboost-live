// Compatibility entrypoint with a generic evidence-first gate in front of the durable COS reasoner.
// The gate is task-shaped, not topic-shaped: externally verifiable factual questions search for
// authoritative/primary evidence automatically instead of relying on model memory.

import {
  tryCOSFirstAnswer as tryEnterpriseCOSFirstAnswer,
  type COSFirstAnswerResult,
  type COSEvidenceFunnel,
  type EvidenceFunnelStage,
  type COSProvenance,
} from './cosFirstAnswerEnterprise'
import { classifyCosEvidencePolicy } from './cosEvidencePolicy'
import { researchAuthoritativeEvidence } from './cosAuthoritativeResearch'
import { renderEvidenceGroundedReply, synthesizeAuthoritativeEvidence } from './cosEvidenceSynthesis'
import { writeVolatileAnswerCache } from './cosVolatileAnswerCache'

export type { COSFirstAnswerResult, COSEvidenceFunnel, EvidenceFunnelStage, COSProvenance } from './cosFirstAnswerEnterprise'

const ZERO_STAGE: EvidenceFunnelStage = { retrieved:0, relevant:0, selected:0, injected:0, cited:0 }
const ZERO_FUNNEL: COSEvidenceFunnel = {
  knowledgeGraph:{ ...ZERO_STAGE },
  learnedCorpus:{ ...ZERO_STAGE },
  enterpriseMemory:{ ...ZERO_STAGE },
  userMemory:{ ...ZERO_STAGE },
}

function confidenceFromSources(sources:Array<{authorityTier:string}>):number {
  return sources.some(source => source.authorityTier === 'primary') ? 0.95 : 0.88
}

function verificationFailureReply(language:string|undefined, reason:string):string {
  const code=String(language||'en').toLowerCase()
  const base:Record<string,string>={
    en:'COS could not verify this factual answer from sufficient authoritative evidence, so it will not answer from model memory.',
    es:'COS no pudo verificar esta respuesta factual con evidencia autorizada suficiente, por lo que no responderá desde la memoria del modelo.',
    pt:'O COS não conseguiu verificar esta resposta factual com evidência autorizada suficiente e, por isso, não responderá usando a memória do modelo.',
    pl:'COS nie zdołał zweryfikować tej odpowiedzi na podstawie wystarczających wiarygodnych źródeł, więc nie odpowie z pamięci modelu.',
    ru:'COS не смог подтвердить этот фактический ответ достаточными авторитетными источниками и поэтому не будет отвечать из памяти модели.',
  }
  return `${base[code]||base.en} ${reason}`.trim()
}

function evidenceProvenance(input:{
  model:string|null
  localModelInvoked:boolean
  research:Awaited<ReturnType<typeof researchAuthoritativeEvidence>>
  policy:ReturnType<typeof classifyCosEvidencePolicy>
  synthesisStatus:string
}):COSProvenance & Record<string,unknown> {
  return {
    responseSource:'local_cos_reasoning',
    externalAiInvoked:false,
    localModelInvoked:input.localModelInvoked,
    reasonerLabel:input.model?`independent-local:${input.model}`:null,
    internalSystemsConsulted:['Authoritative External Evidence', ...(input.localModelInvoked?['Local Evidence Synthesizer']:[])],
    knowledgeFactsUsed:0,
    learnedItemsUsed:0,
    enterpriseMemoriesUsed:0,
    userMemoriesUsed:0,
    cognitiveSkillsUsed:0,
    enterpriseMemoryStatus:'not_consulted_evidence_first',
    enterpriseMemoryOrganizationId:null,
    evidenceFunnel:ZERO_FUNNEL,
    cognitiveSkillFunnel:{ ...ZERO_STAGE },
    autonomousResearchAttempted:true,
    researchDocumentsAcquired:input.research.sources.length,
    knowledgeNewlyRetained:0,
    authoritativeEvidence:{
      used:input.research.sources.length>0,
      policyMode:input.policy.mode,
      policyReason:input.policy.reason,
      freshnessRequired:input.policy.freshnessRequired,
      searchQuery:input.research.query,
      retrievedAt:input.research.retrievedAt,
      sufficient:input.research.sufficient,
      minimumCitations:input.research.minimumCitations,
      synthesisStatus:input.synthesisStatus,
      sources:input.research.sources.map(source=>({
        id:source.id,
        title:source.title,
        url:source.url,
        authorityTier:source.authorityTier,
        authorityScore:source.authorityScore,
      })),
    },
  } as COSProvenance & Record<string,unknown>
}

export async function tryCOSFirstAnswer(input:{prompt:string;userId?:string|null;language?:string;privileged?:boolean}):Promise<COSFirstAnswerResult> {
  const policy=classifyCosEvidencePolicy(input.prompt)
  if(policy.mode==='none') return tryEnterpriseCOSFirstAnswer(input)

  const research=await researchAuthoritativeEvidence(input.prompt,policy)
  if(!research.ok||!research.sufficient){
    if(policy.mode==='preferred') return tryEnterpriseCOSFirstAnswer(input)
    const reason=research.error||'Authoritative evidence was unavailable or insufficient.'
    return {
      handled:true,
      reply:verificationFailureReply(input.language,reason),
      confidence:0,
      provenance:evidenceProvenance({model:null,localModelInvoked:false,research,policy,synthesisStatus:'not_run'}),
    }
  }

  const synthesis=await synthesizeAuthoritativeEvidence({
    question:input.prompt,
    sources:research.sources,
    minimumCitations:research.minimumCitations,
  })

  if(synthesis.status==='answered'&&synthesis.answer){
    const reply=renderEvidenceGroundedReply(synthesis.answer,synthesis.sourceIds,research.sources,research.retrievedAt)
    const confidence=confidenceFromSources(research.sources)
    const provenance=evidenceProvenance({model:synthesis.model,localModelInvoked:true,research,policy,synthesisStatus:synthesis.status})

    if(policy.freshnessRequired){
      const cited=new Set(synthesis.sourceIds)
      const liveSources=research.sources.filter(source=>cited.has(source.id)).map(source=>({
        id:source.id,
        title:source.title,
        url:source.url,
        snippet:source.snippet,
      }))
      void writeVolatileAnswerCache({
        prompt:input.prompt,
        language:input.language||'en',
        value:{reply,groundedAt:research.retrievedAt,liveSources,externalProvider:null,externalModel:null},
      })
    }

    return { handled:true, reply, confidence, provenance }
  }

  if(synthesis.status==='conflict'){
    return {
      handled:true,
      reply:verificationFailureReply(input.language,'The retrieved authoritative sources conflict, so COS will not choose a side.'),
      confidence:0,
      provenance:evidenceProvenance({model:synthesis.model,localModelInvoked:true,research,policy,synthesisStatus:synthesis.status}),
    }
  }

  if(policy.mode==='required'){
    const reason=synthesis.error||'The retrieved evidence was insufficient to support a grounded answer.'
    return {
      handled:true,
      reply:verificationFailureReply(input.language,reason),
      confidence:0,
      provenance:evidenceProvenance({model:synthesis.model,localModelInvoked:synthesis.attempted,research,policy,synthesisStatus:synthesis.status}),
    }
  }

  return tryEnterpriseCOSFirstAnswer(input)
}
