import type { Thinker } from '../execution-contracts.ts'
import type { SupervisorIncident, SerializableValue } from '../incident-schema.ts'
import type { HostContext } from './host-context.ts'
import { executeCosConnectorRecipe, type CosConnectorRecipe } from '../../ai/cos/connectorDelegation.ts'
import { compactDelegatedEvidence } from '../../ai/cos/evidenceCompaction.ts'
import { selectEvidenceFallback } from '../../ai/cos/evidenceFallback.ts'
import { assessDelegatedEvidence } from '../../ai/cos/evidenceSufficiency.ts'
import { selectConnectorRecipe } from '../../ai/cos/incidentRecipeRouter.ts'
import { createInMemoryRecipeReuseStore, incidentRecipeReuseKey, type CosRecipeReuseStore } from '../../ai/cos/recipeReuse.ts'

export interface ConnectorAwareThinkerOptions<TThinker extends Thinker> {
  host: HostContext
  tenantId: string
  thinker: TThinker
  recipe?: CosConnectorRecipe
  recipeReuse?: CosRecipeReuseStore
}

const defaultRecipeReuse = createInMemoryRecipeReuseStore()

export function createConnectorAwareThinker<TThinker extends Thinker>(options: ConnectorAwareThinkerOptions<TThinker>): TThinker {
  const tenantId = String(options.tenantId ?? '').trim()
  if (!tenantId) throw new Error('createConnectorAwareThinker: tenantId is required')
  const reuse = options.recipeReuse ?? defaultRecipeReuse

  return new Proxy(options.thinker, {
    get(target, prop, receiver) {
      if (prop !== 'proposeRepairPlan') return Reflect.get(target, prop, receiver)
      return async (incident: SupervisorIncident): Promise<unknown> => {
        const reuseKey = incidentRecipeReuseKey(tenantId, incident)
        const reusedRecipe = options.recipe ? undefined : reuse.get(reuseKey)
        const selectedRecipe = options.recipe ?? reusedRecipe ?? selectConnectorRecipe(incident)
        const run = (recipe: CosConnectorRecipe) => executeCosConnectorRecipe(options.host.connectors, {
          tenantId, environmentId: incident.environment, portableId: recipe.portableId, traceId: incident.incidentId, recipe,
        })
        const delegated = await run(selectedRecipe)
        const sufficiency = assessDelegatedEvidence(delegated)
        const fallbackRecipe = sufficiency.sufficient ? null : selectEvidenceFallback(selectedRecipe, sufficiency.failedCapabilities)
        const fallback = fallbackRecipe ? await run(fallbackRecipe) : null
        const finalSufficiency = fallback ? assessDelegatedEvidence(fallback) : sufficiency
        if (sufficiency.sufficient) reuse.set(reuseKey, selectedRecipe)
        const enriched: SupervisorIncident = {
          ...incident,
          metadata: {
            ...incident.metadata,
            connectorEvidenceRecipe: selectedRecipe.id,
            connectorEvidenceRecipeReused: Boolean(reusedRecipe),
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
