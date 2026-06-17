// saas/console-core/operator/failureCard.ts
//
// MODULE 5 — FAILURE CARD (SignalBoost AI Operator) — governing logic
//
// The ONLY approved way to communicate a step failure. This portable half decides
// WHAT the card contains and WHICH controls are allowed; the React half
// (components/hub/FailureCard.tsx) renders it through t(). Rules enforced here:
//  • the EXACT provider error is preserved, never paraphrased (§4)
//  • retry is offered only when the action is idempotent/retryable (§8)
//  • skip is offered only when policy permits (§8)
//  • abort + open_logs are always available (§8)
//  • override controls (force_run_step, bypass_template_validation, continue) are
//    shown to admin/owner ONLY (§10)
//  • logs NEVER contain secrets (§9)
//  • generating a card means the operator enters PAUSED (§12)
//
// Localization: this file carries i18n KEYS with English fallbacks only. It never
// invents es/pt/pl/ru text — those values live in /locales/{lang}.json.

import { preExecutionCheck } from './capabilityMatrix'
import type { FailureRecord } from './runbook'

export type FailureAction = 'retry' | 'edit_inputs' | 'skip_step' | 'abort_runbook' | 'open_logs'
export type OverrideAction = 'force_run_step' | 'bypass_template_validation' | 'continue_runbook'
export type ViewerRole = 'user' | 'admin' | 'owner' | string

export interface RawLogs {
  providerRequest?: Record<string, unknown> | null
  providerResponse?: Record<string, unknown> | null
  templatePayload?: Record<string, unknown> | null
  executorMetadata?: Record<string, unknown> | null
  timestamps?: Record<string, unknown> | null
}

export interface FailureCard {
  state: 'PAUSED'
  stepId: string
  stepName: string
  provider: string
  template: string
  /** EXACT provider error — verbatim, never modified or translated (§4). */
  providerError: string
  likelyCause: string
  recommendedFix: string
  rollbackPossible: boolean
  rollbackNotes: string
  availableActions: FailureAction[]
  overrideActions: OverrideAction[]
  logs: RawLogs
}

// ── Secret redaction (§9) ─────────────────────────────────────────────────────
const SECRET_KEY_RE = /(key|secret|token|password|authorization|auth|apikey|api_key|service_role|bearer|cookie|session)/i
const REDACTED = '••••redacted'

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return value
  if (Array.isArray(value)) return value.map(v => redact(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? REDACTED : redact(v, depth + 1)
    }
    return out
  }
  return value
}

export function redactLogs(logs: RawLogs): RawLogs {
  return {
    providerRequest: (redact(logs.providerRequest ?? null) as Record<string, unknown> | null) ?? null,
    providerResponse: (redact(logs.providerResponse ?? null) as Record<string, unknown> | null) ?? null,
    templatePayload: (redact(logs.templatePayload ?? null) as Record<string, unknown> | null) ?? null,
    executorMetadata: (redact(logs.executorMetadata ?? null) as Record<string, unknown> | null) ?? null,
    timestamps: logs.timestamps ?? null, // timestamps carry no secrets
  }
}

// ── Action availability (§8) ──────────────────────────────────────────────────
export interface BuildFailureCardInput {
  record: FailureRecord
  stepName: string
  viewerRole: ViewerRole
  /** Whether policy permits skipping this step. */
  skipAllowed: boolean
  logs?: RawLogs
}

export function buildFailureCard(input: BuildFailureCardInput): FailureCard {
  const { record, viewerRole, skipAllowed } = input
  const verdict = preExecutionCheck(record.provider, record.template)

  const availableActions: FailureAction[] = ['edit_inputs', 'abort_runbook', 'open_logs']
  if (verdict.retryable) availableActions.unshift('retry') // only when idempotent/retryable
  if (skipAllowed) availableActions.push('skip_step')

  const isPrivileged = viewerRole === 'admin' || viewerRole === 'owner'
  const overrideActions: OverrideAction[] = isPrivileged
    ? ['force_run_step', 'bypass_template_validation', 'continue_runbook']
    : []

  return {
    state: 'PAUSED',
    stepId: record.stepId,
    stepName: input.stepName,
    provider: record.provider,
    template: record.template,
    providerError: record.errorMessage, // verbatim
    likelyCause: record.likelyCause,
    recommendedFix: record.recommendedFix,
    rollbackPossible: record.rollbackPossible,
    rollbackNotes: record.rollbackNotes,
    availableActions: dedupe(availableActions),
    overrideActions,
    logs: redactLogs(input.logs ?? {}),
  }
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

// ── i18n key map (English fallbacks only; never invent foreign text) ──────────
export const FAILURE_CARD_KEYS = {
  header: { key: 'hub.failure.header', en: 'Runbook Stopped — Step Failed' },
  summaryLabel: { key: 'hub.failure.summary', en: 'What failed' },
  providerErrorLabel: { key: 'hub.failure.providerError', en: 'Provider error' },
  likelyCauseLabel: { key: 'hub.failure.likelyCause', en: 'Likely cause' },
  recommendedFixLabel: { key: 'hub.failure.recommendedFix', en: 'Recommended fix' },
  rollbackLabel: { key: 'hub.failure.rollback', en: 'Rollback' },
  rollbackYes: { key: 'hub.failure.rollback.possible', en: 'Rollback is possible' },
  rollbackNo: { key: 'hub.failure.rollback.impossible', en: 'No rollback available' },
  logsLabel: { key: 'hub.failure.logs', en: 'Logs & diagnostics' },
  overrideLabel: { key: 'hub.failure.override', en: 'Human override' },
  action: {
    retry: { key: 'hub.failure.action.retry', en: 'Retry' },
    edit_inputs: { key: 'hub.failure.action.edit', en: 'Edit inputs' },
    skip_step: { key: 'hub.failure.action.skip', en: 'Skip step' },
    abort_runbook: { key: 'hub.failure.action.abort', en: 'Abort runbook' },
    open_logs: { key: 'hub.failure.action.logs', en: 'Open logs' },
  },
  override: {
    force_run_step: { key: 'hub.failure.override.force', en: 'Force run step' },
    bypass_template_validation: { key: 'hub.failure.override.bypass', en: 'Bypass validation' },
    continue_runbook: { key: 'hub.failure.override.continue', en: 'Continue runbook' },
  },
} as const
