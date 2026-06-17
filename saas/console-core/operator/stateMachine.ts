// saas/console-core/operator/stateMachine.ts
//
// MODULE 8 — OPERATOR STATE MACHINE (SignalBoost AI Operator)
//
// The ONLY valid lifecycle for a runbook. The operator is always in exactly one
// state and may never skip states or invent new ones. Beyond the static legal-
// transition map, contextual guards enforce the spec's hard rules:
//   • never PLANNING → EXECUTING (must PREVIEW first)
//   • never skip WAITING_FOR_APPROVAL when approvals are required
//   • never enter EXECUTING unless preflight passed
//   • never re-enter EXECUTING from FAILED except via PAUSED (retry)
//   • never enter COMPLETED unless every step succeeded
//
// Context is derived from the runbook (Module 4) so the machine and the data
// stay in lockstep. State labels expose i18n keys (English fallback) for the
// PREVIEW/status UI; no foreign translations are invented here.

import { approvalsSatisfied, preflightPassed, type Runbook } from './runbook'

export type OperatorState =
  | 'PLANNING' | 'PREVIEW' | 'WAITING_FOR_APPROVAL' | 'EXECUTING'
  | 'PAUSED' | 'FAILED' | 'ABORTED' | 'COMPLETED'

// ── Static legal transitions (frozen — Module 8 §10 immutability) ─────────────
export const TRANSITIONS: Readonly<Record<OperatorState, readonly OperatorState[]>> = Object.freeze({
  PLANNING:             Object.freeze(['PREVIEW', 'FAILED']),
  PREVIEW:              Object.freeze(['WAITING_FOR_APPROVAL', 'EXECUTING', 'ABORTED']),
  WAITING_FOR_APPROVAL: Object.freeze(['EXECUTING', 'ABORTED']),
  EXECUTING:            Object.freeze(['PAUSED', 'FAILED', 'COMPLETED']),
  PAUSED:               Object.freeze(['EXECUTING', 'ABORTED', 'FAILED']),
  FAILED:               Object.freeze(['PAUSED', 'ABORTED']),
  ABORTED:              Object.freeze([]), // terminal
  COMPLETED:            Object.freeze([]), // terminal
}) as Readonly<Record<OperatorState, readonly OperatorState[]>>

export const TERMINAL_STATES: readonly OperatorState[] = Object.freeze(['ABORTED', 'COMPLETED'])

export function isTerminal(state: OperatorState): boolean {
  return TERMINAL_STATES.includes(state)
}

/** Static legality only — ignores context. */
export function canTransition(from: OperatorState, to: OperatorState): boolean {
  return TRANSITIONS[from].includes(to)
}

// ── Decision context derived from the runbook ─────────────────────────────────
export interface TransitionContext {
  approvalsRequired: boolean
  approvalsGranted: boolean
  preflightOk: boolean
  allStepsSucceeded: boolean
  anyStepFailed: boolean
}

export function deriveContext(rb: Runbook): TransitionContext {
  const total = rb.steps.length
  const succeeded = rb.execution.filter(e => e.status === 'success').length
  const anyStepFailed = rb.execution.some(e => e.status === 'failed')
  return {
    approvalsRequired: rb.approvals.length > 0,
    approvalsGranted: approvalsSatisfied(rb).ok,
    preflightOk: preflightPassed(rb.preflight),
    allStepsSucceeded: total > 0 && succeeded === total && !anyStepFailed,
    anyStepFailed,
  }
}

// ── Guarded transition ────────────────────────────────────────────────────────
export interface TransitionResult {
  ok: boolean
  state: OperatorState   // resulting state (unchanged on reject)
  error?: string
}

export function attemptTransition(
  from: OperatorState,
  to: OperatorState,
  ctx: TransitionContext,
): TransitionResult {
  if (isTerminal(from)) {
    return { ok: false, state: from, error: `${from} is terminal — no further transitions.` }
  }
  if (!canTransition(from, to)) {
    return { ok: false, state: from, error: `Illegal transition ${from} → ${to}.` }
  }

  // Contextual guards (Module 8 §9).
  if (to === 'EXECUTING') {
    if (from === 'PREVIEW' && ctx.approvalsRequired) {
      return { ok: false, state: from, error: 'Approvals are required — must enter WAITING_FOR_APPROVAL first.' }
    }
    if (from === 'WAITING_FOR_APPROVAL' && !ctx.approvalsGranted) {
      return { ok: false, state: from, error: 'Cannot execute: required approvals are not all granted.' }
    }
    if (!ctx.preflightOk) {
      return { ok: false, state: from, error: 'Cannot execute: preflight has not passed.' }
    }
  }
  if (to === 'COMPLETED' && !ctx.allStepsSucceeded) {
    return { ok: false, state: from, error: 'Cannot complete: not every step has succeeded.' }
  }

  return { ok: true, state: to }
}

/** The recommended next state from PLANNING/PREVIEW/etc. given context. */
export function recommendedNext(from: OperatorState, ctx: TransitionContext): OperatorState | null {
  switch (from) {
    case 'PLANNING': return 'PREVIEW'
    case 'PREVIEW': return ctx.approvalsRequired ? 'WAITING_FOR_APPROVAL' : 'EXECUTING'
    case 'WAITING_FOR_APPROVAL': return ctx.approvalsGranted ? 'EXECUTING' : null
    case 'EXECUTING':
      if (ctx.anyStepFailed) return 'FAILED'
      if (ctx.allStepsSucceeded) return 'COMPLETED'
      return null // mid-execution; awaits next step or pause
    case 'FAILED': return 'PAUSED'
    default: return null
  }
}

// ── Optional stateful wrapper ─────────────────────────────────────────────────
export class OperatorMachine {
  private _state: OperatorState = 'PLANNING'
  constructor(private rb: Runbook) {}
  get state(): OperatorState { return this._state }
  context(): TransitionContext { return deriveContext(this.rb) }
  to(target: OperatorState): TransitionResult {
    const res = attemptTransition(this._state, target, this.context())
    if (res.ok) this._state = res.state
    return res
  }
  advance(): TransitionResult | null {
    const next = recommendedNext(this._state, this.context())
    return next ? this.to(next) : null
  }
}

// ── State labels for the PREVIEW/status UI (i18n keys, English fallback) ───────
export const STATE_LABEL_KEYS: Record<OperatorState, { key: string; en: string }> = {
  PLANNING:             { key: 'hub.state.planning', en: 'Planning' },
  PREVIEW:              { key: 'hub.state.preview', en: 'Preview' },
  WAITING_FOR_APPROVAL: { key: 'hub.state.waiting', en: 'Waiting for approval' },
  EXECUTING:            { key: 'hub.state.executing', en: 'Executing' },
  PAUSED:               { key: 'hub.state.paused', en: 'Paused' },
  FAILED:               { key: 'hub.state.failed', en: 'Failed' },
  ABORTED:              { key: 'hub.state.aborted', en: 'Aborted' },
  COMPLETED:            { key: 'hub.state.completed', en: 'Completed' },
}
