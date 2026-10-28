/**
 * Governed, declarative workflow definitions. Definitions describe references to
 * pre-registered capabilities, NEVER executable code or authorization.
 * Persistence and execution are intentionally separate from validation.
 */
export type DynamicWorkflowStep = Readonly<{
  id: string
  capability: string
  dependsOn: readonly string[]
}>
export type DynamicWorkflowDefinition = Readonly<{
  id: string
  version: number
  description: string
  steps: readonly DynamicWorkflowStep[]
}>
const ID = /^[a-z][a-z0-9_-]{0,63}$/
const own = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const keys = (obj: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(obj).every(key => allowed.includes(key))
export function validateDynamicWorkflowDefinition(
  input: unknown,
  registeredCapabilities: ReadonlySet<string>,
): DynamicWorkflowDefinition {
  if (!own(input) || !keys(input, ['id','version','description','steps'])) throw new Error('workflow_invalid_root')
  if (typeof input.id !== 'string' || !ID.test(input.id)) throw new Error('workflow_invalid_id')
  if (input.version !== 1) throw new Error('workflow_unsupported_version')
  if (typeof input.description !== 'string' || input.description.length > 500) throw new Error('workflow_invalid_description')
  if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 32) throw new Error('workflow_invalid_steps')
  const seen = new Set<string>()
  const steps: DynamicWorkflowStep[] = []
  for (const raw of input.steps) {
    if (!own(raw) || !keys(raw,['id','capability','dependsOn'])) throw new Error('workflow_invalid_step')
    if (typeof raw.id !== 'string' || !ID.test(raw.id) || seen.has(raw.id)) throw new Error('workflow_duplicate_or_invalid_step')
    if (typeof raw.capability !== 'string' || !registeredCapabilities.has(raw.capability)) throw new Error('workflow_unregistered_capability')
    if (!Array.isArray(raw.dependsOn) || raw.dependsOn.some(x=>typeof x!=='string'||!seen.has(x)) || new Set(raw.dependsOn).size !== raw.dependsOn.length)
      throw new Error('workflow_dependency_invalid_or_out_of_order')
    seen.add(raw.id)
    steps.push({id:raw.id,capability:raw.capability,dependsOn:[...raw.dependsOn]})
  }
  return Object.freeze({id:input.id,version:1,description:input.description,steps})
}
