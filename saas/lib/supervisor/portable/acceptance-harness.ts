// saas/lib/supervisor/portable/acceptance-harness.ts
//
// THE ACCEPTANCE HARNESS — item 7 of the integration guide's LIVE checklist.
//
// Item 7 asks the buyer to prove, in their own staging environment, that a real incident
// travels the whole path: a safe step executes, a dangerous step PAUSES instead of running,
// the right approver is notified through their channel, and the audit trail lands in their
// SIEM. Until now the guide described that run in prose and shipped nothing to perform it,
// so "we ran the acceptance test" meant whatever each buyer decided it meant, and a failure
// looked identical to nobody having tried.
//
// This runs that scenario against the buyer's OWN HostContext — their vault, their sink,
// their approver directory, their branding — and returns a structured result naming exactly
// which of the five guarantees held. It asserts nothing and prints nothing; the caller
// decides what a failure means, so it works equally in a test, a CI job, or a deployment
// smoke check.
//
// WHAT IT DELIBERATELY DOES NOT DO: no network, no provider calls, no real repair. The
// dangerous step must pause, so nothing consequential can execute by design; the safe step
// runs through an injected runner the caller supplies. A harness that could damage a
// buyer's environment would never be run twice.
//
// Host-agnostic: names no platform, reads no environment, imports only the portable's own
// boundary and executor contracts. Enforced by tests/supervisorPortableHostContext.node.test.ts.

import type { HostContext, PortableNotification } from './host-context.ts'
import { createSupervisorDispatcher } from '../executors/create-supervisor-dispatcher.ts'
import { InMemoryDispatchStore } from '../executors/dispatch-store.ts'
import type { DispatchAuditEvent } from '../executors/executor-types.ts'

/** One guarantee the acceptance run checks. `passed: false` always carries a `detail`. */
export interface AcceptanceCheck {
  id:
    | 'safe_step_executed'
    | 'dangerous_step_paused'
    | 'approver_notified'
    | 'buyer_branding_used'
    | 'audit_trail_emitted'
  title: string
  passed: boolean
  detail: string
}

export interface AcceptanceResult {
  schemaVersion: 'self-healing-acceptance-v1'
  passed: boolean
  checks: readonly AcceptanceCheck[]
  /** Everything the buyer's sink received — inspect these to confirm routing and wording. */
  notifications: readonly PortableNotification[]
  /** Everything that would have reached their SIEM. */
  auditEvents: readonly DispatchAuditEvent[]
  /** One line per check, ready to paste into an acceptance record. */
  summary: string
}

export interface AcceptanceOptions {
  /**
   * The buyer's boundary — the same object they pass to createSupervisorDispatcher in
   * production. This is the point of the harness: it exercises THEIR wiring, not a mock.
   */
  host: HostContext
  /**
   * Stands in for the provider call the safe step would make. Defaults to a no-op success,
   * which keeps the run entirely offline. Supply one only if you want the safe step to
   * reach a real read-only endpoint in staging.
   */
  safeStepRunner?: () => Promise<{ ok: boolean; summary: string }>
  /**
   * Which danger category the consequential step should trip. Use this to prove EACH
   * category routes to the approvers you expect — run the harness once per category.
   * Defaults to 'destructive'.
   */
  dangerousCategory?: PortableNotification['category']
}

const SCHEMA = 'self-healing-acceptance-v1' as const

function incident(id: string) {
  return {
    incidentId: id,
    provider: 'acceptance',
    environment: 'sandbox',
    severity: 'warning',
    detectedAt: new Date().toISOString(),
    source: 'api',
    errorMessage: 'Acceptance rehearsal incident — not a real failure.',
    evidence: [{ evidenceId: `${id}-EV`, type: 'log', capturedAt: new Date().toISOString(), summary: 'synthetic' }],
    metadata: {},
  }
}

function plan(incidentId: string, steps: unknown[]) {
  return {
    planId: `${incidentId}-PLAN`,
    incidentId,
    diagnosis: 'Acceptance rehearsal plan.',
    confidenceScore: 100,
    requiresBrowser: false,
    riskLevel: 'low',
    targetProvider: 'acceptance',
    targetEnvironment: 'sandbox',
    steps,
    // The plan schema requires at least one verification step — a repair that cannot be
    // checked afterwards is not a repair. A read is the right one here: it proves the
    // verification path runs without touching anything.
    verificationSteps: [{ stepId: 'verify-read', action: 'verify', description: 'Confirm status after the rehearsal.', protectedAction: false, parameters: { resource: 'status' } }],
    generatedAt: new Date().toISOString(),
    schemaVersion: 'supervisor-plan-v1',
  }
}

/**
 * Run the guide's §6 item-7 scenario against the buyer's own HostContext.
 *
 * Never throws: any unexpected error becomes a failed check, because a harness that blows up
 * tells the buyer less than one that reports which guarantee broke.
 */
