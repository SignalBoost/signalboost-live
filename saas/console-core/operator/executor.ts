// saas/console-core/operator/executor.ts
//
// MODULE 7 — EXECUTOR ARCHITECTURE (SignalBoost AI Operator)
//
// The ONLY component allowed to perform real provider actions. Every action runs
// the mandatory, immutable pipeline:
//
//   1 Template Load → 2 Schema Validation → 3 RBAC → 4 Approval →
//   5 Secret Injection → 6 Payload Validation → 7 Capability Enforcement →
//   8 Execution → 9 Post-State Validation → 10 Audit → 11 Normalized Response
//
// Steps 3,4,7 and preflight are enforced via the Module 6 safety gate; 1,2,6 via
// the Module 2 template contract. The executor NEVER calls providers directly —
// the host's runProvider adapter does, behind injected secrets that are never
// logged or returned. On any failed stage it emits a FailureRecord for the
// Module 5 card and STOPS — never auto-retries, never auto-skips.

import { lintTemplate, validatePayload, type GovernedTemplate } from './templates'
import { preExecutionCheck } from './capabilityMatrix'
import { evaluateSafety, postStatePassed } from './safetyPolicy'
import type { ExecutionMode, FailureRecord, AuditEntry } from './runbook'

export type PipelineStage =
  | 'template_load' | 'schema_validation' | 'safety_gate' | 'secret_injection'
  | 'payload_validation' | 'execution' | 'post_state' | 'complete'

export interface NormalizedResponse {
  ok: boolean
  status: 'success' | 'failed' | 'simulated' | 'blocked'
  errorType?: string
  errorMessage?: string
  rollbackPossible: boolean
  rollbackNotes?: string
  providerMetadata?: Record<string, unknown>
}

export interface ExecuteRequest {
  providerId: string
  actionId: string
  input: Record<string, unknown>
  user: { id: string; role: string } | null
  executionMode: ExecutionMode
  approvalGranted: boolean
  approverRole?: string
  preflight?: import('./runbook').PreflightChecks
  rollbackNotes?: string
}

/** Host wiring. The executor depends ONLY on these adapters — no app internals. */
export interface ExecutorHost {
  resolveTemplate(providerId: string, actionId: string): GovernedTemplate | null
  /** Secrets for a provider. NEVER returned to the caller or written to logs. */
  injectSecrets(providerId: string): Promise<Record<string, string> | null>
  /** The single place a real provider call happens. */
  runProvider(
    ctx: { providerId: string; actionId: string; user: { id: string; role: string } | null },
    input: Record<string, unknown>,
    secrets: Record<string, string>,
  ): Promise<{ ok: boolean; data?: unknown; error?: string; metadata?: Record<string, unknown> }>
  audit(entry: AuditEntry): Promise<void>
  /** Optional live post-state probe; defaults to "applied" when omitted. */
  postStateValidate?(
    providerId: string,
    actionId: string,
    response: { ok: boolean; data?: unknown },
  ): Promise<{ providerApplied: boolean; idsMatch: boolean; noPartialState: boolean; noDrift: boolean }>
}

export interface ExecuteResult {
  ok: boolean
  stage: PipelineStage
  normalized: NormalizedResponse
  failure: FailureRecord | null
}

// Non-crypto payload fingerprint — lets audit reference the input without storing
// raw values (which may contain sensitive data).
function payloadHash(input: Record<string, unknown>): string {
  const s = JSON.stringify(input)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return 'h' + (h >>> 0).toString(16)
}

function fail(
  stage: PipelineStage,
  req: ExecuteRequest,
  template: GovernedTemplate | null,
  errorType: string,
  errorMessage: string,
  likelyCause: string,
  recommendedFix: string,
  rollbackPossible: boolean,
  rollbackNotes: string,
): ExecuteResult {
  const failure: FailureRecord = {
    stepId: `${req.providerId}.${req.actionId}`,
    provider: req.providerId,
    template: template ? `${template.provider}.${template.action}` : `${req.providerId}.${req.actionId}`,
    errorMessage,           // verbatim
    likelyCause,
    recommendedFix,
    rollbackPossible,
    rollbackNotes,
    options: rollbackPossible ? ['retry', 'edit_inputs', 'abort_runbook', 'open_logs'] : ['edit_inputs', 'abort_runbook', 'open_logs'],
  }
  return {
    ok: false,
    stage,
    normalized: { ok: false, status: stage === 'safety_gate' ? 'blocked' : 'failed', errorType, errorMessage, rollbackPossible, rollbackNotes },
    failure,
  }
}

