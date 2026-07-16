import { createHash } from 'crypto'
import type { BrowserTask } from '../../../browser-runtime/contracts.ts'
import { isPlainSerializable, type SerializableValue } from '../../incident-schema.ts'
import { BrowserRuntimeAdapterError } from './browser-runtime-adapter-errors.ts'

export const browserRuntimeDryRunSchemaVersion = 'browser-runtime-dry-run-v1'
export type BrowserRuntimeDryRunMode = 'dry_run'

export interface BrowserRuntimeStepMapping { supervisorStepId: string; browserRuntimeStepId: string }
export interface BrowserRuntimeApprovalRequirements {
  supervisorPolicyApproval: { approvedStepIds: string[]; doesNotGrantRuntimeApproval: true }
  browserRuntimeSignedTaskApproval: { requiredLater: true; approvalTokenCreated: false }
  browserRuntimeContinuationApproval: { requiredForPostCheckpointSteps: boolean; approvalTokenCreated: false; checkpointStepIds: string[]; postCheckpointStepIds: string[] }
  protectedStepIds: string[]
}
export interface BrowserRuntimeVerificationRequirements {
  expectedStepCompletionOrder: string[]
  expectedEvidenceByStepId: Record<string, 'navigation' | 'interaction' | 'screenshot' | 'checkpoint'>
  screenshotStepIds: string[]
  finalStateAssertions: string[]
  requiredTerminalVerificationStatus: 'verified'
  approvedOrigins: string[]
  checkpointBoundaryExpectations: { checkpointStepIds: string[]; preCheckpointStepIds: string[]; postCheckpointStepIds: string[] }
  planVerificationStepIds: string[]
}
export interface BrowserRuntimeDryRunPackage {
  packageId: string
  dispatchId: string
  incidentId: string
  planId: string
  provider: string
  targetEnvironment: string
  targetOrigin: string
  approvedStepIds: string[]
  browserTask: BrowserTask
  stepMapping: BrowserRuntimeStepMapping[]
  approvalRequirements: BrowserRuntimeApprovalRequirements
  verificationRequirements: BrowserRuntimeVerificationRequirements
  packageFingerprint: string
  createdAt: string
  schemaVersion: typeof browserRuntimeDryRunSchemaVersion
  mode: BrowserRuntimeDryRunMode
}

const secretKey = /(password|api[_-]?key|access[_-]?token|private[_-]?key|secret|cookie|authorization)/i
const allowedNonSecretTokenKeys = new Set(['approvalToken', 'approvalTokenCreated'])
const badString = /(bearer\s+[a-z0-9._-]+|sk-[a-z0-9]{16,}|javascript:|<script|eval\s*\(|function\s*\(|\b(bash|sh|node|powershell)\s+)/i

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonicalize(v)]))
  }
  return value
}
export function hashCanonical(value: unknown): string { return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex') }

function assertNoForbidden(value: unknown, path: string): void {
  if (Array.isArray(value)) value.forEach((v, i) => assertNoForbidden(v, `${path}[${i}]`))
  else if (value && typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new BrowserRuntimeAdapterError('non_plain_package', `${path} must be plain serializable data`, 'schema')
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const isAllowedNonSecretTokenField = allowedNonSecretTokenKeys.has(k)
      if (secretKey.test(k) && !isAllowedNonSecretTokenField && !/(Ref|Refs)$/.test(k) && !path.endsWith('expectedEvidenceByStepId')) throw new BrowserRuntimeAdapterError('secret_key_in_package', `${path}.${k} is forbidden`, 'secret')
      assertNoForbidden(v, `${path}.${k}`)
    }
  } else if (typeof value === 'string' && badString.test(value)) throw new BrowserRuntimeAdapterError('unsafe_string_in_package', `${path} contains forbidden content`, 'secret')
}

export const browserRuntimeDryRunPackageSchema = {
  parse(candidate: unknown): BrowserRuntimeDryRunPackage {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || Object.getPrototypeOf(candidate) !== Object.prototype) throw new BrowserRuntimeAdapterError('invalid_package', 'Dry-run package must be a plain object', 'schema')
    if (!isPlainSerializable(candidate as SerializableValue)) throw new BrowserRuntimeAdapterError('non_serializable_package', 'Dry-run package must be serializable', 'schema')
    assertNoForbidden(candidate, 'package')
    const p = candidate as BrowserRuntimeDryRunPackage
    if (p.mode !== 'dry_run') throw new BrowserRuntimeAdapterError('invalid_mode', 'Dry-run package mode must be dry_run', 'schema')
    if (p.schemaVersion !== browserRuntimeDryRunSchemaVersion) throw new BrowserRuntimeAdapterError('invalid_schema_version', 'Unsupported dry-run package schemaVersion', 'schema')
    for (const field of ['packageId','dispatchId','incidentId','planId','provider','targetEnvironment','targetOrigin','packageFingerprint','createdAt'] as const) if (typeof p[field] !== 'string' || !p[field].trim()) throw new BrowserRuntimeAdapterError('invalid_package_field', `${field} is required`, 'schema')
    if (!Array.isArray(p.approvedStepIds) || !Array.isArray(p.stepMapping) || !p.browserTask || typeof p.browserTask !== 'object') throw new BrowserRuntimeAdapterError('invalid_package_shape', 'Dry-run package shape is invalid', 'schema')
    if (Number.isNaN(Date.parse(p.createdAt))) throw new BrowserRuntimeAdapterError('invalid_created_at', 'createdAt must be a date', 'schema')
    return p
  },
}
