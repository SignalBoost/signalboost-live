import * as crypto from 'crypto'
import type { PolicyDecision } from '../execution-contracts.ts'
import type { SupervisorIncident } from '../incident-schema.ts'
import type { RepairPlan } from '../repair-plan-schema.ts'
import { canonicalJson } from './canonical-json.ts'

export type QuorumRole = 'ON_CALL_LEAD' | 'SECURITY_OFFICER' | 'INFRA_ARCHITECT' | 'ADMIN'

export interface QuorumApprover {
  approverId: string
  role: QuorumRole
  publicKeyPem: string
  enabled?: boolean
}

export interface QuorumPolicy {
  requiredSignaturesCount: number
  requiredRoles: QuorumRole[]
  ttlMs: number
}

export interface QuorumSignature {
  approverId: string
  role: QuorumRole
  signedAt: string
  signatureHex: string
}

export interface QuorumRequest {
  requestId: string
  incidentId: string
  planId: string
  planFingerprint: string
  policyVersion: string
  targetEnvironment: string
  approvedStepIds: string[]
  nonce: string
  createdAt: string
  expiresAt: string
  quorumPolicy: QuorumPolicy
}

export interface QuorumState {
  request: QuorumRequest
  signatures: QuorumSignature[]
  satisfied: boolean
}

export interface QuorumStateStore {
  get(requestId: string): Promise<QuorumState | undefined> | QuorumState | undefined
  put(state: QuorumState): Promise<void> | void
  delete(requestId: string): Promise<void> | void
}

export class InMemoryQuorumStateStore implements QuorumStateStore {
  private readonly values = new Map<string, QuorumState>()
  get(requestId: string): QuorumState | undefined { return this.values.get(requestId) }
  put(state: QuorumState): void { this.values.set(state.request.requestId, structuredClone(state)) }
  delete(requestId: string): void { this.values.delete(requestId) }
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function normalizePolicy(policy: QuorumPolicy): QuorumPolicy {
  return {
    requiredSignaturesCount: policy.requiredSignaturesCount,
    requiredRoles: [...new Set(policy.requiredRoles)].sort() as QuorumRole[],
    ttlMs: policy.ttlMs,
  }
}

export function planFingerprint(plan: RepairPlan): string {
  return sha256(canonicalJson({
    planId: plan.planId,
    incidentId: plan.incidentId,
    targetProvider: plan.targetProvider,
    targetEnvironment: plan.targetEnvironment,
    targetOrigin: plan.targetOrigin ?? '',
    steps: plan.steps,
    verificationSteps: plan.verificationSteps,
    rollbackSteps: plan.rollbackSteps ?? [],
  }))
}

export function quorumRequestId(plan: RepairPlan, policy: PolicyDecision): string {
  return `quorum-${sha256(`${plan.planId}\u0000${policy.policyVersion}`).slice(0, 24)}`
}

export class QuorumApprovalEngine {
  private readonly approvers = new Map<string, QuorumApprover>()
  private readonly store: QuorumStateStore
  private readonly now: () => Date
  private readonly nonceFactory: () => string

  constructor(options: { store?: QuorumStateStore; now?: () => Date; nonceFactory?: () => string } = {}) {
    this.store = options.store ?? new InMemoryQuorumStateStore()
    this.now = options.now ?? (() => new Date())
    this.nonceFactory = options.nonceFactory ?? (() => crypto.randomBytes(16).toString('hex'))
  }

  registerApprover(approver: QuorumApprover): void {
    if (!approver.approverId.trim() || !approver.publicKeyPem.trim()) throw new Error('Approver identity and public key are required')
    this.approvers.set(approver.approverId, { ...approver })
  }

  async ensureRequest(input: { incident: SupervisorIncident; plan: RepairPlan; policy: PolicyDecision; quorumPolicy: QuorumPolicy }): Promise<QuorumState> {
    if (!Number.isInteger(input.quorumPolicy.requiredSignaturesCount) || input.quorumPolicy.requiredSignaturesCount < 1) throw new Error('Quorum requires at least one signature')
    if (input.quorumPolicy.ttlMs <= 0) throw new Error('Quorum TTL must be positive')

    const normalizedPolicy = normalizePolicy(input.quorumPolicy)
    const approvedStepIds = [...input.policy.approvedStepIds].sort()
    const requestId = quorumRequestId(input.plan, input.policy)
    const existing = await this.store.get(requestId)
    const fingerprint = planFingerprint(input.plan)
    if (existing) {
      const sameScope = canonicalJson(existing.request.approvedStepIds) === canonicalJson(approvedStepIds)
      const sameQuorumPolicy = canonicalJson(existing.request.quorumPolicy) === canonicalJson(normalizedPolicy)
      if (
        existing.request.planFingerprint !== fingerprint ||
        existing.request.policyVersion !== input.policy.policyVersion ||
        !sameScope ||
        !sameQuorumPolicy
      ) {
        throw new Error('Existing quorum request does not match the current plan, approval scope, or policy')
      }
      return existing
    }

    const createdAt = this.now()
    const request: QuorumRequest = {
      requestId,
      incidentId: input.incident.incidentId,
      planId: input.plan.planId,
      planFingerprint: fingerprint,
      policyVersion: input.policy.policyVersion,
      targetEnvironment: input.plan.targetEnvironment,
      approvedStepIds,
      nonce: this.nonceFactory(),
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + normalizedPolicy.ttlMs).toISOString(),
      quorumPolicy: normalizedPolicy,
    }
    const state: QuorumState = { request, signatures: [], satisfied: false }
    await this.store.put(state)
    return state
  }

  signingPayload(request: QuorumRequest): string {
    return canonicalJson({
      requestId: request.requestId,
      incidentId: request.incidentId,
      planId: request.planId,
      planFingerprint: request.planFingerprint,
      policyVersion: request.policyVersion,
      targetEnvironment: request.targetEnvironment,
      approvedStepIds: request.approvedStepIds,
      quorumPolicy: request.quorumPolicy,
      nonce: request.nonce,
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
    })
  }

  async submitSignature(requestId: string, signature: QuorumSignature): Promise<QuorumState> {
    const state = await this.store.get(requestId)
    if (!state) throw new Error('Quorum request not found')
    if (this.now().getTime() > Date.parse(state.request.expiresAt)) {
      await this.store.delete(requestId)
      throw new Error('Quorum request expired')
    }

    const approver = this.approvers.get(signature.approverId)
    if (!approver || approver.enabled === false || approver.role !== signature.role) throw new Error('Unauthorized approver or role mismatch')
    if (state.signatures.some(item => item.approverId === signature.approverId)) throw new Error('Approver has already signed this request')

    const payload = Buffer.from(this.signingPayload(state.request))
    const valid = crypto.verify(null, payload, approver.publicKeyPem, Buffer.from(signature.signatureHex, 'hex'))
    if (!valid) throw new Error('Invalid cryptographic signature')

    const acceptedSignature: QuorumSignature = { ...signature, signedAt: this.now().toISOString() }
    const signatures = [...state.signatures, acceptedSignature]
    const signedRoles = new Set(signatures.map(item => item.role))
    const rolesSatisfied = state.request.quorumPolicy.requiredRoles.every(role => signedRoles.has(role))
    const satisfied = signatures.length >= state.request.quorumPolicy.requiredSignaturesCount && rolesSatisfied
    const next: QuorumState = { request: state.request, signatures, satisfied }
    await this.store.put(next)
    return next
  }

  async getState(requestId: string): Promise<QuorumState | undefined> {
    return await this.store.get(requestId)
  }
}
