// saas/console-core/operator/safetyPolicy.ts
//
// MODULE 6 — SAFETY POLICY (SignalBoost AI Operator)
//
// The mandatory enforcement gate. These rules OVERRIDE user instructions,
// runbooks, and templates. Priority: Safety > Governance > Accuracy >
// Auditability > Helpfulness (Module 1 precedence). The Executor (Module 7) must
// call evaluateSafety() and refuse to run on a denied verdict.
//
// Composes: M1 invariants/precedence, M2 template approval + permission, M3
// capability/destructive checks, M4 preflight. No secrets are ever read or
// returned here — secret injection is the Executor's job, behind this gate.

import { OPERATOR_INVARIANTS, OPERATOR_POLICY_VERSION, resolvePrecedence } from './principles'
import {
  requiredApproval,
  permits,
  type GovernedTemplate,
  type ApprovalRequirement,
  type PermissionPolicy,
} from './templates'
import { preExecutionCheck } from './capabilityMatrix'
import {
  preflightPassed,
  failedPreflightChecks,
  type PreflightChecks,
  type ExecutionMode,
} from './runbook'

// ── Deadman / timeout budgets (Module 6 §15) ──────────────────────────────────
export const STEP_TIMEOUT_MS = 60_000        // a single step may not exceed this
export const RUNBOOK_TIMEOUT_MS = 240_000    // whole runbook budget (matches host maxDuration headroom)
export function isTimedOut(startedAtMs: number, budgetMs: number, now: number = Date.now()): boolean {
  return now - startedAtMs > budgetMs
}

// ── Inputs / verdict ──────────────────────────────────────────────────────────
export interface SafetyInput {
  /** The governed template for the action, or null if none exists. */
  template: GovernedTemplate | null
  providerId: string
  actionId: string
  viewerRole: PermissionPolicy | string
  executionMode: ExecutionMode
  approvalGranted: boolean
  approverRole?: PermissionPolicy | string
  /** Preflight result; omit in planning, required before execution. */
  preflight?: PreflightChecks
}

export interface SafetyVerdict {
  allowed: boolean
  mode: ExecutionMode
  requiresApproval: ApprovalRequirement
  requiresDestructiveConfirmation: boolean
  requiresSimulationFirst: boolean
  rollbackPossible: boolean
  blockers: string[]
  warnings: string[]
  /** Short precedence-resolution notes (which value won where). */
  precedenceTrace: string[]
  policyVersion: string
}

function approvalSufficient(
  required: ApprovalRequirement,
  granted: boolean,
  approverRole: PermissionPolicy | string | undefined,
): boolean {
  if (required === 'none') return true
  if (!granted) return false
  return permits(required as PermissionPolicy, approverRole || 'user')
}

