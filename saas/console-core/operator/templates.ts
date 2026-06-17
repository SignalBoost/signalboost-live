// saas/console-core/operator/templates.ts
//
// MODULE 2 — PROVIDER TEMPLATES (SignalBoost AI Operator)
//
// A provider template is the ONLY legal interface between the operator and any
// provider. This file is the canonical, portable contract: the schema every
// action template must satisfy, plus the linter and enforcement helpers the
// engine uses to validate, gate, and version templates.
//
// Named GovernedTemplate to stay distinct from the existing lib/hub
// ProviderTemplate; an adapter (later) maps existing templates + action-policy
// entries onto this contract. Portable: imports only Module 1 doctrine.

import { precedenceRank } from './principles'

void precedenceRank // doctrine reference kept available to enforcement callers

// ── Vocabulary ────────────────────────────────────────────────────────────────
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type PermissionPolicy = 'user' | 'admin' | 'owner'
export type ApprovalRequirement = 'none' | 'user' | 'admin' | 'owner'
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'
export type TemplateFieldType = 'text' | 'number' | 'boolean' | 'select' | 'json'

// ── Field + validation ────────────────────────────────────────────────────────
export interface TemplateField {
  id: string
  label?: string
  type: TemplateFieldType
  /** Restrict to an explicit set of values (for select or constrained text/number). */
  allowedValues?: Array<string | number>
  minLength?: number
  maxLength?: number
  /** Regex source string; matched against the stringified value. */
  pattern?: string
}

/** Cross-field validation rule. `when`/`then` are field ids that must co-exist. */
export interface CrossFieldRule {
  id: string
  requires: string[] // if any listed field is present, all must be present
  message?: string
}

// ── The governed template contract (Module 2 §3) ──────────────────────────────
export interface GovernedTemplate {
  provider: string
  action: string
  version: string // semver-ish, e.g. "1.0.0"
  requiredFields: TemplateField[]
  optionalFields: TemplateField[]
  validationRules?: CrossFieldRule[]
  riskLevel: RiskLevel
  permissionPolicy: PermissionPolicy
  idempotency: boolean
  rollbackPossible: boolean
  rollbackNotes: string
  expectedResponse?: Record<string, unknown>
  executor: { endpoint: string; method: HttpMethod }
}

// ── Risk → approval (Module 2 §7) ─────────────────────────────────────────────
export const RISK_APPROVAL: Record<RiskLevel, ApprovalRequirement> = {
  low: 'none',       // auto-run
  medium: 'user',    // user approval
  high: 'admin',     // admin approval
  critical: 'owner', // owner approval
}
export function requiredApproval(t: GovernedTemplate): ApprovalRequirement {
  return RISK_APPROVAL[t.riskLevel]
}

// ── Permission policy (Module 2 §8) ───────────────────────────────────────────
const ROLE_RANK: Record<PermissionPolicy, number> = { user: 1, admin: 2, owner: 3 }
/** True when `role` meets or exceeds the template's required policy level. */
export function permits(policy: PermissionPolicy, role: PermissionPolicy | string): boolean {
  const r = ROLE_RANK[role as PermissionPolicy]
  return typeof r === 'number' && r >= ROLE_RANK[policy]
}

// ── Linting (Module 2 §12) ────────────────────────────────────────────────────
const VALID_RISK: RiskLevel[] = ['low', 'medium', 'high', 'critical']
const VALID_PERMISSION: PermissionPolicy[] = ['user', 'admin', 'owner']
const VALID_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE']
const VALID_FIELD_TYPES: TemplateFieldType[] = ['text', 'number', 'boolean', 'select', 'json']

function lintField(f: TemplateField, where: string, errors: string[]): void {
  if (!f.id) errors.push(`${where}: a field is missing an id`)
  if (!VALID_FIELD_TYPES.includes(f.type)) errors.push(`${where}.${f.id || '?'}: invalid type "${f.type}"`)
  if (f.minLength != null && f.maxLength != null && f.minLength > f.maxLength) {
    errors.push(`${where}.${f.id}: minLength > maxLength`)
  }
  if (f.pattern) {
    try { new RegExp(f.pattern) } catch { errors.push(`${where}.${f.id}: invalid regex pattern`) }
  }
}

