import type {
  PortableCapabilityDescriptor,
  PortableCapabilityDiscoveryPort,
  PortableCapabilityManifest,
  PortableCapabilityResolution,
} from './capability-runtime.ts'
import { resolvePortableCapabilities } from './capability-runtime.ts'
import type { PortableStructuredReference } from './structured-reference.ts'

export const PORTABLE_CONNECTOR_RUNTIME_SCHEMA_VERSION = 'portable-connector-runtime-v1' as const

export interface PortableApprovalEvidence {
  approvalId: string
  approvedBy: string
  approvedAt: string
}

export interface PortableConnectorInvocation {
  tenantId: string
  environmentId: string
  portableId: string
  capabilityId: string
  args: Readonly<Record<string, unknown>>
  timeoutMs?: number
  traceId?: string
  approval?: PortableApprovalEvidence
}

export interface PortableConnectorExecutionResult {
  ok: boolean
  providerId: string
  capabilityId: string
  data?: unknown
  references?: readonly PortableStructuredReference[]
  error?: string
  mode?: string
  provenance?: Readonly<Record<string, string | number | boolean | null>>
}

export interface PortableConnectorExecutionPort {
  execute(input: {
    descriptor: PortableCapabilityDescriptor
    invocation: PortableConnectorInvocation
  }): Promise<PortableConnectorExecutionResult>
}

export interface PortableConnectorAuditEvent {
  schemaVersion: typeof PORTABLE_CONNECTOR_RUNTIME_SCHEMA_VERSION
  eventId: string
  occurredAt: string
  tenantId: string
  environmentId: string
  portableId: string
  capabilityId: string
  providerId: string
  connectionId: string
  risk: PortableCapabilityDescriptor['risk']
  requiresApproval: boolean
  approvalId?: string
  ok: boolean
  durationMs: number
  mode?: string
  error?: string
  traceId?: string
}

export interface PortableConnectorAuditPort {
  append(event: PortableConnectorAuditEvent): Promise<void>
}

export interface PortableConnectorRuntimeOptions {
  discovery: PortableCapabilityDiscoveryPort
  execution: PortableConnectorExecutionPort
  audit?: PortableConnectorAuditPort
  /** Defaults true: consequential actions cannot execute if the buyer has no audit sink. */
  requireAuditForConsequential?: boolean
  defaultTimeoutMs?: number
  maxTimeoutMs?: number
  createId?: () => string
  now?: () => Date
}

