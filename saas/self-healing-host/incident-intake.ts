import {
  createIncidentRuntime,
  createInMemoryDedupeStore,
  createInMemoryIncidentRecordStore,
  createIncidentSource,
  createSignedWebhookSource,
  type IncidentSource,
} from '@/lib/supervisor/portable/index'
import { createMonitoringIncidentSourceDefinition, monitoringAdapterIds, type MonitoringAdapterId } from '@/lib/supervisor/portable/monitoring-adapters'
import { createSharedSecretAuthenticator } from '@/lib/supervisor/portable/monitoring-authenticators'
import { createTriageThinker } from '@/lib/supervisor/portable/triage-thinker'
import { createReferenceVerifier } from '@/lib/supervisor/portable/reference-verifier'
import { SupervisorOrchestrator } from '@/lib/supervisor/orchestrator'
import { DefaultSupervisorPolicyEngine } from '@/lib/supervisor/policy-engine'
import type { AuditEvent } from '@/lib/supervisor/execution-contracts'

export const GENERIC_SOURCE_ID = 'generic'
export const VENDOR_SECRET_HEADER = 'x-supervisor-secret'

const VENDOR_SECRET_ENV: Record<MonitoringAdapterId, string> = {
  datadog: 'SUPERVISOR_INTAKE_SECRET_DATADOG',
  pagerduty: 'SUPERVISOR_INTAKE_SECRET_PAGERDUTY',
  'aws-cloudwatch-eventbridge': 'SUPERVISOR_INTAKE_SECRET_AWS',
  'prometheus-alertmanager': 'SUPERVISOR_INTAKE_SECRET_ALERTMANAGER',
  splunk: 'SUPERVISOR_INTAKE_SECRET_SPLUNK',
  'azure-monitor': 'SUPERVISOR_INTAKE_SECRET_AZURE',
  'grafana-alerting': 'SUPERVISOR_INTAKE_SECRET_GRAFANA',
  'google-cloud-operations': 'SUPERVISOR_INTAKE_SECRET_GCP',
}

export interface IntakeWiringNote {
  sourceId: string
  mounted: boolean
  reason: string
}

const secretOf = (name: string): string => String(process.env[name] ?? '').trim()

let cached: { runtime: ReturnType<typeof createIncidentRuntime>; notes: IntakeWiringNote[] } | null = null

// Bounded on purpose. This is a convenience view for an operator, NOT the audit of
// record — a buyer tees the real audit to their SIEM through the portable's audit
// sink. An unbounded in-process array would be a memory leak pretending to be
// compliance.
const AUDIT_BUFFER_LIMIT = 200
let auditBuffer: Array<Readonly<AuditEvent>> = []
function recordAudit(event: Readonly<AuditEvent>): void {
  auditBuffer.push(event)
  if (auditBuffer.length > AUDIT_BUFFER_LIMIT) auditBuffer = auditBuffer.slice(-AUDIT_BUFFER_LIMIT)
}
export function recentIntakeAudit(limit = 50): Array<Readonly<AuditEvent>> {
  return auditBuffer.slice(-Math.max(1, Math.min(limit, AUDIT_BUFFER_LIMIT)))
}

export function getIncidentIntake(): { runtime: ReturnType<typeof createIncidentRuntime>; notes: IntakeWiringNote[] } {
  if (cached) return cached

  const dedupe = createInMemoryDedupeStore()
  const records = createInMemoryIncidentRecordStore()
  const sources: IncidentSource[] = []
  const notes: IntakeWiringNote[] = []

  const genericSecret = secretOf('SUPERVISOR_INTAKE_SECRET')
  if (genericSecret) {
    try {
      sources.push(createSignedWebhookSource({ secret: genericSecret, sourceId: GENERIC_SOURCE_ID, vendor: 'generic', status: 'live' }, { dedupe }))
      notes.push({ sourceId: GENERIC_SOURCE_ID, mounted: true, reason: 'signed webhook configured' })
    } catch (error) {
      notes.push({ sourceId: GENERIC_SOURCE_ID, mounted: false, reason: error instanceof Error ? error.message : 'invalid configuration' })
    }
  } else {
    notes.push({ sourceId: GENERIC_SOURCE_ID, mounted: false, reason: 'SUPERVISOR_INTAKE_SECRET is not set' })
  }

  for (const adapterId of monitoringAdapterIds) {
    const envName = VENDOR_SECRET_ENV[adapterId]
    const secret = secretOf(envName)
    if (!secret) {
      notes.push({ sourceId: adapterId, mounted: false, reason: `${envName} is not set` })
      continue
    }
    try {
      const definition = createMonitoringIncidentSourceDefinition(adapterId, { sourceId: adapterId })
      const authenticate = createSharedSecretAuthenticator({ secret, headerName: VENDOR_SECRET_HEADER })
      sources.push(createIncidentSource({ ...definition, authenticate }, { dedupe }))
      notes.push({ sourceId: adapterId, mounted: true, reason: `shared secret via ${VENDOR_SECRET_HEADER}` })
    } catch (error) {
      notes.push({ sourceId: adapterId, mounted: false, reason: error instanceof Error ? error.message : 'invalid configuration' })
    }
  }

  if (sources.length === 0) {
    sources.push(createIncidentSource({ sourceId: '__unconfigured__', vendor: 'none', status: 'disabled', map: () => null }))
  }

  cached = {
    runtime: createIncidentRuntime({
      sources,
      // An accepted alert is now DIAGNOSED and evaluated by the shipped policy engine,
      // not merely filed. What it still is not is EXECUTED: running even a read-only
      // observation needs a step runner with access to the buyer's systems and this
      // platform has no generic one, so the executor below reports that plainly and
      // the orchestration honestly ends `unresolved`. Returning a fabricated success
      // would put a lie in the audit trail, which is the one thing an operator must
      // never find there.
      handler: async (incident) => {
        let verdict = 'unknown'
        let risk = 'low'
        const orchestrator = new SupervisorOrchestrator({
          thinker: createTriageThinker(),
          policyEngine: new DefaultSupervisorPolicyEngine(),
          executor: { execute: () => ({ status: 'failed', executedStepIds: [], startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), summary: 'no execution step runner is configured in this deployment' }) },
          verifier: createReferenceVerifier(),
          audit: { write: (event: Readonly<AuditEvent>) => {
            if (event.eventType === 'plan_generated' && typeof event.payload.riskLevel === 'string') risk = event.payload.riskLevel
            if (event.eventType === 'policy_evaluated' && typeof event.payload.outcome === 'string') verdict = event.payload.outcome
            recordAudit(event)
          } },
          // Passive, not autopilot. An inbound alert from an unproven integration must
          // not widen what is allowed to run unattended.
          mode: 'passive',
          executionContext: { executionId: `intake-${incident.incidentId}` },
        })
        const outcome = await orchestrator.run(incident)
        return { status: outcome.status, reason: `diagnosed (risk ${risk}); policy ${verdict}; ${outcome.reason}` }
      },
      records,
    }),
    notes,
  }
  return cached
}

export function resetIncidentIntakeForTests(): void { cached = null; auditBuffer = [] }
