// saas/lib/ai/cos/cosUniversityRoleModelPolicy.ts
/**
 * Which model a registered specialist answers its OWN field on.
 *
 * `modelForAgentWork` already routes correctly: work inside the agent's declared domain runs on its
 * role model, everything else on the platform reasoner. But the one call site passed
 * `requireBuilderCodingModel()` as the role model for every role, because when it was written only
 * software could execute. That literal survived the runtime generalization, so a registered
 * cybersecurity specialist now sits its cybersecurity exams — and a quantum specialist its
 * quantum_computing exams — on the Builder coding model, and the resulting grade says nothing about
 * the model the buyer actually chose for that field.
 *
 * Resolution rules, matching the existing practice-model policy in `cosUniversityAgentModelPolicy`:
 *
 *   - Software keeps `requireBuilderCodingModel()`. Its historical evidence depends on that model
 *     and on Builder's own configuration; nothing about it changes.
 *   - Every other role reads a buyer-controlled `system_settings` entry. There is no source-code
 *     default: an unconfigured role fails closed rather than borrowing another field's model.
 *
 * This module is pure. It parses and validates a setting value; the caller does the database read,
 * so role-model policy stays testable without a store and cannot itself reach one.
 */

export const COS_UNIVERSITY_ROLE_MODELS_SETTING_KEY = 'cos_university_role_models'
export const UNIVERSITY_ROLE_MODEL_NOT_CONFIGURED = 'university_role_model_not_configured'
export const UNIVERSITY_ROLE_MODEL_INVALID = 'university_role_model_invalid'

/** Same shape the practice-model policy accepts, so operators configure one kind of value. */
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,179}$/

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/**
 * The configured model for one role, or null when the operator has not set one. Accepts either a
 * flat `{ role: model }` map or `{ models: { role: model } }`, because both shapes already appear in
 * operator settings. A present but malformed value throws rather than being silently ignored: a
 * typo in a model id must not degrade into "not configured" and then into some other default.
 */
export function universityRoleModelFromSetting(value: unknown, role: string): string | null {
  const root = record(value)
  const nested = record(root.models)
  const source = Object.keys(nested).length ? nested : root
  const raw = source[role]
  if (raw == null || (typeof raw === 'string' && !raw.trim())) return null
  if (typeof raw !== 'string') throw new Error(`${UNIVERSITY_ROLE_MODEL_INVALID}:${role}`)
  const model = raw.trim()
  if (!MODEL_ID.test(model)) throw new Error(`${UNIVERSITY_ROLE_MODEL_INVALID}:${role}`)
  return model
}

/** The error a caller raises when a specialist has domain work and no configured model. */
export function universityRoleModelNotConfigured(role: string): Error {
  return new Error(`${UNIVERSITY_ROLE_MODEL_NOT_CONFIGURED}:${role}`)
}
