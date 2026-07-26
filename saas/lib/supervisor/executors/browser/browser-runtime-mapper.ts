// saas/lib/supervisor/executors/browser/browser-runtime-mapper.ts
import type { BrowserTask, BrowserTaskStep } from '../../../browser-runtime/contracts.ts'
import type { SupervisorIncident } from '../../incident-schema.ts'
import type { RepairPlan, RepairStep } from '../../repair-plan-schema.ts'
import type { BrowserRuntimeApprovalRequirements, BrowserRuntimeStepMapping, BrowserRuntimeVerificationRequirements } from './browser-runtime-dry-run-schema.ts'

export const BROWSER_RUNTIME_DRY_RUN_ADAPTER_ID = 'portable.browser-runtime.dry-run.v1'

function selectorString(step: RepairStep): string { const t = step.parameters.target as Record<string, unknown>; if (t.role && t.name) return `role=${String(t.role)}[name=${String(t.name)}]`; if (t.label) return `label=${String(t.label)}`; if (t.testId) return `testId=${String(t.testId)}`; if (t.text) return `text=${String(t.text)}`; return `css=${String(t.css)}` }
function fillRef(step: RepairStep): string { const p = step.parameters as Record<string, unknown>; for (const key of ['secretRef','tokenRef','credentialRef','valueRef']) if (typeof p[key] === 'string') return String(p[key]); return `literal://${Buffer.from(String(p.value ?? ''), 'utf8').toString('base64url')}` }
function evidenceKind(step: BrowserTaskStep) { if (step.kind === 'navigate') return 'navigation' as const; if (step.kind === 'screenshot') return 'screenshot' as const; if (step.kind === 'checkpoint') return 'checkpoint' as const; return 'interaction' as const }
export function mapSupervisorStepsToBrowserRuntimeTask(input: { incident: SupervisorIncident; plan: RepairPlan; approvedSteps: RepairStep[]; targetOrigin: string; dispatchId: string; createdAt: string }): { browserTask: BrowserTask; stepMapping: BrowserRuntimeStepMapping[]; approvalRequirements: BrowserRuntimeApprovalRequirements; verificationRequirements: BrowserRuntimeVerificationRequirements } {
  const steps: BrowserTaskStep[] = []
  for (const step of input.approvedSteps) {
    if (step.action === 'navigate') steps.push({ id: step.stepId, kind: 'navigate', url: String(step.parameters.url) })
    else if (step.action === 'click') steps.push({ id: step.stepId, kind: 'click', selector: selectorString(step) })
    else if (step.action === 'fill') steps.push({ id: step.stepId, kind: 'fill', selector: selectorString(step), valueRef: fillRef(step) })
    else if (step.action === 'select' || step.action === 'read' || step.action === 'verify') { const waitStep: BrowserTaskStep = { id: step.stepId, kind: 'wait_for', selector: selectorString(step) }; if (typeof step.parameters.timeoutMs === 'number') waitStep.timeoutMs = step.parameters.timeoutMs; steps.push(waitStep) }
    else if (step.action === 'screenshot') steps.push({ id: step.stepId, kind: 'screenshot', label: String(step.parameters.label ?? step.stepId) })
    else if (step.action === 'request_approval') steps.push({ id: step.stepId, kind: 'checkpoint', label: step.description, requiresApproval: true })
    else if (step.action === 'stop') steps.push({ id: step.stepId, kind: 'checkpoint', label: step.description, requiresApproval: true })
  }
  const checkpointIndex = steps.findIndex(s => s.kind === 'checkpoint')
  const checkpointStepIds = steps.filter(s => s.kind === 'checkpoint').map(s => s.id)
  const pre = checkpointIndex >= 0 ? steps.slice(0, checkpointIndex).map(s => s.id) : steps.map(s => s.id)
  const post = checkpointIndex >= 0 ? steps.slice(checkpointIndex + 1).map(s => s.id) : []
  const browserTask: BrowserTask = { taskId: `${input.dispatchId}:${input.plan.planId}:dry-run`, incidentId: input.incident.incidentId, provider: input.plan.targetProvider, adapterId: BROWSER_RUNTIME_DRY_RUN_ADAPTER_ID, mode: 'prepare_change', issuedAt: input.createdAt, expiresAt: new Date(Date.parse(input.createdAt) + 15 * 60_000).toISOString(), allowedOrigins: [input.targetOrigin], steps, approvalToken: 'DRY_RUN_NO_RUNTIME_APPROVAL_TOKEN_CREATED', metadata: { dryRunOnly: true, supervisorPolicyApprovalDoesNotGrantRuntimeApproval: true } }
  const approvalRequirements = { supervisorPolicyApproval: { approvedStepIds: input.approvedSteps.map(s => s.stepId), doesNotGrantRuntimeApproval: true as const }, browserRuntimeSignedTaskApproval: { requiredLater: true as const, approvalTokenCreated: false as const }, browserRuntimeContinuationApproval: { requiredForPostCheckpointSteps: post.length > 0, approvalTokenCreated: false as const, checkpointStepIds, postCheckpointStepIds: post }, protectedStepIds: input.approvedSteps.filter(s => s.protectedAction).map(s => s.stepId) }
  const verificationRequirements = { expectedStepCompletionOrder: steps.filter(s => s.kind !== 'checkpoint').map(s => s.id), expectedEvidenceByStepId: Object.fromEntries(steps.map(s => [s.id, evidenceKind(s)])), screenshotStepIds: steps.filter(s => s.kind === 'screenshot').map(s => s.id), finalStateAssertions: input.plan.verificationSteps.map(s => s.expectedResult || s.description), requiredTerminalVerificationStatus: 'verified' as const, approvedOrigins: [input.targetOrigin], checkpointBoundaryExpectations: { checkpointStepIds, preCheckpointStepIds: pre, postCheckpointStepIds: post }, planVerificationStepIds: input.plan.verificationSteps.map(s => s.stepId) }
  return { browserTask, stepMapping: input.approvedSteps.map(s => ({ supervisorStepId: s.stepId, browserRuntimeStepId: s.stepId })), approvalRequirements, verificationRequirements }
}
