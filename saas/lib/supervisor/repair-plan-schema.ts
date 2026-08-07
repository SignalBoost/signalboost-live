import { SupervisorValidationError } from './errors.ts'
import { isPlainSerializable, type SerializableValue, supervisorEnvironments } from './incident-schema.ts'

export const repairRiskLevels = ['low', 'medium', 'high', 'critical'] as const
export const repairStepActions = ['api_request', 'navigate', 'click', 'fill', 'select', 'read', 'screenshot', 'request_approval', 'verify', 'stop'] as const

export interface RepairStep {
  stepId: string
  action: (typeof repairStepActions)[number]
  description: string
  protectedAction: boolean
  parameters: Record<string, SerializableValue>
  expectedResult?: string
}

export interface ApprovalRequirements {
  requiredApprovalsCount: number
  requiredRoles: string[]
  rationale?: string
}

export interface RepairPlan {
  planId: string
  incidentId: string
  diagnosis: string
  confidenceScore: number
  requiresBrowser: boolean
  riskLevel: (typeof repairRiskLevels)[number]
  targetProvider: string
  targetEnvironment: (typeof supervisorEnvironments)[number]
  targetOrigin?: string
  approvalRequirements?: ApprovalRequirements
  steps: RepairStep[]
  verificationSteps: RepairStep[]
  rollbackSteps?: RepairStep[]
  generatedAt: string
  schemaVersion: string
}

const plaintextSecretKeys = new Set(['password', 'apiKey', 'api_key', 'token', 'secret', 'privateKey', 'accessToken'])
const executableKeyPattern = /(javascript|script|eval|function|command|shell|code)/i
const executableValuePattern = /(^|\b)(eval\s*\(|function\s*\(|=>|<script|javascript:|\bnode\s+|\bbash\s+|\bsh\s+-|\bpowershell\b)/i

function assertString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new SupervisorValidationError(`${path} must be a non-empty string`)
  return value
}
function assertDate(value: unknown, path: string): string {
  const result = assertString(value, path)
  if (Number.isNaN(Date.parse(result))) throw new SupervisorValidationError(`${path} must be a valid date string`)
  return result
}
function assertApprovalRequirements(candidate: unknown): ApprovalRequirements {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || Object.getPrototypeOf(candidate) !== Object.prototype) {
    throw new SupervisorValidationError('approvalRequirements must be a plain object')
  }
  const input = candidate as Record<string, unknown>
  const count = input.requiredApprovalsCount
  if (!Number.isInteger(count) || (count as number) < 0 || (count as number) > 10) {
    throw new SupervisorValidationError('approvalRequirements.requiredApprovalsCount must be an integer from 0 through 10')
  }
  if (!Array.isArray(input.requiredRoles) || input.requiredRoles.some(role => typeof role !== 'string' || role.trim() === '')) {
    throw new SupervisorValidationError('approvalRequirements.requiredRoles must be an array of non-empty strings')
  }
  const requiredRoles = [...new Set((input.requiredRoles as string[]).map(role => role.trim()))]
  if ((count as number) < requiredRoles.length) {
    throw new SupervisorValidationError('approvalRequirements.requiredApprovalsCount cannot be lower than the number of mandatory roles')
  }
  return {
    requiredApprovalsCount: count as number,
    requiredRoles,
    ...(input.rationale === undefined ? {} : { rationale: assertString(input.rationale, 'approvalRequirements.rationale') }),
  }
}
function assertStep(candidate: unknown, path: string): RepairStep {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || Object.getPrototypeOf(candidate) !== Object.prototype) throw new SupervisorValidationError(`${path} must be a plain object`)
  const input = candidate as Record<string, unknown>
  const parameters = input.parameters ?? {}
  if (!isPlainSerializable(parameters) || Array.isArray(parameters)) throw new SupervisorValidationError(`${path}.parameters must be a plain serializable object`)
  rejectUnsafeParameters(parameters, `${path}.parameters`)
  const step: RepairStep = {
    stepId: assertString(input.stepId, `${path}.stepId`),
    action: input.action as RepairStep['action'],
    description: assertString(input.description, `${path}.description`),
    protectedAction: input.protectedAction === true,
    parameters: parameters as Record<string, SerializableValue>,
    expectedResult: input.expectedResult === undefined ? undefined : assertString(input.expectedResult, `${path}.expectedResult`),
  }
  if (!repairStepActions.includes(step.action)) throw new SupervisorValidationError(`${path}.action is not supported`)
  if (typeof input.protectedAction !== 'boolean') throw new SupervisorValidationError(`${path}.protectedAction must be boolean`)
  return step
}
function rejectUnsafeParameters(value: unknown, path: string): void {
  if (Array.isArray(value)) value.forEach((entry, index) => rejectUnsafeParameters(entry, `${path}[${index}]`))
  else if (value && typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new SupervisorValidationError(`${path} must be plain serializable data`)
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (plaintextSecretKeys.has(key) && !key.endsWith('Ref')) throw new SupervisorValidationError(`${path}.${key} must use a secret reference, not plaintext`)
      if (executableKeyPattern.test(key)) throw new SupervisorValidationError(`${path}.${key} must not contain executable code`)
      rejectUnsafeParameters(nested, `${path}.${key}`)
    }
  } else if (typeof value === 'string' && executableValuePattern.test(value)) {
    throw new SupervisorValidationError(`${path} must not contain executable code`)
  }
}

