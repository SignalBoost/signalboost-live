import type { Thinker } from '../execution-contracts.ts'
import type { SupervisorIncident, SerializableValue } from '../incident-schema.ts'
import type { HostContext } from './host-context.ts'
import { executeCosConnectorRecipe, type CosConnectorRecipe } from '../../ai/cos/connectorDelegation.ts'
import { compactDelegatedEvidence } from '../../ai/cos/evidenceCompaction.ts'
import { selectEvidenceFallback } from '../../ai/cos/evidenceFallback.ts'
import { assessDelegatedEvidence } from '../../ai/cos/evidenceSufficiency.ts'
import { selectConnectorRecipe } from '../../ai/cos/incidentRecipeRouter.ts'
import { createInMemoryRecipeReuseStore, incidentRecipeReuseKey, scoreRecipeEvidence, type CosRecipeReuseStore } from '../../ai/cos/recipeReuse.ts'
import { createInMemoryRecipeConfidenceStore, isRecipeCoolingDown, updateRecipeConfidence, type CosRecipeConfidenceStore, type RecipeConfidencePolicy } from '../../ai/cos/recipeConfidence.ts'
import { selectLiveRecipe } from '../../ai/cos/liveRecipeSelection.ts'
import type { RecipeOptimizationWeights } from '../../ai/cos/recipeOptimization.ts'

export interface ConnectorAwareThinkerOptions<TThinker extends Thinker> {
  host: HostContext
  tenantId: string
  thinker: TThinker
  recipe?: CosConnectorRecipe
  recipeReuse?: CosRecipeReuseStore
  recipeConfidence?: CosRecipeConfidenceStore
  minimumRecipeQuality?: number
  confidencePolicy?: RecipeConfidencePolicy
  optimizationWeights?: RecipeOptimizationWeights
}

const defaultRecipeReuse = createInMemoryRecipeReuseStore()
const defaultRecipeConfidence = createInMemoryRecipeConfidenceStore()

export function createConnectorAwareThinker<TThinker extends Thinker>(options: ConnectorAwareThinkerOptions<TThinker>): TThinker {
  const tenantId = String(options.tenantId ?? '').trim()
  if (!tenantId) throw new Error('createConnectorAwareThinker: tenantId is required')
  const reuse: CosRecipeReuseStore = options.recipeReuse ?? options.host.recipeMemory ?? defaultRecipeReuse
  const confidence: CosRecipeConfidenceStore = options.recipeConfidence ?? options.host.recipeConfidence ?? defaultRecipeConfidence
  const minimumRecipeQuality = Math.max(0, Math.min(1, options.minimumRecipeQuality ?? 0.75))

  return new Proxy(options.thinker, {
    get(target, prop, receiver) {
      if (prop !== 'proposeRepairPlan') return Reflect.get(target, prop, receiver)
      return async (incident: SupervisorIncident): Promise<unknown> => {
        const reuseKey = incidentRecipeReuseKey(tenantId, incident)
        const priorConfidence = await confidence.get(reuseKey)
        const coolingDown = isRecipeCoolingDown(priorConfidence, options.confidencePolicy?.now?.() ?? Date.now())
        const learnedRecipe = options.recipe ? undefined : await reuse.get(reuseKey)
        const deterministicRecipe = selectConnectorRecipe(incident)
        const optimized = options.recipe
          ? { recipe: options.recipe, source: 'deterministic' as const, optimizationScore: 0 }
          : selectLiveRecipe(learnedRecipe, deterministicRecipe, priorConfidence, minimumRecipeQuality, coolingDown, options.optimizationWeights)
        let selectedRecipe = optimized.recipe
        const learnedSelected = optimized.source === 'learned'
        const run = (recipe: CosConnectorRecipe) => executeCosConnectorRecipe(options.host.connectors, {
          tenantId, environmentId: incident.environment, portableId: recipe.portableId, traceId: incident.incidentId, recipe,
        })

        let delegated = await run(selectedRecipe)
        let recipeQuality = scoreRecipeEvidence(delegated)
        let recipeReplaced = false

        if (learnedSelected && recipeQuality < minimumRecipeQuality && !options.recipe) {
          const freshRecipe = deterministicRecipe
          if (freshRecipe.id !== selectedRecipe.id || recipeQuality === 0) {
            const freshDelegated = await run(freshRecipe)
            const freshQuality = scoreRecipeEvidence(freshDelegated)
            if (freshQuality > recipeQuality) {
              selectedRecipe = freshRecipe
              delegated = freshDelegated
              recipeQuality = freshQuality
              recipeReplaced = true
              await reuse.set(reuseKey, freshRecipe)
            }
          }
        }

        const sufficiency = assessDelegatedEvidence(delegated)
        const fallbackRecipe = sufficiency.sufficient ? null : selectEvidenceFallback(selectedRecipe, sufficiency.failedCapabilities)
        const fallback = fallbackRecipe ? await run(fallbackRecipe) : null
        const finalSufficiency = fallback ? assessDelegatedEvidence(fallback) : sufficiency
        const usable = sufficiency.sufficient || finalSufficiency.sufficient
        const nextConfidence = updateRecipeConfidence(priorConfidence, recipeQuality, usable, options.confidencePolicy)
        await confidence.set(reuseKey, nextConfidence)

        if (sufficiency.sufficient && recipeQuality >= minimumRecipeQuality) await reuse.set(reuseKey, selectedRecipe)

        const enriched: SupervisorIncident = {
          ...incident,
          metadata: {
            ...incident.metadata,
            connectorEvidenceRecipe: selectedRecipe.id,
            connectorEvidenceRecipeReused: learnedSelected && !recipeReplaced,
            connectorEvidenceRecipeReplaced: recipeReplaced,
            connectorEvidenceRecipeQuality: recipeQuality,
            connectorEvidenceRecipePromoted: nextConfidence.promoted,
            connectorEvidenceRecipeSuccesses: nextConfidence.successes,
            connectorEvidenceRecipeFailures: nextConfidence.failures,
            connectorEvidenceRecipeCooldownUntil: nextConfidence.cooldownUntil ?? null,
            connectorEvidenceRecipeCoolingDown: coolingDown,
            connectorEvidenceRecipeOptimizationSource: optimized.source,
            connectorEvidenceRecipeOptimizationScore: optimized.optimizationScore,
            connectorEvidenceRecipeMemory: options.host.recipeMemory && reuse === options.host.recipeMemory ? 'buyer-hosted' : 'process-local',
            connectorEvidenceSufficient: usable,
            connectorEvidenceSuccessful: sufficiency.successful + (fallback ? finalSufficiency.successful : 0),
            connectorEvidenceAttempted: sufficiency.attempted + (fallback ? finalSufficiency.attempted : 0),
            connectorEvidenceFailedCapabilities: sufficiency.failedCapabilities as unknown as SerializableValue,
            connectorEvidence: compactDelegatedEvidence(delegated) as unknown as SerializableValue,
            connectorEvidenceFallbackRecipe: fallbackRecipe?.id ?? null,
            connectorEvidenceFallback: fallback ? compactDelegatedEvidence(fallback) as unknown as SerializableValue : null,
          },
        }
        return target.proposeRepairPlan(enriched)
      }
    },
  }) as TThinker
}
