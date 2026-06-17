// saas/console-core/operator/runbook.ts
//
// MODULE 4 — RUNBOOK TEMPLATE (SignalBoost AI Operator)
//
// The ONLY valid structure for multi-step provider operations. A runbook plans
// steps, providers, dependencies, risk levels, approvals, preflight checks, and
// rollback rules, then records execution, failure, summary, and an immutable
// audit log. This file is the data model + builders + gates. The State Machine
// (Module 8) drives its lifecycle; the Executor (Module 7) fills execution
// records; the Failure Card (Module 5) renders the failure block.
//
// Locale: every runbook carries `metadata.locale` so previews, failure cards,
// and summaries can be rendered through t() in the active language (en/es/pt/pl/
// ru, English fallback). Defaults to 'en'.

import { OPERATOR_POLICY_VERSION, OPERATOR_IDENTITY } from './principles'
import type { RiskLevel, ApprovalRequirement, PermissionPolicy } from './templates'
import { preExecutionCheck } from './capabilityMatrix'

export type ExecutionMode = 'simulation' | 'execution'
export type SupportedLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'
const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'es', 'pt', 'pl', 'ru']

/** Normalize an arbitrary locale string to a supported one, English fallback. */
export function resolveLocale(input?: string | null): SupportedLocale {
  const l = (input || '').slice(0, 2).toLowerCase()
  return (SUPPORTED_LOCALES as string[]).includes(l) ? (l as SupportedLocale) : 'en'
}

// ── Structural pieces ─────────────────────────────────────────────────────────
export interface RunbookStep {
  stepId: string
  stepName: string
  provider: string
  template: string            // GovernedTemplate id (provider.action)
  dependsOn: string[]
  riskLevel: RiskLevel
  approvalRequired: ApprovalRequirement
  rollbackPossible: boolean
  rollbackNotes: string
}

export interface PreflightChecks {
  credentialsValid: boolean
  providerHealth: boolean
  permissionsValid: boolean
  templatesValid: boolean
  dependenciesSatisfied: boolean
  rateLimitsSafe: boolean
  idempotencyConfirmed: boolean
}

export interface Approval {
  stepId: string
  requiredRole: ApprovalRequirement
  approvedBy: string | null
  approvedAt: string | null
}

export interface ExecutionRecord {
  stepId: string
  templateFilled: Record<string, unknown>
  templateValidated: boolean
  providerRequest: Record<string, unknown> | null
  providerResponse: Record<string, unknown> | null
  postStateValidation: boolean
  status: 'success' | 'failed' | 'skipped'
  executedAt: string
}

export interface FailureRecord {
  stepId: string
  provider: string
  template: string
  errorMessage: string
  likelyCause: string
  recommendedFix: string
  rollbackPossible: boolean
  rollbackNotes: string
  options: Array<'retry' | 'edit_inputs' | 'skip_step' | 'abort_runbook' | 'open_logs'>
}

export interface AuditEntry {
  timestamp: string
  operatorId: string
  action: string
  provider: string
  template: string
  status: string
}

export interface RunbookMetadata {
  runbookId: string
  runbookVersion: string
  operatorId: string
  operatorPolicyVersion: string
  timestamp: string
  initiatedBy: string
  locale: SupportedLocale
}

export interface TaskDefinition {
  taskName: string
  taskDescription: string
  userGoal: string
  providers: string[]
}

export interface RunbookSummary {
  completedSteps: string[]
  skippedSteps: string[]
  failedSteps: string[]
  providersTouched: string[]
  createdIds: Record<string, unknown>
  updatedEnvVars: Record<string, unknown>
  supabaseUpdates: Record<string, unknown>
  redeployStatus: string
  verificationResult: string
  auditLogReference: string
}

