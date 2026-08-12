import type { Thinker } from '../execution-contracts.ts'
import type { SupervisorIncident, SerializableValue } from '../incident-schema.ts'
import type { HostContext } from './host-context.ts'
import { executeCosConnectorRecipe, type CosConnectorRecipe } from '../../ai/cos/connectorDelegation.ts'
import { compactDelegatedEvidence } from '../../ai/cos/evidenceCompaction.ts'
import { selectEvidenceFallback } from '../../ai/cos/evidenceFallback.ts'
import { assessDelegatedEvidence } from '../../ai/cos/evidenceSufficiency.ts'
import { selectConnectorRecipe } from '../../ai/cos/incidentRecipeRouter.ts'
import { createInMemoryRecipeReuseStore, incidentRecipeReuseKey, scoreRecipeEvidence, type CosRecipeReuseStore } from '../../ai/cos/recipeReuse.ts'

export interface ConnectorAwareThinkerOptions<TThinker extends Thinker> {
  host: HostContext
  tenantId: string
  thinker: TThinker
  recipe?: CosConnectorRecipe
  recipeReuse?: CosRecipeReuseStore
  /** Minimum connector evidence quality required to keep reusing a learned recipe. Default 0.75. */
  minimumRecipeQuality?: number
}

const defaultRecipeReuse = createInMemoryRecipeReuseStore()

export function createConnectorAwareThinker<TThinker extends Thinker>(options: ConnectorAwareThinkerOptions<TThinker>): TThinker {
  const tenantId = String(options.tenantId ?? '').trim()
  if (!tenantId) throw new Error('createConnectorAwareThinker: tenantId is required')
  const reuse: CosRecipeReuseStore = options.recipeReuse ?? options.host.recipeMemory ?? defaultRecipeReuse
  const minimumRecipeQuality = Math.max(0, Math.min(1, options.minimumRecipeQuality ?? 0.75))

  return new Proxy(options.thinker, {
    get(target, prop, receiver) {
      if (prop !== 'proposeRepairPlan') return Reflect.get(target, prop, receiver)
      return async (incident: SupervisorIncident): Promise<unknown> => {
        const reuseKey = incidentRecipeReuseKey(tenantId, incident)
        const reusedRecipe = options.recipe ? undefined : await reuse.get(reuseKey)
        let selectedRecipe = options.recipe ?? reusedRecipe ?? selectConnectorRecipe(incident)
        const run = (recipe: CosConnectorRecipe) => executeCosConnectorRecipe(options.host.connectors, {
          tenantId, environmentId: incident.environment, portableId: recipe.portableId, traceId: incident.incidentId, recipe,
        })

        let delegated = await run(selectedRecipe)
        let recipeQuality = scoreRecipeEvidence(delegated)
        let recipeReplaced = false

        // A learned routine is provisional: if the environment changed and its evidence quality decays,
        // deterministically re-route once and replace it only when the fresh route is better.
        if (reusedRecipe && recipeQuality < minimumRecipeQuality && !options.recipe) {
          const freshRecipe = selectConnectorRecipe(incident)
          if (freshRecipe.id !== reusedRecipe.id || recipeQuality === 0) {
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
        if (sufficiency.sufficient && recipeQuality >= minimumRecipeQuality) await reuse.set(reuseKey, selectedRecipe)

        const enriched: SupervisorIncident = {
          ...incident,
          metadata: {
            ...incident.metadata,
            connectorEvidenceRecipe: selectedRecipe.id,
            connectorEvidenceRecipeReused: Boolean(reusedRecipe) && !recipeReplaced,
            connectorEvidenceRecipeReplaced: recipeReplaced,
            connectorEvidenceRecipeQuality: recipeQuality,
            connectorEvidenceRecipeMemory: options.host.recipeMemory && reuse === options.host.recipeMemory ? 'buyer-hosted' : 'process-local',
            connectorEvidenceSufficient: sufficiency.sufficient || finalSufficiency.sufficient,
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
