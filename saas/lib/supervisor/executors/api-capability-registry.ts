// saas/lib/supervisor/executors/api-capability-registry.ts
//
// The API executor never infers safety from model-written prose. Automatic
// execution is allowed only for an explicitly registered provider/action pair
// whose method, resource pattern, parameter schema and execution limits match.

import type { SerializableValue } from '../incident-schema.ts'
import type { RepairStep } from '../repair-plan-schema.ts'

export type ApiRiskClass = 'read_only' | 'routine_reversible' | 'consequential'

export interface ApiCapability {
  provider: string
  actionId: string
  mutation: boolean
  riskClass: ApiRiskClass
  approvalRequired: boolean
  autoExecutable: boolean
  methods: string[]
  resourcePattern: RegExp
  validateParameters(parameters: Record<string, SerializableValue>): boolean
  maximumExecutionsPerDispatch?: number
}

export interface ApiCapabilityMatch {
  capability?: ApiCapability
  actionId: string
  method: string
  resource: string
  allowed: boolean
  reason: string
}

export interface ApiCapabilityRegistry {
  match(step: RepairStep, provider: string): ApiCapabilityMatch
}

function parameterString(parameters: Record<string, SerializableValue>, names: string[]): string {
  for (const name of names) {
    const value = parameters[name]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function apiActionId(step: RepairStep): string {
  return parameterString(step.parameters || {}, ['actionId', 'action_id']) || step.action
}

export function apiMethod(step: RepairStep): string {
  return (parameterString(step.parameters || {}, ['method', 'httpMethod', 'verb']) || 'POST').toUpperCase()
}

export function apiResource(step: RepairStep): string {
  return parameterString(step.parameters || {}, ['resource', 'path', 'url', 'endpoint'])
}

function key(provider: string, actionId: string): string {
  return `${provider.trim().toLowerCase()}\u0000${actionId.trim().toLowerCase()}`
}

function deny(actionId: string, method: string, resource: string, reason: string): ApiCapabilityMatch {
  return { actionId, method, resource, allowed: false, reason }
}

export function createApiCapabilityRegistry(capabilities: readonly ApiCapability[]): ApiCapabilityRegistry {
  const entries = new Map<string, ApiCapability>()
  for (const capability of capabilities) {
    if (!capability.provider.trim() || !capability.actionId.trim()) throw new Error('API capability provider and actionId are required')
    if (!Array.isArray(capability.methods) || capability.methods.length === 0) throw new Error(`API capability ${capability.provider}/${capability.actionId} requires at least one method`)
    const entryKey = key(capability.provider, capability.actionId)
    if (entries.has(entryKey)) throw new Error(`Duplicate API capability: ${capability.provider}/${capability.actionId}`)
    entries.set(entryKey, Object.freeze({ ...capability, methods: capability.methods.map(value => value.toUpperCase()) }))
  }

  return {
    match(step, provider) {
      const actionId = apiActionId(step)
      const method = apiMethod(step)
      const resource = apiResource(step)
      const capability = entries.get(key(provider, actionId))
      if (!capability) return deny(actionId, method, resource, `Unknown provider/action capability: ${provider}/${actionId}.`)
      if (!capability.methods.includes(method)) return deny(actionId, method, resource, `HTTP method ${method} is not registered for ${provider}/${actionId}.`)
      if (!resource || !capability.resourcePattern.test(resource)) return deny(actionId, method, resource, `Resource does not match the registered pattern for ${provider}/${actionId}.`)
      let parametersValid = false
      try { parametersValid = capability.validateParameters(step.parameters || {}) } catch { parametersValid = false }
      if (!parametersValid) return deny(actionId, method, resource, `Parameters do not match the registered schema for ${provider}/${actionId}.`)
      if (capability.maximumExecutionsPerDispatch !== undefined && capability.maximumExecutionsPerDispatch < 1) {
        return deny(actionId, method, resource, `Execution limit is disabled for ${provider}/${actionId}.`)
      }
      if (!capability.autoExecutable || capability.approvalRequired || capability.riskClass === 'consequential') {
        return { capability, actionId, method, resource, allowed: false, reason: `Registered capability ${provider}/${actionId} requires approval.` }
      }
      if (capability.mutation && capability.riskClass !== 'routine_reversible') {
        return deny(actionId, method, resource, `Mutating capability ${provider}/${actionId} is not explicitly routine and reversible.`)
      }
      return { capability, actionId, method, resource, allowed: true, reason: `Registered capability ${provider}/${actionId} is explicitly auto-executable.` }
    },
  }
}

export const emptyApiCapabilityRegistry: ApiCapabilityRegistry = createApiCapabilityRegistry([])