/** Validate a template against the schema. A template must lint before use. */
export function lintTemplate(t: GovernedTemplate): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  if (!t.provider) errors.push('provider is required')
  if (!t.action) errors.push('action is required')
  if (!t.version) errors.push('version is required')
  if (!VALID_RISK.includes(t.riskLevel)) errors.push(`risk_level invalid: "${t.riskLevel}"`)
  if (!VALID_PERMISSION.includes(t.permissionPolicy)) errors.push(`permission_policy invalid: "${t.permissionPolicy}"`)
  if (typeof t.idempotency !== 'boolean') errors.push('idempotency must be boolean')
  if (typeof t.rollbackPossible !== 'boolean') errors.push('rollback_possible must be boolean')
  // Rollback validation: notes are mandatory, and an irreversible action must say why.
  if (!t.rollbackNotes || !t.rollbackNotes.trim()) errors.push('rollback_notes is required')
  // Endpoint validation.
  if (!t.executor || !t.executor.endpoint) errors.push('executor.endpoint is required')
  if (!t.executor || !VALID_METHODS.includes(t.executor.method)) errors.push('executor.method invalid')
  // Field validation.
  for (const f of t.requiredFields || []) lintField(f, 'requiredFields', errors)
  for (const f of t.optionalFields || []) lintField(f, 'optionalFields', errors)
  // A field id must not appear in both required and optional.
  const reqIds = new Set((t.requiredFields || []).map(f => f.id))
  for (const f of t.optionalFields || []) {
    if (reqIds.has(f.id)) errors.push(`field "${f.id}" is in both required and optional`)
  }
  return { ok: errors.length === 0, errors }
}

// ── Field-value validation (Module 2 §6) ──────────────────────────────────────
function validateValue(f: TemplateField, value: unknown): string[] {
  const errs: string[] = []
  const label = f.label || f.id
  if (f.type === 'number' && typeof value !== 'number' && isNaN(Number(value))) {
    errs.push(`${label} must be a number`)
  }
  if (f.type === 'boolean' && typeof value !== 'boolean') errs.push(`${label} must be true or false`)
  if (f.type === 'json' && typeof value === 'string') {
    try { JSON.parse(value) } catch { errs.push(`${label} must be valid JSON`) }
  }
  const s = typeof value === 'string' ? value : String(value)
  if (f.minLength != null && s.length < f.minLength) errs.push(`${label} is too short (min ${f.minLength})`)
  if (f.maxLength != null && s.length > f.maxLength) errs.push(`${label} is too long (max ${f.maxLength})`)
  if (f.pattern) {
    try { if (!new RegExp(f.pattern).test(s)) errs.push(`${label} has an invalid format`) } catch { /* linted elsewhere */ }
  }
  if (Array.isArray(f.allowedValues) && f.allowedValues.length) {
    const ok = f.allowedValues.some(a => String(a) === s)
    if (!ok) errs.push(`${label} must be one of the allowed values`)
  }
  return errs
}

// ── Payload validation (Module 2 §4 & §5) ─────────────────────────────────────
/**
 * Enforce: all required fields present + valid; provided fields are KNOWN (no
 * invented fields); each provided value passes its rules; cross-field rules hold.
 */
export function validatePayload(
  t: GovernedTemplate,
  input: Record<string, unknown>,
): { ok: boolean; errors: string[]; missing: string[] } {
  const errors: string[] = []
  const missing: string[] = []
  const known = new Map<string, TemplateField>()
  for (const f of t.requiredFields || []) known.set(f.id, f)
  for (const f of t.optionalFields || []) known.set(f.id, f)

  // Required present?
  for (const f of t.requiredFields || []) {
    const v = input[f.id]
    if (v === undefined || v === null || v === '') { missing.push(f.id); continue }
    errors.push(...validateValue(f, v))
  }
  // Optional values that ARE supplied must still validate.
  for (const f of t.optionalFields || []) {
    const v = input[f.id]
    if (v === undefined || v === null || v === '') continue
    errors.push(...validateValue(f, v))
  }
  // No invented fields.
  for (const key of Object.keys(input)) {
    if (!known.has(key)) errors.push(`unknown field "${key}" is not declared by the template`)
  }
  // Cross-field rules.
  for (const rule of t.validationRules || []) {
    const present = rule.requires.filter(id => input[id] !== undefined && input[id] !== null && input[id] !== '')
    if (present.length > 0 && present.length < rule.requires.length) {
      errors.push(rule.message || `fields [${rule.requires.join(', ')}] must be provided together`)
    }
  }
  if (missing.length) errors.unshift(`missing required field(s): ${missing.join(', ')}`)
  return { ok: errors.length === 0, errors, missing }
}

// ── Versioning (Module 2 §11) ─────────────────────────────────────────────────
function parseVersion(v: string): number[] {
  return v.split('.').map(n => parseInt(n, 10) || 0)
}
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a), pb = parseVersion(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}
/** Pick the latest version among templates for the same provider+action. */
export function pickLatest(templates: GovernedTemplate[]): GovernedTemplate | null {
  if (!templates.length) return null
  return templates.reduce((best, t) => (compareVersions(t.version, best.version) > 0 ? t : best))
}

// ── Immutability (Module 2 §13) ───────────────────────────────────────────────
/** Deep-freeze a loaded template so a runbook can never mutate it mid-flight. */
export function freezeTemplate<T extends GovernedTemplate>(t: T): Readonly<T> {
  const deepFreeze = (o: unknown): void => {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o)
      for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
    }
  }
  deepFreeze(t)
  return t
}