export const repairPlanSchema = {
  parse(candidate: unknown): RepairPlan {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || Object.getPrototypeOf(candidate) !== Object.prototype) throw new SupervisorValidationError('repair plan must be a plain object')
    const input = candidate as Record<string, unknown>
    const steps = input.steps
    const verificationSteps = input.verificationSteps
    if (!Array.isArray(steps) || steps.length === 0) throw new SupervisorValidationError('steps must be a non-empty array')
    if (!Array.isArray(verificationSteps) || verificationSteps.length === 0) throw new SupervisorValidationError('verificationSteps must be a non-empty array')
    const plan: RepairPlan = {
      planId: assertString(input.planId, 'planId'),
      incidentId: assertString(input.incidentId, 'incidentId'),
      diagnosis: assertString(input.diagnosis, 'diagnosis'),
      confidenceScore: input.confidenceScore as number,
      requiresBrowser: input.requiresBrowser === true,
      riskLevel: input.riskLevel as RepairPlan['riskLevel'],
      targetProvider: assertString(input.targetProvider, 'targetProvider'),
      targetEnvironment: input.targetEnvironment as RepairPlan['targetEnvironment'],
      targetOrigin: input.targetOrigin === undefined ? undefined : assertString(input.targetOrigin, 'targetOrigin'),
      approvalRequirements: input.approvalRequirements === undefined ? undefined : assertApprovalRequirements(input.approvalRequirements),
      steps: steps.map((step, index) => assertStep(step, `steps[${index}]`)),
      verificationSteps: verificationSteps.map((step, index) => assertStep(step, `verificationSteps[${index}]`)),
      rollbackSteps: input.rollbackSteps === undefined ? undefined : (input.rollbackSteps as unknown[]).map((step, index) => assertStep(step, `rollbackSteps[${index}]`)),
      generatedAt: assertDate(input.generatedAt, 'generatedAt'),
      schemaVersion: assertString(input.schemaVersion, 'schemaVersion'),
    }
    if (!Number.isInteger(plan.confidenceScore) || plan.confidenceScore < 0 || plan.confidenceScore > 100) throw new SupervisorValidationError('confidenceScore must be an integer from 0 through 100')
    if (typeof input.requiresBrowser !== 'boolean') throw new SupervisorValidationError('requiresBrowser must be boolean')
    if (!repairRiskLevels.includes(plan.riskLevel)) throw new SupervisorValidationError('riskLevel is not supported')
    if (!supervisorEnvironments.includes(plan.targetEnvironment)) throw new SupervisorValidationError('targetEnvironment is not supported')
    if (plan.targetOrigin !== undefined) new URL(plan.targetOrigin)
    if (plan.requiresBrowser && !plan.targetOrigin) throw new SupervisorValidationError('targetOrigin is required when requiresBrowser is true')
    if (input.rollbackSteps !== undefined && !Array.isArray(input.rollbackSteps)) throw new SupervisorValidationError('rollbackSteps must be an array')
    return plan
  },
}

export type InferRepairPlan = RepairPlan