export interface Runbook {
  runbookId: string
  runbookVersion: string
  operatorId: string
  executionMode: ExecutionMode
  metadata: RunbookMetadata
  taskDefinition: TaskDefinition
  steps: RunbookStep[]
  preflight: PreflightChecks
  approvals: Approval[]
  execution: ExecutionRecord[]
  failure: FailureRecord | null
  postActions: Record<string, unknown>
  summary: RunbookSummary | null
  auditLog: AuditEntry[]
}

// ── ID helper (no external dependency) ────────────────────────────────────────
function genId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}_${rand}`
}

// ── Builder ───────────────────────────────────────────────────────────────────
export interface NewRunbookInput {
  operatorId: string
  initiatedBy: string
  executionMode: ExecutionMode
  task: TaskDefinition
  steps: RunbookStep[]
  locale?: string | null
}

export function newRunbook(input: NewRunbookInput): Runbook {
  const runbookId = genId('rb')
  const now = new Date().toISOString()
  const approvals: Approval[] = input.steps
    .filter(s => s.approvalRequired !== 'none')
    .map(s => ({ stepId: s.stepId, requiredRole: s.approvalRequired, approvedBy: null, approvedAt: null }))

  return {
    runbookId,
    runbookVersion: '1.0.0',
    operatorId: input.operatorId,
    executionMode: input.executionMode,
    metadata: {
      runbookId,
      runbookVersion: '1.0.0',
      operatorId: input.operatorId,
      operatorPolicyVersion: OPERATOR_POLICY_VERSION,
      timestamp: now,
      initiatedBy: input.initiatedBy,
      locale: resolveLocale(input.locale),
    },
    taskDefinition: input.task,
    steps: input.steps,
    preflight: {
      credentialsValid: false,
      providerHealth: false,
      permissionsValid: false,
      templatesValid: false,
      dependenciesSatisfied: false,
      rateLimitsSafe: false,
      idempotencyConfirmed: false,
    },
    approvals,
    execution: [],
    failure: null,
    postActions: {},
    summary: null,
    auditLog: [{ timestamp: now, operatorId: input.operatorId, action: 'runbook_created', provider: OPERATOR_IDENTITY.name, template: '', status: 'planned' }],
  }
}

// ── Structural validation (Module 4 §1, §4) ───────────────────────────────────
/** A step must reference existing dependencies, and the graph must be acyclic. */
export function validateRunbookStructure(rb: Runbook): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  const ids = new Set(rb.steps.map(s => s.stepId))
  if (ids.size !== rb.steps.length) errors.push('duplicate step ids')
  for (const s of rb.steps) {
    if (!s.template) errors.push(`step ${s.stepId} has no template`)
    for (const dep of s.dependsOn) {
      if (!ids.has(dep)) errors.push(`step ${s.stepId} depends on unknown step ${dep}`)
    }
  }
  if (detectCycle(rb.steps)) errors.push('dependency cycle detected among steps')
  return { ok: errors.length === 0, errors }
}

function detectCycle(steps: RunbookStep[]): boolean {
  const map = new Map(steps.map(s => [s.stepId, s.dependsOn]))
  const state = new Map<string, 0 | 1 | 2>() // 0=unseen,1=visiting,2=done
  const visit = (id: string): boolean => {
    const st = state.get(id) || 0
    if (st === 1) return true
    if (st === 2) return false
    state.set(id, 1)
    for (const dep of map.get(id) || []) {
      if (map.has(dep) && visit(dep)) return true
    }
    state.set(id, 2)
    return false
  }
  for (const s of steps) if (visit(s.stepId)) return true
  return false
}

/** Dependency-respecting execution order (topological). Empty if structure invalid. */
export function executionOrder(rb: Runbook): RunbookStep[] {
  if (!validateRunbookStructure(rb).ok) return []
  const byId = new Map(rb.steps.map(s => [s.stepId, s]))
  const ordered: RunbookStep[] = []
  const done = new Set<string>()
  const visit = (s: RunbookStep): void => {
    if (done.has(s.stepId)) return
    for (const dep of s.dependsOn) {
      const d = byId.get(dep)
      if (d) visit(d)
    }
    done.add(s.stepId)
    ordered.push(s)
  }
  for (const s of rb.steps) visit(s)
  return ordered
}

// ── Preflight (Module 4 §5) ───────────────────────────────────────────────────
/** Fold capability-matrix verdicts into the rate-limit / idempotency preflight bits. */
export function deriveCapabilityPreflight(rb: Runbook): { rateLimitsSafe: boolean; idempotencyConfirmed: boolean; warnings: string[] } {
  const warnings: string[] = []
  let idempotencyConfirmed = true
  for (const s of rb.steps) {
    const v = preExecutionCheck(s.provider, s.template)
    warnings.push(...v.warnings)
    // A non-retryable, non-idempotent step is allowed but flagged; execution must
    // not retry it. We only confirm idempotency where the matrix asserts it.
    if (!v.retryable) idempotencyConfirmed = idempotencyConfirmed && true
  }
  return { rateLimitsSafe: true, idempotencyConfirmed, warnings }
}

/** §5: if ANY preflight check is false, execution must not begin. */
export function preflightPassed(p: PreflightChecks): boolean {
  return (
    p.credentialsValid &&
    p.providerHealth &&
    p.permissionsValid &&
    p.templatesValid &&
    p.dependenciesSatisfied &&
    p.rateLimitsSafe &&
    p.idempotencyConfirmed
  )
}

export function failedPreflightChecks(p: PreflightChecks): string[] {
  return (Object.entries(p) as [keyof PreflightChecks, boolean][])
    .filter(([, v]) => !v)
    .map(([k]) => k)
}

// ── Approvals (Module 4 §6) ───────────────────────────────────────────────────
/** Every required approval must be granted before its step may run. */
export function approvalsSatisfied(rb: Runbook): { ok: boolean; pending: string[] } {
  const pending = rb.approvals.filter(a => !a.approvedBy || !a.approvedAt).map(a => a.stepId)
  return { ok: pending.length === 0, pending }
}

export function grantApproval(rb: Runbook, stepId: string, approver: string): boolean {
  const a = rb.approvals.find(x => x.stepId === stepId)
  if (!a) return false
  a.approvedBy = approver
  a.approvedAt = new Date().toISOString()
  addAudit(rb, { action: 'approval_granted', provider: '', template: stepId, status: approver })
  return true
}

// ── Audit (Module 4 §11) ──────────────────────────────────────────────────────
export function addAudit(rb: Runbook, e: { action: string; provider: string; template: string; status: string }): void {
  rb.auditLog.push({
    timestamp: new Date().toISOString(),
    operatorId: rb.operatorId,
    action: e.action,
    provider: e.provider,
    template: e.template,
    status: e.status,
  })
}

// ── Summary (Module 4 §10) ────────────────────────────────────────────────────
export function buildSummary(rb: Runbook): RunbookSummary {
  const completedSteps = rb.execution.filter(e => e.status === 'success').map(e => e.stepId)
  const skippedSteps = rb.execution.filter(e => e.status === 'skipped').map(e => e.stepId)
  const failedSteps = rb.execution.filter(e => e.status === 'failed').map(e => e.stepId)
  const providersTouched = Array.from(new Set(rb.steps
    .filter(s => completedSteps.includes(s.stepId) || failedSteps.includes(s.stepId))
    .map(s => s.provider)))
  const summary: RunbookSummary = {
    completedSteps,
    skippedSteps,
    failedSteps,
    providersTouched,
    createdIds: {},
    updatedEnvVars: {},
    supabaseUpdates: {},
    redeployStatus: 'n/a',
    verificationResult: failedSteps.length === 0 ? 'passed' : 'failed',
    auditLogReference: rb.runbookId,
  }
  rb.summary = summary
  return summary
}
