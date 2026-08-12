import type { Thinker } from '../execution-contracts.ts'
import type { SupervisorIncident, SerializableValue } from '../incident-schema.ts'
import type { HostContext } from './host-context.ts'
import { executeCosConnectorRecipe, type CosConnectorRecipe } from '../../ai/cos/connectorDelegation.ts'
import { compactDelegatedEvidence } from '../../ai/cos/evidenceCompaction.ts'
import { selectConnectorRecipe } from '../../ai/cos/incidentRecipeRouter.ts'

export interface ConnectorAwareThinkerOptions<TThinker extends Thinker> {
  host: HostContext
  tenantId: string
  thinker: TThinker
  /** Fixed recipe override; when omitted, a deterministic incident router selects the recipe. */
  recipe?: CosConnectorRecipe
}

/**
 * Production bridge between the buyer-owned Connector Runtime and COS/Supervisor reasoning.
 * Routine read-only evidence is gathered deterministically, compacted, and attached to the
 * incident metadata before the underlying thinker runs. The thinker still owns diagnosis and
 * planning; write/consequential execution remains on the existing governed dispatch path.
 */
export function createConnectorAwareThinker<TThinker extends Thinker>(options: ConnectorAwareThinkerOptions<TThinker>): TThinker {
  const tenantId = String(options.tenantId ?? '').trim()
  if (!tenantId) throw new Error('createConnectorAwareThinker: tenantId is required')

  return new Proxy(options.thinker, {
    get(target, prop, receiver) {
      if (prop !== 'proposeRepairPlan') return Reflect.get(target, prop, receiver)
      return async (incident: SupervisorIncident): Promise<unknown> => {
        const selectedRecipe = options.recipe ?? selectConnectorRecipe(incident)
        const delegated = await executeCosConnectorRecipe(options.host.connectors, {
          tenantId,
          environmentId: incident.environment,
          portableId: selectedRecipe.portableId,
          traceId: incident.incidentId,
          recipe: selectedRecipe,
        })
        const packet = compactDelegatedEvidence(delegated)
        const enriched: SupervisorIncident = {
          ...incident,
          metadata: {
            ...incident.metadata,
            connectorEvidenceRecipe: selectedRecipe.id,
            connectorEvidence: packet as unknown as SerializableValue,
          },
        }
        return target.proposeRepairPlan(enriched)
      }
    },
  }) as TThinker
}
