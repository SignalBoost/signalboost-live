import { incidentSchema, type SupervisorIncident } from '../../incident-schema.ts'
import { repairPlanSchema, type RepairPlan } from '../../repair-plan-schema.ts'
import type { DispatchMetadata, ExecutorKind } from '../executor-types.ts'
import { BrowserRuntimeAdapterError } from './browser-runtime-adapter-errors.ts'
import { validateBrowserRuntimeCompatibility } from './browser-runtime-compatibility.ts'
import { browserRuntimeDryRunPackageSchema, browserRuntimeDryRunSchemaVersion, hashCanonical, type BrowserRuntimeDryRunPackage } from './browser-runtime-dry-run-schema.ts'
import { mapSupervisorStepsToBrowserRuntimeTask } from './browser-runtime-mapper.ts'

export interface BrowserRuntimeDryRunAdapterInput { incident: SupervisorIncident; repairPlan: RepairPlan; approvedStepIds: string[]; dispatch: DispatchMetadata; requestedExecutorKind: ExecutorKind; clock: () => Date; makeId?: (parts: Record<string, unknown>) => string }
export class BrowserRuntimeDryRunAdapter {
  createPackage(input: BrowserRuntimeDryRunAdapterInput): BrowserRuntimeDryRunPackage {
    const incident = incidentSchema.parse(input.incident)
    const plan = repairPlanSchema.parse(input.repairPlan)
    if (input.requestedExecutorKind !== 'browser' || input.dispatch.requestedExecutorKind !== 'browser') throw new BrowserRuntimeAdapterError('wrong_executor_kind', 'Browser Runtime adapter accepts only browser executor dispatches')
    if (incident.incidentId !== plan.incidentId) throw new BrowserRuntimeAdapterError('incident_mismatch', 'Incident and repair plan identity mismatch')
    const createdAt = input.clock().toISOString()
    const { targetOrigin, approvedSteps } = validateBrowserRuntimeCompatibility(plan, input.approvedStepIds)
    const mapped = mapSupervisorStepsToBrowserRuntimeTask({ incident, plan, approvedSteps, targetOrigin, dispatchId: input.dispatch.dispatchId, createdAt })
    const fingerprintInput = { incidentId: incident.incidentId, planId: plan.planId, targetOrigin, approvedStepIds: input.approvedStepIds, browserTask: mapped.browserTask, approvalRequirements: mapped.approvalRequirements, verificationRequirements: mapped.verificationRequirements, schemaVersion: browserRuntimeDryRunSchemaVersion }
    const packageFingerprint = hashCanonical(fingerprintInput)
    const packageId = input.makeId ? input.makeId(fingerprintInput) : `browser-dry-run-${packageFingerprint.slice(0, 24)}`
    const pkg: BrowserRuntimeDryRunPackage = { packageId, dispatchId: input.dispatch.dispatchId, incidentId: incident.incidentId, planId: plan.planId, provider: plan.targetProvider, targetEnvironment: plan.targetEnvironment, targetOrigin, approvedStepIds: [...input.approvedStepIds], browserTask: mapped.browserTask, stepMapping: mapped.stepMapping, approvalRequirements: mapped.approvalRequirements, verificationRequirements: mapped.verificationRequirements, packageFingerprint, createdAt, schemaVersion: browserRuntimeDryRunSchemaVersion, mode: 'dry_run' }
    return browserRuntimeDryRunPackageSchema.parse(pkg)
  }
}
export function verifyBrowserRuntimeDryRunPackage(pkg: BrowserRuntimeDryRunPackage): { valid: true; fingerprint: string } {
  const parsed = browserRuntimeDryRunPackageSchema.parse(pkg)
  const fp = hashCanonical({ incidentId: parsed.incidentId, planId: parsed.planId, targetOrigin: parsed.targetOrigin, approvedStepIds: parsed.approvedStepIds, browserTask: parsed.browserTask, approvalRequirements: parsed.approvalRequirements, verificationRequirements: parsed.verificationRequirements, schemaVersion: parsed.schemaVersion })
  if (fp !== parsed.packageFingerprint) throw new BrowserRuntimeAdapterError('fingerprint_mismatch', 'Dry-run package fingerprint mismatch', 'verification')
  if (parsed.browserTask.incidentId !== parsed.incidentId || parsed.browserTask.provider !== parsed.provider) throw new BrowserRuntimeAdapterError('identity_mismatch', 'Dry-run package identity binding mismatch', 'verification')
  if (JSON.stringify(parsed.stepMapping.map(m => m.supervisorStepId)) !== JSON.stringify(parsed.approvedStepIds)) throw new BrowserRuntimeAdapterError('mapping_order_mismatch', 'Dry-run package mapping order mismatch', 'verification')
  if (JSON.stringify(parsed.browserTask.allowedOrigins) !== JSON.stringify([parsed.targetOrigin])) throw new BrowserRuntimeAdapterError('origin_mismatch', 'Dry-run package origin mismatch', 'verification')
  return { valid: true, fingerprint: fp }
}
