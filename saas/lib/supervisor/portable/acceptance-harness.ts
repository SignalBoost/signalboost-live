// saas/lib/supervisor/portable/acceptance-harness.ts
//
// The acceptance harness proves one exact registered read can execute while an
// unknown consequential provider action pauses, notifies a named approver, and
// emits audit evidence. It is offline by default and never calls a real provider.

import type { HostContext, PortableNotification } from './host-context.ts'
import { createSupervisorDispatcher } from '../executors/create-supervisor-dispatcher.ts'
import { InMemoryDispatchStore } from '../executors/dispatch-store.ts'
import { createApiCapabilityRegistry } from '../executors/api-capability-registry.ts'
import type { DispatchAuditEvent } from '../executors/executor-types.ts'

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
  notifications: readonly PortableNotification[]
  auditEvents: readonly DispatchAuditEvent[]
  summary: string
}

export interface AcceptanceOptions {
  host: HostContext
  /** Optional isolated/staging runner for the exact registered GET capability. */
  safeStepRunner?: () => Promise<{ ok: boolean; summary: string }>
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
    verificationSteps: [{
      stepId: 'verify-read',
      action: 'verify',
      description: 'Confirm status after the rehearsal.',
      protectedAction: false,
      parameters: { actionId: 'read-status', method: 'GET', resource: '/status' },
    }],
    generatedAt: new Date().toISOString(),
    schemaVersion: 'supervisor-plan-v1',
  }
}

export async function runAcceptanceScenario(options: AcceptanceOptions): Promise<AcceptanceResult> {
  const notifications: PortableNotification[] = []
  const auditEvents: DispatchAuditEvent[] = []
  const category = options.dangerousCategory ?? 'destructive'

  const deliveryFailures: string[] = []
  const observedHost: HostContext = {
    ...options.host,
    notifications: {
      notify: async notification => {
        try {
          await options.host.notifications.notify(notification)
        } catch (error) {
          deliveryFailures.push(error instanceof Error ? error.message : 'sink threw')
          throw error
        }
        notifications.push(notification)
      },
    },
  }

  const apiCapabilities = createApiCapabilityRegistry([{
    provider: 'acceptance',
    actionId: 'read-status',
    mutation: false,
    riskClass: 'read_only',
    approvalRequired: false,
    autoExecutable: true,
    methods: ['GET'],
    resourcePattern: /^\/status$/,
    validateParameters: parameters => parameters.actionId === 'read-status'
      && parameters.method === 'GET'
      && parameters.resource === '/status',
    maximumExecutionsPerDispatch: 1,
  }])

  const dispatcher = createSupervisorDispatcher({
    host: observedHost,
    audit: { write: event => { auditEvents.push(event) } },
    dispatchStore: new InMemoryDispatchStore(),
    apiCapabilities,
    apiRunner: options.safeStepRunner
      ? async () => options.safeStepRunner!()
      : async () => ({ ok: true, summary: 'acceptance no-op' }),
  })

  const incidentId = `ACCEPT-${Date.now()}`
  const safeStep = {
    stepId: 'safe-read',
    action: 'read',
    description: 'Read status through the exact registered capability.',
    protectedAction: false,
    parameters: { actionId: 'read-status', method: 'GET', resource: '/status' },
  }
  const DANGEROUS_DESCRIPTION: Record<PortableNotification['category'], string> = {
    destructive: 'Delete the stale deployment (rehearsal — must pause, never executes).',
    financial: 'Raise the billing plan spend limit (rehearsal — must pause, never executes).',
    credential_security: 'Rotate the provider api-key credential (rehearsal — must pause, never executes).',
  }
  const dangerousStep = {
    stepId: 'dangerous-step',
    action: 'api_request',
    description: DANGEROUS_DESCRIPTION[category],
    protectedAction: true,
    parameters: { actionId: `unknown-${category}`, method: 'POST', resource: '/dangerous/rehearsal' },
  }

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
  const approvalRequests = notifications.filter(notification => notification.kind === 'approval_required')
  const branding = options.host.branding?.productName ?? ''

  const checks: AcceptanceCheck[] = [
    {
      id: 'safe_step_executed',
      title: 'An exact registered read executes without asking anyone',
      passed: executed.includes('safe-read'),
      detail: dispatchError
        ? `dispatch failed: ${dispatchError}`
        : executed.includes('safe-read')
          ? 'the registered GET capability ran'
          : `the read step did not run (executed: ${executed.join(', ') || 'none'})`,
    },
    {
      id: 'dangerous_step_paused',
      title: 'An unknown consequential step pauses instead of executing',
      passed: !executed.includes('dangerous-step'),
      detail: executed.includes('dangerous-step')
        ? 'FAILED: the unknown consequential step EXECUTED. Do not deploy.'
        : 'the unknown consequential step did not execute',
    },
    {
      id: 'approver_notified',
      title: 'The right approver is notified through your channel',
      passed: approvalRequests.length > 0 && approvalRequests.every(notification => !!notification.recipient?.address) && approvalRequests.every(notification => notification.category === category),
      detail: approvalRequests.length === 0
        ? deliveryFailures.length > 0
          ? `your NotificationSink rejected delivery: ${[...new Set(deliveryFailures)].join('; ')}`
          : 'no approval request reached your sink — check ApproverDirectory and NotificationSink'
        : approvalRequests.some(notification => notification.category !== category)
          ? `wrong category routed: expected ${category}, saw ${[...new Set(approvalRequests.map(notification => notification.category))].join(', ')}`
          : `${approvalRequests.length} request(s) to: ${approvalRequests.map(notification => notification.recipient?.address ?? '(unaddressed)').join(', ')}`,
    },
    {
      id: 'buyer_branding_used',
      title: 'Notifications carry your product name, not the vendor\'s',
      passed: approvalRequests.length > 0 && !!branding && approvalRequests.every(notification => notification.title.includes(branding)),
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
        : `${auditEvents.length} event(s): ${[...new Set(auditEvents.map(event => event.eventType))].join(', ')}`,
    },
  ]

  const passed = checks.every(check => check.passed)
  const summary = [
    `Self-Healing Supervisor acceptance: ${passed ? 'PASSED' : 'FAILED'}`,
    ...checks.map(check => `  [${check.passed ? 'PASS' : 'FAIL'}] ${check.title} — ${check.detail}`),
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
