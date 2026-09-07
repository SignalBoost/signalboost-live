// saas/lib/ai/cos/cosFirstAnswer.ts
// Stable COS-first entrypoint. The full established reasoning pipeline is preserved in
// cosFirstAnswerLegacy.ts; this wrapper adds executable visual creation before text reasoning.

import { generateCosCreativeImage } from '@/lib/cos/creative-image'
import { isCosCreativeImageRequest } from './creativeImageIntent.ts'
import { tryCOSFirstAnswer as tryEstablishedCOSFirstAnswer } from './cosFirstAnswerLegacy.ts'

export * from './cosFirstAnswerLegacy.ts'

type COSFirstAnswerInput = Parameters<typeof tryEstablishedCOSFirstAnswer>[0]
type COSFirstAnswerResult = Awaited<ReturnType<typeof tryEstablishedCOSFirstAnswer>>

function emptyStage() {
  return { retrieved: 0, relevant: 0, selected: 0, injected: 0, cited: 0 }
}

function imageGenerationProvenance(args: {
  executed: boolean
  model?: string | null
  imageUrl?: string | null
  error?: string | null
}) {
  return {
    responseSource: args.executed ? 'deterministic' : 'external_fallback_required',
    externalAiInvoked: false as const,
    localModelInvoked: false,
    reasonerLabel: null,
    internalSystemsConsulted: ['COS Creative Image', 'Approved Visual Runtime'],
    knowledgeFactsUsed: 0,
    learnedItemsUsed: 0,
    enterpriseMemoriesUsed: 0,
    userMemoriesUsed: 0,
    cognitiveSkillsUsed: 0,
    enterpriseMemoryStatus: 'not_consulted_visual_creation',
    enterpriseMemoryOrganizationId: null,
    evidenceFunnel: {
      knowledgeGraph: emptyStage(),
      learnedCorpus: emptyStage(),
      enterpriseMemory: emptyStage(),
      userMemory: emptyStage(),
    },
    cognitiveSkillFunnel: emptyStage(),
    knowledgeFactsCited: 0,
    learnedItemsCited: 0,
    enterpriseMemoriesCited: 0,
    userMemoriesCited: 0,
    cognitiveSkillsCited: 0,
    imageGeneration: {
      requested: true,
      executed: args.executed,
      model: args.model ?? null,
      imageUrl: args.imageUrl ?? null,
      error: args.error ?? null,
    },
  }
}

async function tryCosCreativeImage(input: COSFirstAnswerInput): Promise<COSFirstAnswerResult | null> {
  const prompt = String(input.prompt || '').trim()
  if (!isCosCreativeImageRequest(prompt)) return null

  const generated = await generateCosCreativeImage({
    prompt,
    campaignKey: 'cos-primary',
    title: 'COS generated image',
  })

  if (!generated.ok) {
    return {
      handled: false,
      confidence: 0,
      reason: `COS image generation failed: ${generated.error}`,
      provenance: imageGenerationProvenance({ executed: false, error: generated.error }) as any,
    } as COSFirstAnswerResult
  }

  return {
    handled: true,
    reply: `Generated image:\n\n![Generated image](${generated.imageUrl})\n\n[Open generated image](${generated.imageUrl})`,
    confidence: 1,
    provenance: imageGenerationProvenance({
      executed: true,
      model: generated.model,
      imageUrl: generated.imageUrl,
    }) as any,
  } as COSFirstAnswerResult
}

export async function tryCOSFirstAnswer(input: COSFirstAnswerInput): Promise<COSFirstAnswerResult> {
  const imageResult = await tryCosCreativeImage(input)
  if (imageResult) return imageResult
  return tryEstablishedCOSFirstAnswer(input)
}
