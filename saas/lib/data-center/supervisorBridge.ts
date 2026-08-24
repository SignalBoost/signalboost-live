import { incidentSchema, type SupervisorIncident } from '../supervisor/incident-schema.ts'
import type { DataCenterIncidentCluster } from './correlation.ts'

function unique(values: string[]): string[] {
  return [...new Set(values)].sort()
}

/**
 * Converts a conservative data-center evidence cluster into the existing Supervisor
 * incident contract. This is deliberately an observation/diagnostic bridge only:
 * correlation is recorded, but physical root cause is explicitly unproven and no
 * facility-control authority is granted.
 */
export function dataCenterClusterToSupervisorIncident(cluster: DataCenterIncidentCluster): SupervisorIncident {
  if (!cluster.observations.length) throw new Error('data_center_cluster_empty')
  const first = cluster.observations[0]
  const assetClasses = unique(cluster.observations.map(item => item.assetClass))
  const assetIds = unique(cluster.observations.map(item => item.assetId))
  const observationIds = cluster.observations.map(item => item.observationId)
  const sourceSystems = unique(cluster.observations.map(item => item.sourceSystem))

  return incidentSchema.parse({
    incidentId: `dc:${cluster.clusterId}`,
    provider: 'datacenter:correlation-layer',
    environment: first.environment,
    severity: cluster.severity,
    detectedAt: cluster.startedAt,
    source: first.sourceKind === 'manual' ? 'manual' : first.sourceKind === 'simulator' ? 'cron' : 'webhook',
    errorCode: 'dc_correlated_observation_cluster',
    errorMessage: cluster.observations.length === 1
      ? `One data-center observation requires operator review at site ${cluster.siteId}. Root cause is not established.`
      : `${cluster.observations.length} data-center observations share explicit correlation evidence at site ${cluster.siteId}. Root cause is not yet established.`,
    affectedResource: cluster.sharedCorrelationKeys[0]
      ? `${cluster.siteId}/${cluster.sharedCorrelationKeys[0]}`
      : `${cluster.siteId}/${first.assetClass}/${first.assetId}`,
    evidence: cluster.observations.flatMap(observation => observation.evidence.map((item, index) => ({
      evidenceId: `${observation.observationId}:e${index + 1}`,
      type: item.type,
      capturedAt: observation.observedAt,
      summary: item.summary,
      reference: item.reference,
    }))),
    metadata: {
      domain: 'data_center_operations',
      observationOnly: true,
      advisoryOnly: true,
      facilityControlAllowed: false,
      rootCauseStatus: 'unproven',
      clusterId: cluster.clusterId,
      siteId: cluster.siteId,
      clusterStartedAt: cluster.startedAt,
      clusterEndedAt: cluster.endedAt,
      observationCount: cluster.observations.length,
      observationIds,
      sourceSystems,
      assetClasses,
      assetIds,
      sharedCorrelationKeys: cluster.sharedCorrelationKeys,
    },
  })
}

export function dataCenterDiagnosticEvidenceBlock(cluster: DataCenterIncidentCluster): string {
  const lines = [
    'DATA CENTER OPERATIONS EVIDENCE — READ ONLY / ADVISORY',
    `Cluster: ${cluster.clusterId}`,
    `Site: ${cluster.siteId}`,
    `Window: ${cluster.startedAt} → ${cluster.endedAt}`,
    `Severity: ${cluster.severity}`,
    `Shared correlation keys: ${cluster.sharedCorrelationKeys.join(', ') || 'none'}`,
    'Important: correlation is not proof of physical root cause. Do not invent missing telemetry or facility state.',
    'Facility-control authority: NONE. Recommend operator checks only.',
    '',
  ]

  for (const observation of cluster.observations) {
    const metric = observation.metric
      ? `${observation.metric.name}=${observation.metric.value} ${observation.metric.unit}`
      : 'no numeric metric supplied'
    lines.push(
      `- ${observation.observedAt} | ${observation.assetClass}/${observation.assetId} | ${observation.eventType} | ${observation.severity} | ${metric}`,
      `  ${observation.message}`,
      ...observation.evidence.map(item => `  Evidence: ${item.summary}${item.reference ? ` (${item.reference})` : ''}`),
    )
  }

  return lines.join('\n')
}
