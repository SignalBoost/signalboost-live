import type { Thinker } from '../execution-contracts.ts'
import type { SupervisorIncident, SerializableValue } from '../incident-schema.ts'
import type { HostContext } from './host-context.ts'
import {
  executeCosConnectorRecipe,
  SELF_HEALING_DIAGNOSTIC_RECIPE,
  type CosConnectorRecipe,
} from '../../ai/cos/connectorDelegation.ts'
import { compactDelegatedEvidence } from '../../ai/cos/evidenceCompaction.ts'

export interface ConnectorAwareThinkerOptions {
  host: HostContext
  tenantId: string
  thinker: Thinker
  recipe?: CosConnectorRecipe
}

/**
 * Production bridge between the buyer-owned Connector Runtime and COS/Supervisor reasoning.
 * Routine read-only evidence is gathered deterministically, compacted, and attached to the
 * incident metadata before the underlying thinker runs. The thinker still owns diagnosis and
 * planning; write/consequential execution remains on the existing governed dispatch path.
 */
export function createConnectorAwareThinker(options: ConnectorAwareThinkerOptions): Thinker {
  const tenantId = String(options.tenantId ?? '').trim()
  if (!tenantId) throw new Error('createConnectorAwareThinker: tenantId is required')
  const recipe = options.recipe ?? SELF_HEALING_DIAGNOSTIC_RECIPE

  return {
    async proposeRepairPlan(incident: SupervisorIncident): Promise<unknown> {
      const delegated = await executeCosConnectorRecipe(options.host.connectors, {
        tenantId,
        environmentId: incident.environment,
        portableId: recipe.portableId,
        traceId: incident.incidentId,
        recipe,
      })
      const packet = compactDelegatedEvidence(delegated)
      const enriched: SupervisorIncident = {
        ...incident,
        metadata: {
          ...incident.metadata,
          connectorEvidence: packet as unknown as SerializableValue,
        },
      }
      return options.thinker.proposeRepairPlan(enriched)
    },
  }
}