export interface PortableRuntimeDiscovery {
  capabilities: readonly PortableCapabilityDescriptor[]
  resolution: PortableCapabilityResolution
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${name} is required`)
  return normalized
}

function validateApproval(approval: PortableApprovalEvidence | undefined): PortableApprovalEvidence | null {
  if (!approval) return null
  const approvedAt = new Date(required(approval.approvedAt, 'approval.approvedAt'))
  if (!Number.isFinite(approvedAt.getTime())) throw new Error('approval.approvedAt must be an ISO timestamp')
  return Object.freeze({
    approvalId: required(approval.approvalId, 'approval.approvalId'),
    approvedBy: required(approval.approvedBy, 'approval.approvedBy'),
    approvedAt: approvedAt.toISOString(),
  })
}

function timeoutFor(requested: number | undefined, defaultTimeoutMs: number, maxTimeoutMs: number): number {
  const value = requested ?? defaultTimeoutMs
  if (!Number.isFinite(value) || value <= 0) throw new Error('timeoutMs must be a positive number')
  return Math.min(Math.floor(value), maxTimeoutMs)
}

function randomId(): string {
  const cryptoLike = globalThis.crypto
  if (cryptoLike?.randomUUID) return cryptoLike.randomUUID()
  return `pcr_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`connector_timeout_${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function createPortableConnectorRuntime(options: PortableConnectorRuntimeOptions) {
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 15_000
  const maxTimeoutMs = options.maxTimeoutMs ?? 120_000
  const requireAuditForConsequential = options.requireAuditForConsequential ?? true
  const createId = options.createId ?? randomId
  const now = options.now ?? (() => new Date())

  if (defaultTimeoutMs <= 0 || maxTimeoutMs <= 0 || defaultTimeoutMs > maxTimeoutMs) {
    throw new Error('invalid connector runtime timeout configuration')
  }

  async function discover(input: {
    tenantId: string
    environmentId: string
    manifest: PortableCapabilityManifest
  }): Promise<PortableRuntimeDiscovery> {
    const tenantId = required(input.tenantId, 'tenantId')
    const environmentId = required(input.environmentId, 'environmentId')
    const capabilities = await options.discovery.discover({
      tenantId,
      environmentId,
      portableId: input.manifest.portableId,
    })

    const isolated = capabilities.filter(capability =>
      capability.tenantId === tenantId && capability.environmentId === environmentId,
    )

    return Object.freeze({
      capabilities: Object.freeze([...isolated]),
      resolution: resolvePortableCapabilities(input.manifest, isolated),
    })
  }

  async function auditDecision(input: {
    descriptor: PortableCapabilityDescriptor
    invocation: PortableConnectorInvocation
    approval: PortableApprovalEvidence | null
    result: PortableConnectorExecutionResult
    started: number
  }): Promise<void> {
    if (!options.audit) return
    const event: PortableConnectorAuditEvent = Object.freeze({
      schemaVersion: PORTABLE_CONNECTOR_RUNTIME_SCHEMA_VERSION,
      eventId: createId(),
      occurredAt: now().toISOString(),
      tenantId: input.invocation.tenantId,
      environmentId: input.invocation.environmentId,
      portableId: input.invocation.portableId,
      capabilityId: input.invocation.capabilityId,
      providerId: input.descriptor.providerId,
      connectionId: input.descriptor.connectionId,
      risk: input.descriptor.risk,
      requiresApproval: input.descriptor.requiresApproval,
      approvalId: input.approval?.approvalId,
      ok: input.result.ok,
      durationMs: Math.max(0, Date.now() - input.started),
      mode: input.result.mode,
      error: input.result.error,
      traceId: input.invocation.traceId,
    })
    await options.audit.append(event)
  }

  async function invoke(input: {
    manifest: PortableCapabilityManifest
    invocation: PortableConnectorInvocation
  }): Promise<PortableConnectorExecutionResult> {
    const started = Date.now()
    const tenantId = required(input.invocation.tenantId, 'tenantId')
    const environmentId = required(input.invocation.environmentId, 'environmentId')
    const portableId = required(input.invocation.portableId, 'portableId')
    const capabilityId = required(input.invocation.capabilityId, 'capabilityId')

    if (portableId !== input.manifest.portableId) throw new Error('portableId does not match manifest')

    const discovery = await discover({ tenantId, environmentId, manifest: input.manifest })
    const descriptor = discovery.resolution.resolved[capabilityId]
    if (!descriptor) {
      return { ok: false, providerId: 'unresolved', capabilityId, mode: 'capability_unavailable', error: capabilityId }
    }

    const invocation = Object.freeze({ ...input.invocation, tenantId, environmentId, portableId, capabilityId })
    const approval = validateApproval(input.invocation.approval)

    if (descriptor.requiresApproval && !approval) {
      const result = { ok: false, providerId: descriptor.providerId, capabilityId, mode: 'approval_required', error: capabilityId } as const
      await auditDecision({ descriptor, invocation, approval, result, started })
      return result
    }

    if (descriptor.risk === 'consequential' && requireAuditForConsequential && !options.audit) {
      return {
        ok: false,
        providerId: descriptor.providerId,
        capabilityId,
        mode: 'audit_required',
        error: 'consequential capability requires a buyer-controlled audit sink',
      }
    }

    const timeoutMs = timeoutFor(input.invocation.timeoutMs, defaultTimeoutMs, maxTimeoutMs)
    let result: PortableConnectorExecutionResult
    try {
      result = await withTimeout(options.execution.execute({
        descriptor,
        invocation: Object.freeze({ ...invocation, approval: approval ?? undefined }),
      }), timeoutMs)
    } catch (error) {
      result = {
        ok: false,
        providerId: descriptor.providerId,
        capabilityId,
        mode: 'connector_runtime_error',
        error: error instanceof Error ? error.message : 'connector execution failed',
      }
    }

    if (result.providerId !== descriptor.providerId || result.capabilityId !== capabilityId) {
      result = {
        ok: false,
        providerId: descriptor.providerId,
        capabilityId,
        mode: 'invalid_connector_result',
        error: 'connector returned mismatched provider or capability identity',
      }
    }

    await auditDecision({ descriptor, invocation, approval, result, started })

    return Object.freeze({
      ...result,
      references: result.references ? Object.freeze([...result.references]) : undefined,
      provenance: Object.freeze({
        tenantId,
        environmentId,
        portableId,
        providerId: descriptor.providerId,
        connectionId: descriptor.connectionId,
        capabilityId,
        ...(result.provenance ?? {}),
      }),
    })
  }

  return Object.freeze({ discover, invoke })
}