export async function runAcceptanceScenario(options: AcceptanceOptions): Promise<AcceptanceResult> {
  const notifications: PortableNotification[] = []
  const auditEvents: DispatchAuditEvent[] = []
  const category = options.dangerousCategory ?? 'destructive'

  // Wrap the buyer's sink so the harness can observe delivery without replacing it — their
  // real channel still receives everything, which is what makes this an acceptance test
  // rather than a simulation.
  //
  // ORDER IS LOAD-BEARING: record the notification only AFTER their sink accepts it. The
  // obvious version records first and then delivers, which reports "approver notified" for a
  // channel that threw — the harness would go green while nobody was actually reachable, on
  // the one control a buyer most needs to trust. Failures are collected rather than raised,
  // because createEnterpriseNotifier swallows them and would otherwise hide the cause.
  const deliveryFailures: string[] = []
  const observedHost: HostContext = {
    ...options.host,
    notifications: {
      notify: async n => {
        try {
          await options.host.notifications.notify(n)
        } catch (error) {
          deliveryFailures.push(error instanceof Error ? error.message : 'sink threw')
          throw error
        }
        notifications.push(n)
      },
    },
  }

  const dispatcher = createSupervisorDispatcher({
    host: observedHost,
    audit: { write: event => { auditEvents.push(event) } },
    dispatchStore: new InMemoryDispatchStore(),
    apiRunner: options.safeStepRunner
      ? async () => options.safeStepRunner!()
      : async () => ({ ok: true, summary: 'acceptance no-op' }),
  })

  const incidentId = `ACCEPT-${Date.now()}`
  const safeStep = { stepId: 'safe-read', action: 'read', description: 'Read status (safe).', protectedAction: false, parameters: { resource: 'status' } }
  // The step must be classified dangerous by the portable's OWN danger policy — setting a
  // flag on the fixture would prove nothing, because a buyer's real plans do not carry one.
  // These descriptions are written to trip api-danger-policy.ts for each category, so the
  // harness exercises the same classification path a real incident does.
  const DANGEROUS_DESCRIPTION: Record<PortableNotification['category'], string> = {
    destructive: 'Delete the stale deployment (rehearsal — must pause, never executes).',
    financial: 'Raise the billing plan spend limit (rehearsal — must pause, never executes).',
    credential_security: 'Rotate the provider api-key credential (rehearsal — must pause, never executes).',
  }
  const dangerousStep = { stepId: 'dangerous-step', action: 'api_request', description: DANGEROUS_DESCRIPTION[category], protectedAction: true, parameters: {} }

  let result: { status?: string; executedStepIds?: string[] } = {}
  let dispatchError = ''
  try {
    result = await dispatcher.dispatch({
      incident: incident(incidentId) as never,
      plan: plan(incidentId, [safeStep, dangerousStep]) as never,
      policyDecision: { outcome: 'approved', reason: 'acceptance rehearsal', evaluatedAt: new Date().toISOString(), policyVersion: 'acceptance', approvedStepIds: ['safe-read', 'dangerous-step'] } as never,
      approvedStepIds: ['safe-read', 'dangerous-step'],
      executionContext: { executionId: `${incidentId}-EXEC`, metadata: {} },
      dispatchId: `${incidentId}-DISPATCH`,
      requestedExecutorKind: 'api',
    })
  } catch (error) {
    dispatchError = error instanceof Error ? error.message : 'dispatch threw'
  }

  const executed = result.executedStepIds ?? []
  const approvalRequests = notifications.filter(n => n.kind === 'approval_required')
  const branding = options.host.branding?.productName ?? ''

  const checks: AcceptanceCheck[] = [
    {
      id: 'safe_step_executed',
      title: 'A safe step executes without asking anyone',
      passed: executed.includes('safe-read'),
      detail: dispatchError
        ? `dispatch failed: ${dispatchError}`
        : executed.includes('safe-read')
          ? 'the read step ran'
          : `the read step did not run (executed: ${executed.join(', ') || 'none'})`,
    },
    {
      id: 'dangerous_step_paused',
      title: 'A consequential step pauses instead of executing',
      passed: !executed.includes('dangerous-step'),
      detail: executed.includes('dangerous-step')
        ? 'FAILED: the consequential step EXECUTED. Do not deploy — approval gating is not in effect.'
        : 'the consequential step did not execute',
    },
    {
      id: 'approver_notified',
      title: 'The right approver is notified through your channel',
      passed: approvalRequests.length > 0 && approvalRequests.every(n => !!n.recipient?.address) && approvalRequests.every(n => n.category === category),
      detail: approvalRequests.length === 0
        ? deliveryFailures.length > 0
          ? `your NotificationSink rejected delivery: ${[...new Set(deliveryFailures)].join('; ')}`
          : 'no approval request reached your sink — check ApproverDirectory and NotificationSink'
        : approvalRequests.some(n => n.category !== category)
          ? `wrong category routed: expected ${category}, saw ${[...new Set(approvalRequests.map(n => n.category))].join(', ')}`
          : `${approvalRequests.length} request(s) to: ${approvalRequests.map(n => n.recipient?.address ?? '(unaddressed)').join(', ')}`,
    },
    {
      id: 'buyer_branding_used',
      title: 'Notifications carry your product name, not the vendor\'s',
      passed: approvalRequests.length > 0 && !!branding && approvalRequests.every(n => n.title.includes(branding)),
      detail: !branding
        ? 'no productName configured in HostBranding'
        : approvalRequests.length === 0
          ? 'no notification to inspect'
          : `every request names "${branding}"`,
    },
    {
      id: 'audit_trail_emitted',
      title: 'The run produces an audit trail for your SIEM',
      passed: auditEvents.length > 0,
      detail: auditEvents.length === 0
        ? 'no audit events were emitted'
        : `${auditEvents.length} event(s): ${[...new Set(auditEvents.map(e => e.eventType))].join(', ')}`,
    },
  ]

  const passed = checks.every(c => c.passed)
  const summary = [
    `Self-Healing Supervisor acceptance: ${passed ? 'PASSED' : 'FAILED'}`,
    ...checks.map(c => `  [${c.passed ? 'PASS' : 'FAIL'}] ${c.title} — ${c.detail}`),
  ].join('\n')

  return Object.freeze({
    schemaVersion: SCHEMA,
    passed,
    checks: Object.freeze(checks),
    notifications: Object.freeze(notifications),
    auditEvents: Object.freeze(auditEvents),
    summary,
  })
}
