// saas/console-core/operator/index.ts
//
// MODULE 10 — INSTALLATION INSTRUCTIONS (SignalBoost AI Operator)
//
// The assembly point. Re-exports Modules 1–9, verifies the installation is whole,
// gates Operator Mode on that verification, and exposes createOperator(host) — the
// single bound entry point the host wires once. Import everything from here:
//   import { createOperator } from '@/console-core/operator'

export * from './principles'
export * from './templates'
export * from './capabilityMatrix'
export * from './runbook'
export * from './failureCard'
export * from './safetyPolicy'
export * from './executor'
export * from './stateMachine'
export * from './persona'

import { OPERATOR_POLICY_VERSION, CORE_CONTRACT } from './principles'
import { lintTemplate } from './templates'
import { CAPABILITY_MATRIX } from './capabilityMatrix'
import { newRunbook, type Runbook, type NewRunbookInput } from './runbook'
import { buildFailureCard, type FailureCard, type BuildFailureCardInput } from './failureCard'
import { evaluateSafety, type SafetyInput, type SafetyVerdict } from './safetyPolicy'
import { execute, type ExecutorHost, type ExecuteRequest, type ExecuteResult } from './executor'
import { TRANSITIONS, OperatorMachine } from './stateMachine'
import { PERSONA_CONTRACT, renderPersonaPrompt } from './persona'

// ── Module manifest (Module 10 §4 required order) ─────────────────────────────
export interface ModuleStatus { id: number; name: string; loaded: boolean }

const MODULE_PROBES: Array<{ id: number; name: string; present: () => boolean }> = [
  { id: 1,  name: 'Core Principles',        present: () => typeof CORE_CONTRACT === 'string' && CORE_CONTRACT.length > 0 },
  { id: 2,  name: 'Provider Templates',     present: () => typeof lintTemplate === 'function' },
  { id: 3,  name: 'Capability Matrix',      present: () => !!CAPABILITY_MATRIX && Object.keys(CAPABILITY_MATRIX).length > 0 },
  { id: 4,  name: 'Runbook Template',       present: () => typeof newRunbook === 'function' },
  { id: 5,  name: 'Failure Card',           present: () => typeof buildFailureCard === 'function' },
  { id: 6,  name: 'Safety Policy',          present: () => typeof evaluateSafety === 'function' },
  { id: 7,  name: 'Executor Architecture',  present: () => typeof execute === 'function' },
  { id: 8,  name: 'State Machine',          present: () => !!TRANSITIONS && typeof OperatorMachine === 'function' },
  { id: 9,  name: 'Persona Contract',       present: () => !!PERSONA_CONTRACT && typeof renderPersonaPrompt === 'function' },
  { id: 10, name: 'Installation',           present: () => true },
]

export const MODULE_MANIFEST: ReadonlyArray<{ id: number; name: string }> =
  MODULE_PROBES.map(({ id, name }) => ({ id, name }))

// ── Verify installation (Module 10 §8) ────────────────────────────────────────
export function verifyInstallation(): { ok: boolean; modules: ModuleStatus[]; missing: string[]; policyVersion: string } {
  const modules: ModuleStatus[] = MODULE_PROBES.map(p => ({ id: p.id, name: p.name, loaded: safeProbe(p.present) }))
  const missing = modules.filter(m => !m.loaded).map(m => `Module ${m.id} — ${m.name}`)
  return { ok: missing.length === 0, modules, missing, policyVersion: OPERATOR_POLICY_VERSION }
}

function safeProbe(fn: () => boolean): boolean {
  try { return !!fn() } catch { return false }
}

// ── Operator Mode gate (Module 10 §5, §7, §9) ─────────────────────────────────
let _operatorMode = false

export function enterOperatorMode(): { ok: boolean; message: string; missing: string[] } {
  const v = verifyInstallation()
  if (!v.ok) {
    _operatorMode = false
    return { ok: false, message: 'Installation incomplete — cannot enter Operator Mode.', missing: v.missing }
  }
  _operatorMode = true
  return { ok: true, message: 'Operator Mode enabled.', missing: [] }
}

export function resetOperator(): { ok: boolean; message: string } {
  _operatorMode = false
  return { ok: true, message: 'Operator reset. Ready for fresh installation.' }
}

export function isOperatorModeEnabled(): boolean {
  return _operatorMode
}

// ── createOperator — the single bound entry point ─────────────────────────────
export interface Operator {
  /** Build a runbook for a multi-step task (Module 4). */
  buildRunbook(input: NewRunbookInput): Runbook
  /** Evaluate the safety gate for one action (Module 6). */
  evaluate(input: SafetyInput): SafetyVerdict
  /** Run one action through the full governed pipeline (Module 7). */
  run(req: ExecuteRequest): Promise<ExecuteResult>
  /** A lifecycle machine bound to a runbook (Module 8). */
  machine(rb: Runbook): OperatorMachine
  /** Build the Failure Card model for a failed step (Module 5). */
  failureCard(input: BuildFailureCardInput): FailureCard
  /** The injectable persona/governance preamble (Module 9). */
  personaPrompt(): string
  /** Self-check the installation (Module 10). */
  verify(): ReturnType<typeof verifyInstallation>
  /** Whether Operator Mode is currently enabled. */
  ready(): boolean
}

export function createOperator(host: ExecutorHost): Operator {
  // Operating requires a complete, verified install (Module 10 §1, §5).
  enterOperatorMode()

  return {
    buildRunbook: (input) => newRunbook(input),
    evaluate: (input) => evaluateSafety(input),
    run: async (req) => {
      if (!_operatorMode) {
        const v = enterOperatorMode()
        if (!v.ok) {
          return {
            ok: false,
            stage: 'template_load',
            normalized: { ok: false, status: 'blocked', errorType: 'operator_not_ready', errorMessage: v.message, rollbackPossible: false },
            failure: null,
          }
        }
      }
      return execute(host, req)
    },
    machine: (rb) => new OperatorMachine(rb),
    failureCard: (input) => buildFailureCard(input),
    personaPrompt: () => renderPersonaPrompt(),
    verify: () => verifyInstallation(),
    ready: () => _operatorMode,
  }
}
