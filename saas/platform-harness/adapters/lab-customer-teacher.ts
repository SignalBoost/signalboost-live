// saas/platform-harness/adapters/lab-customer-teacher.ts
// Customer LAB teacher Harness ingress. Same construction as lab-customer.ts (production request -> resolved manifest ->
// execution context), with a narrow teacher.invoke authority:
//  * tenant = the customer organization, scopes = organization + the one provider kind + the one training run
//  * maxToolCalls = number of prompts; one concurrency lane per allowed parallel call; a hard deadline
//  * no platform cost budget: the calls run on the customer's own provider key and the provider bills the customer
// Auth and LAB membership (owner/admin) are verified by the caller before this is invoked.
import { createProductionHarnessRequest } from './production.ts'
import { resolveHarnessManifest } from '../core/policy.ts'
import { withHarnessExecutionContext } from '../runtime/execution-context.ts'
import type { HarnessManifest } from '../core/types.ts'

export const LAB_TEACHER_CAPABILITY = 'teacher.invoke' as const

export async function withCustomerLabTeacherHarness<T>(input: {
  organizationId: string
  trainingRunId: string
  providerKind: string
  maxCalls: number
  concurrency: number
  operation: (manifest: HarnessManifest, signal: AbortSignal) => Promise<T>
}): Promise<T> {
  if (!(input.maxCalls > 0)) throw new Error('lab_teacher_harness_limits_invalid')
  const runId = `lab-teacher-${input.trainingRunId}`
  const deadlineMs = 280_000
  const limits = {
    deadlineMs,
    maxToolCalls: input.maxCalls,
    maxConcurrency: Math.max(1, Math.min(8, input.concurrency)),
  }
  const scopes = [`organization:${input.organizationId}`, `provider:${input.providerKind}`, `training-run:${input.trainingRunId}`]
  const request = createProductionHarnessRequest({
    runId,
    objective: 'Generate teacher answers for an authenticated customer LAB training run with the customer\'s own provider key.',
    tenantId: input.organizationId,
    portableId: 'itmounts-lab',
    agentId: 'itmounts-lab-customer-teacher',
    role: 'lab_customer',
    environmentId: 'itmounts-production',
    requestedCapabilities: [LAB_TEACHER_CAPABILITY],
    limits,
  })
  const decision = resolveHarnessManifest(request, {
    manifestRef: `host://lab-customer-teacher/${input.organizationId}/${input.trainingRunId}`,
    verified: true,
    verifiedBy: 'host',
    environments: ['production'],
    capabilities: [{ id: LAB_TEACHER_CAPABILITY, environments: ['production'], mutating: true, risk: 'consequential', scopes }],
    limits,
  })
  if (decision.allowed === false) throw new Error(`lab_teacher_harness_denied:${decision.reasons.join(',')}`)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('harness_deadline_exceeded'), deadlineMs)
  try {
    return await withHarnessExecutionContext(decision.manifest, controller.signal,
      () => input.operation(decision.manifest, controller.signal))
  } finally { clearTimeout(timer) }
}
