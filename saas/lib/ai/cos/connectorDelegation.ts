import type {
  PortableCapabilityManifest,
  PortableConnectorExecutionResult,
} from '../../../provider-hub-core/index.ts'
import type { PortableConnectorRuntimePort } from '../../supervisor/portable/host-context.ts'

export interface CosConnectorRecipeStep {
  capabilityId: string
  args?: Readonly<Record<string, unknown>>
  optional?: boolean
}

export interface CosConnectorRecipe {
  id: string
  portableId: string
  requiredCapabilities: readonly string[]
  optionalCapabilities?: readonly string[]
  steps: readonly CosConnectorRecipeStep[]
}

export interface CosDelegationRequest {
  tenantId: string
  environmentId: string
  portableId: string
  traceId?: string
  recipe: CosConnectorRecipe
}

export interface CosDelegatedEvidence {
  capabilityId: string
  result: PortableConnectorExecutionResult
}

export interface CosDelegationResult {
  ok: boolean
  mode: 'delegated' | 'capability_unavailable' | 'runtime_unavailable'
  evidence: readonly CosDelegatedEvidence[]
  missingRequired: readonly string[]
}

function manifestFor(recipe: CosConnectorRecipe): PortableCapabilityManifest {
  const optional = new Set(recipe.optionalCapabilities ?? [])
  const capabilityIds = [...new Set([...recipe.requiredCapabilities, ...(recipe.optionalCapabilities ?? [])])]
  return Object.freeze({
    portableId: recipe.portableId,
    manifestVersion: recipe.id,
    requirements: Object.freeze(capabilityIds.map(capabilityId => Object.freeze({
      capabilityId,
      required: !optional.has(capabilityId),
      allowedRisk: 'read' as const,
    }))),
  })
}

/**
 * Runs routine evidence gathering without asking COS to reason between every tool call.
 * The runtime still owns tenant isolation, connector selection, permissions, provenance
 * and audit. This layer only batches a known-safe read-only operational recipe.
 */
export async function executeCosConnectorRecipe(
  runtime: PortableConnectorRuntimePort | undefined,
  request: CosDelegationRequest,
): Promise<CosDelegationResult> {
  if (!runtime) {
    return Object.freeze({ ok: false, mode: 'runtime_unavailable', evidence: Object.freeze([]), missingRequired: Object.freeze([...request.recipe.requiredCapabilities]) })
  }
  if (request.portableId !== request.recipe.portableId) throw new Error('portableId does not match recipe')

  const manifest = manifestFor(request.recipe)
  const discovery = await runtime.discover({ tenantId: request.tenantId, environmentId: request.environmentId, manifest })
  if (discovery.resolution.missing.length) {
    return Object.freeze({ ok: false, mode: 'capability_unavailable', evidence: Object.freeze([]), missingRequired: Object.freeze([...discovery.resolution.missing]) })
  }

  const evidence: CosDelegatedEvidence[] = []
  for (const step of request.recipe.steps) {
    const descriptor = discovery.resolution.resolved[step.capabilityId]
    if (!descriptor) {
      if (step.optional) continue
      return Object.freeze({ ok: false, mode: 'capability_unavailable', evidence: Object.freeze(evidence), missingRequired: Object.freeze([step.capabilityId]) })
    }
    if (descriptor.risk !== 'read') continue

    const result = await runtime.invoke({
      manifest,
      invocation: {
        tenantId: request.tenantId,
        environmentId: request.environmentId,
        portableId: request.portableId,
        capabilityId: step.capabilityId,
        args: step.args ?? {},
        traceId: request.traceId,
      },
    })
    evidence.push(Object.freeze({ capabilityId: step.capabilityId, result }))
  }

  return Object.freeze({ ok: true, mode: 'delegated', evidence: Object.freeze(evidence), missingRequired: Object.freeze([]) })
}

export const SELF_HEALING_DIAGNOSTIC_RECIPE: CosConnectorRecipe = Object.freeze({
  id: 'self-healing.diagnose.v1',
  portableId: 'self-healing-supervisor',
  requiredCapabilities: Object.freeze(['deployment.read', 'logs.search']),
  optionalCapabilities: Object.freeze(['metrics.query', 'incident.read', 'recent_changes.read', 'health.read']),
  steps: Object.freeze([
    { capabilityId: 'deployment.read' },
    { capabilityId: 'logs.search' },
    { capabilityId: 'metrics.query', optional: true },
    { capabilityId: 'incident.read', optional: true },
    { capabilityId: 'recent_changes.read', optional: true },
    { capabilityId: 'health.read', optional: true },
  ]),
})