// ── The pipeline ──────────────────────────────────────────────────────────────
export async function execute(host: ExecutorHost, req: ExecuteRequest): Promise<ExecuteResult> {
  // 1 — Template Load
  const template = host.resolveTemplate(req.providerId, req.actionId)
  if (!template) {
    return fail('template_load', req, null, 'missing_template',
      `No template for ${req.providerId}.${req.actionId}`,
      'The action has no approved provider template.',
      'Add the provider template before this action can run.',
      false, 'n/a')
  }

  // 2 — Schema Validation (template must lint)
  const lint = lintTemplate(template)
  if (!lint.ok) {
    return fail('schema_validation', req, template, 'invalid_template',
      `Template failed validation: ${lint.errors.join('; ')}`,
      'The template does not satisfy the governed schema.',
      'Fix the template definition and re-lint.',
      false, template.rollbackNotes)
  }

  // 3,4,7 + preflight — Safety gate (RBAC, approval, capability, preflight)
  const verdict = evaluateSafety({
    template,
    providerId: req.providerId,
    actionId: req.actionId,
    viewerRole: req.user?.role ?? 'user',
    executionMode: req.executionMode,
    approvalGranted: req.approvalGranted,
    approverRole: req.approverRole,
    preflight: req.preflight,
  })
  if (!verdict.allowed) {
    return fail('safety_gate', req, template, 'blocked_by_policy',
      verdict.blockers.join(' '),
      'A safety/governance rule blocked this action.',
      verdict.blockers[0] || 'Resolve the blocking condition and retry.',
      verdict.rollbackPossible, template.rollbackNotes)
  }

  // 5 — Secret Injection (never logged, never returned)
  const secrets = await host.injectSecrets(req.providerId)
  if (!secrets) {
    return fail('secret_injection', req, template, 'missing_secret',
      `Required credentials for ${req.providerId} are not configured.`,
      'A secret needed to authenticate the provider is missing.',
      'Add the provider credential to the vault, then retry.',
      verdict.rollbackPossible, template.rollbackNotes)
  }

  // 6 — Payload Validation (required fields, no invented fields, value rules)
  const payload = validatePayload(template, req.input)
  if (!payload.ok) {
    return fail('payload_validation', req, template, 'invalid_payload',
      payload.errors.join('; '),
      'The provided inputs do not satisfy the template.',
      payload.missing.length ? `Provide: ${payload.missing.join(', ')}.` : 'Correct the invalid fields.',
      verdict.rollbackPossible, template.rollbackNotes)
  }

  const cap = preExecutionCheck(req.providerId, req.actionId)

  // 8 — Execution (simulation makes NO provider call)
  if (req.executionMode === 'simulation') {
    await host.audit({
      timestamp: new Date().toISOString(), operatorId: req.user?.id || 'unknown',
      action: `simulate:${req.actionId}`, provider: req.providerId,
      template: `${template.provider}.${template.action}`, status: `simulated:${payloadHash(req.input)}`,
    })
    return {
      ok: true, stage: 'complete',
      normalized: { ok: true, status: 'simulated', rollbackPossible: cap.rollbackPossible, rollbackNotes: template.rollbackNotes, providerMetadata: { simulated: true } },
      failure: null,
    }
  }

  let providerResult: { ok: boolean; data?: unknown; error?: string; metadata?: Record<string, unknown> }
  try {
    providerResult = await host.runProvider(
      { providerId: req.providerId, actionId: req.actionId, user: req.user },
      req.input, secrets,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'provider call threw'
    await host.audit({ timestamp: new Date().toISOString(), operatorId: req.user?.id || 'unknown', action: req.actionId, provider: req.providerId, template: `${template.provider}.${template.action}`, status: `error:${payloadHash(req.input)}` })
    return fail('execution', req, template, 'provider_error', msg,
      'The provider call failed or threw.',
      'Inspect the provider error and retry if the action is idempotent.',
      cap.rollbackPossible, template.rollbackNotes)
  }

  if (!providerResult.ok) {
    await host.audit({ timestamp: new Date().toISOString(), operatorId: req.user?.id || 'unknown', action: req.actionId, provider: req.providerId, template: `${template.provider}.${template.action}`, status: `failed:${payloadHash(req.input)}` })
    return fail('execution', req, template, 'provider_error',
      providerResult.error || 'Provider returned a failure.',  // verbatim
      'The provider rejected the request.',
      'Review the provider error; correct inputs or credentials.',
      cap.rollbackPossible, template.rollbackNotes)
  }

  // 9 — Post-State Validation (success requires it to pass)
  const post = host.postStateValidate
    ? await host.postStateValidate(req.providerId, req.actionId, providerResult)
    : { providerApplied: true, idsMatch: true, noPartialState: true, noDrift: true }
  if (!postStatePassed(post)) {
    await host.audit({ timestamp: new Date().toISOString(), operatorId: req.user?.id || 'unknown', action: req.actionId, provider: req.providerId, template: `${template.provider}.${template.action}`, status: `post_state_failed:${payloadHash(req.input)}` })
    return fail('post_state', req, template, 'post_state_mismatch',
      'Provider responded OK but post-state validation failed (partial state or drift).',
      'The change may not have fully applied.',
      'Inspect provider state; reconcile before continuing.',
      cap.rollbackPossible, template.rollbackNotes)
  }

  // 10 — Audit (success)
  await host.audit({
    timestamp: new Date().toISOString(), operatorId: req.user?.id || 'unknown',
    action: req.actionId, provider: req.providerId,
    template: `${template.provider}.${template.action}`, status: `success:${payloadHash(req.input)}`,
  })

  // 11 — Normalized Response
  return {
    ok: true, stage: 'complete',
    normalized: {
      ok: true, status: 'success',
      rollbackPossible: cap.rollbackPossible, rollbackNotes: template.rollbackNotes,
      providerMetadata: providerResult.metadata || {},
    },
    failure: null,
  }
}
