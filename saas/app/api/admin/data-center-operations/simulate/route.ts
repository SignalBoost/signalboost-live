import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { createLocalApplianceAiPort } from '@/lib/cos/aiPort'
import { clusterDataCenterObservations } from '@/lib/data-center/correlation'
import { diagnoseDataCenterCluster } from '@/lib/data-center/diagnostic'
import {
  createDataCenterSimulation,
  dataCenterSimulationScenarioIds,
  type DataCenterSimulationScenarioId,
} from '@/lib/data-center/simulator'
import { dataCenterClusterToSupervisorIncident } from '@/lib/data-center/supervisorBridge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function scenarioFrom(value: unknown): DataCenterSimulationScenarioId | null {
  const clean = String(value || '').trim()
  return dataCenterSimulationScenarioIds.includes(clean as DataCenterSimulationScenarioId)
    ? clean as DataCenterSimulationScenarioId
    : null
}

export async function POST(req: NextRequest) {
  const access = await getAccess().catch(() => null)
  if (!access?.isOwner) {
    return NextResponse.json({ ok: false, error: 'Owner authorization required.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { scenario?: unknown; diagnose?: unknown }
  const scenario = scenarioFrom(body.scenario)
  if (!scenario) {
    return NextResponse.json({
      ok: false,
      error: 'Unsupported simulation scenario.',
      allowedScenarios: dataCenterSimulationScenarioIds,
    }, { status: 400 })
  }

  const observations = createDataCenterSimulation(scenario, new Date())
  const clusters = clusterDataCenterObservations(observations)
  const supervisorIncidents = clusters.map(dataCenterClusterToSupervisorIncident)
  const shouldDiagnose = body.diagnose !== false
  const diagnostics = []

  if (shouldDiagnose) {
    const ai = createLocalApplianceAiPort()
    for (const cluster of clusters.slice(0, 3)) {
      try {
        diagnostics.push(await diagnoseDataCenterCluster(cluster, ai))
      } catch (error) {
        diagnostics.push({
          schema: 'signalboost-data-center-diagnostic-error-v1',
          clusterId: cluster.clusterId,
          error: error instanceof Error ? error.message : 'diagnostic_unavailable',
          controlAuthority: 'none',
          rootCauseStatus: 'unproven',
        })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    mode: 'sandbox-simulation',
    scenario,
    advisoryOnly: true,
    facilityControlAllowed: false,
    observations,
    clusters: clusters.map(cluster => ({
      clusterId: cluster.clusterId,
      siteId: cluster.siteId,
      startedAt: cluster.startedAt,
      endedAt: cluster.endedAt,
      severity: cluster.severity,
      sharedCorrelationKeys: cluster.sharedCorrelationKeys,
      observationIds: cluster.observations.map(item => item.observationId),
    })),
    supervisorIncidents,
    diagnostics,
  })
}
