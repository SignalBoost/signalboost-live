import { validateDynamicWorkflowDefinition, type DynamicWorkflowDefinition } from './dynamicWorkflowDefinition.ts'

/**
 * Canonical persisted-workflow contract. The historical taskLifecycle.ts shape
 * is supported as an explicit, fail-closed migration input, not a second runtime.
 */
export { validateDynamicWorkflowDefinition } from './dynamicWorkflowDefinition.ts'
export type { DynamicWorkflowDefinition } from './dynamicWorkflowDefinition.ts'

type HistoricalDefinition = Readonly<{
  id: string
  version: number
  objective: string
  steps: readonly Readonly<{
    id: string
    capability: string
    dependsOn: readonly string[]
    requiresApproval?: boolean
  }>[]
}>
export function migrateHistoricalWorkflowDefinition(
  historical: HistoricalDefinition,
  registeredCapabilities: ReadonlySet<string>,
): DynamicWorkflowDefinition {
  if (!historical || typeof historical.objective !== 'string' || !historical.objective.trim()) {
    throw new Error('workflow_migration_invalid_objective')
  }
  if (!Array.isArray(historical.steps)) throw new Error('workflow_migration_invalid_steps')
  // The persisted v1 schema does not represent per-step approval requirements.
  // Dropping them would silently reduce permissions, so reject until approval
  // becomes a first-class part of the canonical schema.
  if (historical.steps.some(step => step.requiresApproval === true)) {
    throw new Error('workflow_migration_approval_not_representable')
  }
  return validateDynamicWorkflowDefinition({
    id: historical.id,
    version: historical.version,
    description: historical.objective.slice(0,500),
    steps: historical.steps.map(step => ({
      id: step.id, capability: step.capability, dependsOn: step.dependsOn,
    })),
  }, registeredCapabilities)
}
