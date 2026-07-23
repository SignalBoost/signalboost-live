import { createHash } from 'node:crypto'
import { SupervisorValidationError } from '../errors.ts'
import type { RepairPlan, RepairStep } from '../repair-plan-schema.ts'
import type { DecisionEnvelope, PolicyDecisionBinding } from './models.ts'

const secretKey = /(password|api[_-]?key|token|secret|private[_-]?key|access[_-]?token|credential)/i
const secretValue = /(bearer\s+\S+|(?:sk|ghp|xoxb)_[A-Za-z0-9_-]{8,}|-----BEGIN)/i

/** Canonical JSON for content-addressed approval records. Arrays deliberately retain order. */
export function canonicalize(value: unknown): string { return JSON.stringify(canonical(value, '$')) }
function canonical(value: unknown, path: string): unknown {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') throw new SupervisorValidationError(`${path} is not serializable`)
  if (typeof value === 'number' && !Number.isFinite(value)) throw new SupervisorValidationError(`${path} must be finite`)
  if (typeof value === 'string') { if (secretValue.test(value)) throw new SupervisorValidationError(`${path} contains plaintext secret material`); return value }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
  if (Array.isArray(value)) return value.map((item, index) => canonical(item, `${path}[${index}]`))
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new SupervisorValidationError(`${path} must be plain serializable data`)
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (secretKey.test(key) && !key.endsWith('Ref')) throw new SupervisorValidationError(`${path}.${key} contains plaintext secret material`)
    result[key] = canonical((value as Record<string, unknown>)[key], `${path}.${key}`)
  }
  return result
}
const digest = (value: unknown) => createHash('sha256').update(canonicalize(value)).digest('hex')
const ids = (steps: RepairStep[]) => {
  const seen = new Set<string>()
  for (const step of steps) { if (seen.has(step.stepId)) throw new SupervisorValidationError('duplicate repair step ID'); seen.add(step.stepId) }
}
function exactSteps(steps: RepairStep[]) { return steps.map(({ stepId, action, description, parameters, protectedAction }) => ({ stepId, action, description, parameters, protectedAction })) }

export function fingerprintRepairPlan(input: { missionId: string; missionRevision: number; decisionId: string; environment: string; actionType: string; plan: RepairPlan }): string {
  ids(input.plan.steps); ids(input.plan.verificationSteps); if (input.plan.rollbackSteps) ids(input.plan.rollbackSteps)
  return digest({ schemaVersion: 'mission-plan-fingerprint-v1', missionId: input.missionId, missionRevision: input.missionRevision, decisionId: input.decisionId, environment: input.environment, actionType: input.actionType, planSchemaVersion: input.plan.schemaVersion, planId: input.plan.planId, incidentId: input.plan.incidentId, diagnosis: input.plan.diagnosis, confidenceScore: input.plan.confidenceScore, requiresBrowser: input.plan.requiresBrowser, riskLevel: input.plan.riskLevel, targetProvider: input.plan.targetProvider, targetEnvironment: input.plan.targetEnvironment, steps: exactSteps(input.plan.steps), verificationSteps: exactSteps(input.plan.verificationSteps), rollbackSteps: input.plan.rollbackSteps ? exactSteps(input.plan.rollbackSteps) : [] })
}
export function fingerprintDecision(decision: Omit<DecisionEnvelope, 'decisionFingerprint'>): string {
  const plan = decision.repairPlan
  return digest({ schemaVersion: 'mission-decision-fingerprint-v1', decisionId: decision.decisionId, missionId: decision.missionId, missionRevision: decision.missionRevision, environment: decision.targetEnvironment, actionType: decision.actionType, repairPlan: { planId: plan.planId, incidentId: plan.incidentId, diagnosis: plan.diagnosis, confidenceScore: plan.confidenceScore, requiresBrowser: plan.requiresBrowser, riskLevel: plan.riskLevel, targetProvider: plan.targetProvider, targetEnvironment: plan.targetEnvironment, steps: exactSteps(plan.steps), verificationSteps: exactSteps(plan.verificationSteps), rollbackSteps: plan.rollbackSteps ? exactSteps(plan.rollbackSteps) : [], generatedAt: plan.generatedAt, schemaVersion: plan.schemaVersion }, planFingerprint: decision.planFingerprint, riskLevel: decision.riskLevel, confidence: decision.confidence, externalSideEffect: decision.externalSideEffect, createdAt: decision.createdAt, expiresAt: decision.expiresAt, decisionSchemaVersion: decision.schemaVersion })
}
export function fingerprintPolicyBinding(binding: Omit<PolicyDecisionBinding, 'bindingFingerprint'>): string {
  if (new Set(binding.approvedStepIds).size !== binding.approvedStepIds.length) throw new SupervisorValidationError('duplicate approved step IDs')
  const { bindingFingerprint: _ignored, ...fields } = binding as PolicyDecisionBinding
  return digest({ schemaVersion: 'mission-policy-binding-fingerprint-v1', ...fields })
}
