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
      handler: () => ({ status: 'completed', reason: 'recorded; diagnosis is not wired in this deployment' }),
      records,
    }),
    notes,
  }
  return cached
}

export function resetIncidentIntakeForTests(): void { cached = null }