// ── The gate ──────────────────────────────────────────────────────────────────
export function evaluateSafety(input: SafetyInput): SafetyVerdict {
  const blockers: string[] = []
  const warnings: string[] = []
  const precedenceTrace: string[] = []
  const isSimulation = input.executionMode === 'simulation'

  // (1) Template-only execution (§1). Most fundamental — no template, full stop.
  if (!input.template) {
    blockers.push(`No approved template for ${input.providerId}.${input.actionId} — operator must stop and report the missing template.`)
    // Nothing else can be safely evaluated without a contract.
    return {
      allowed: false,
      mode: input.executionMode,
      requiresApproval: 'none',
      requiresDestructiveConfirmation: false,
      requiresSimulationFirst: false,
      rollbackPossible: false,
      blockers,
      warnings,
      precedenceTrace: ['safety: missing template blocks all execution'],
      policyVersion: OPERATOR_POLICY_VERSION,
    }
  }
  const template = input.template

  // (2) Capability enforcement (§13) + destructive analysis (§4).
  const cap = preExecutionCheck(input.providerId, input.actionId)
  warnings.push(...cap.warnings)
  const requiresDestructiveConfirmation = cap.destructive

  // (3) Least privilege / permission policy (§2).
  if (!permits(template.permissionPolicy, input.viewerRole)) {
    blockers.push(`Insufficient role: action requires "${template.permissionPolicy}", caller is "${String(input.viewerRole)}".`)
    precedenceTrace.push(resolvePrecedence('governance', 'helpfulness') + ': permission gate over helpfulness')
  }

  // (4) Risk-based approval (§3) + no destructive without approval (§4).
  const approval = requiredApproval(template)
  const haveApproval = approvalSufficient(approval, input.approvalGranted, input.approverRole)

  if (isSimulation) {
    // §12: simulation is safe by default — it makes no provider calls. Approval and
    // destructive confirmation are NOT required to simulate, but we surface what
    // execution WOULD require so the preview is honest.
    if (approval !== 'none' && !haveApproval) warnings.push(`Execution would require ${approval} approval.`)
    if (requiresDestructiveConfirmation) warnings.push('Execution would require explicit destructive confirmation.')
  } else {
    if (approval !== 'none' && !haveApproval) {
      blockers.push(`Missing ${approval} approval for a ${template.riskLevel}-risk action.`)
      precedenceTrace.push('governance: approval requirement over helpfulness')
    }
    if (requiresDestructiveConfirmation && !haveApproval) {
      blockers.push('Destructive action requires explicit approval and an irreversibility warning — never auto-run.')
      precedenceTrace.push('safety: destructive action blocked without confirmation')
    }
  }

  // (5) Mandatory preflight before execution (§5).
  if (!isSimulation) {
    if (!input.preflight) {
      blockers.push('Preflight checks were not run — execution must not begin.')
      precedenceTrace.push('safety: preflight required before execution')
    } else if (!preflightPassed(input.preflight)) {
      blockers.push(`Preflight failed: ${failedPreflightChecks(input.preflight).join(', ')}.`)
      precedenceTrace.push('safety: failed preflight blocks execution')
    }
  }

  // (6) Simulation-first advisory for high/critical risk (§12).
  const requiresSimulationFirst = template.riskLevel === 'high' || template.riskLevel === 'critical'
  if (requiresSimulationFirst && !isSimulation) {
    warnings.push(`High/critical risk — simulate before executing where possible.`)
  }

  // (7) Invariant assertions (§14, §17) — these are always-true guarantees the
  // executor must uphold; surfaced as warnings if a caller somehow disables them.
  if (!OPERATOR_INVARIANTS.noDirectProviderAccess) warnings.push('INVARIANT BREACH: direct provider access must never be enabled.')
  if (!OPERATOR_INVARIANTS.noHallucinatedCapabilities) warnings.push('INVARIANT BREACH: fabricated provider behavior must never be enabled.')

  return {
    allowed: blockers.length === 0,
    mode: input.executionMode,
    requiresApproval: approval,
    requiresDestructiveConfirmation,
    requiresSimulationFirst,
    rollbackPossible: cap.rollbackPossible,
    blockers,
    warnings,
    precedenceTrace,
    policyVersion: OPERATOR_POLICY_VERSION,
  }
}

// ── Post-state validation gate (Module 6 §6) ──────────────────────────────────
// A step may be marked success ONLY when post-state validation passes. The
// executor calls this after the provider responds; a false result must produce a
// Failure Card, never a silent pass.
export function postStatePassed(checks: { providerApplied: boolean; idsMatch: boolean; noPartialState: boolean; noDrift: boolean }): boolean {
  return checks.providerApplied && checks.idsMatch && checks.noPartialState && checks.noDrift
}

// ── Cross-provider consistency (Module 6 §7) ──────────────────────────────────
export function crossProviderConsistent(states: Array<{ provider: string; inSync: boolean }>): { ok: boolean; outOfSync: string[] } {
  const outOfSync = states.filter(s => !s.inSync).map(s => s.provider)
  return { ok: outOfSync.length === 0, outOfSync }
}
