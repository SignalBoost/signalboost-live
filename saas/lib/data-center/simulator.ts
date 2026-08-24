import { normalizeDataCenterObservation, type DataCenterObservation } from './observation.ts'

export const dataCenterSimulationScenarioIds = [
  'cooling-loop-degradation',
  'pdu-overload',
  'unrelated-concurrent-alerts',
] as const

export type DataCenterSimulationScenarioId = (typeof dataCenterSimulationScenarioIds)[number]

function at(base: Date, offsetSeconds: number): string {
  return new Date(base.getTime() + offsetSeconds * 1000).toISOString()
}

function observation(input: Record<string, unknown>): DataCenterObservation {
  return normalizeDataCenterObservation(input)
}

export function createDataCenterSimulation(
  scenario: DataCenterSimulationScenarioId,
  baseTime = new Date('2026-08-24T18:00:00.000Z'),
): DataCenterObservation[] {
  if (scenario === 'cooling-loop-degradation') {
    return [
      observation({
        observationId: 'sim-cooling-cdu2-pressure',
        observedAt: at(baseTime, 0),
        environment: 'sandbox',
        siteId: 'sim-site-texas-01',
        facilityArea: 'hall-b',
        sourceSystem: 'signalboost-dc-simulator',
        sourceKind: 'simulator',
        vendor: 'simulation',
        assetClass: 'cdu',
        assetId: 'cdu-2',
        eventType: 'differential_pressure_low',
        message: 'CDU-2 differential pressure has fallen below the simulated operating baseline.',
        metric: { name: 'differential_pressure', value: 31, unit: 'psi', warningThreshold: 35, criticalThreshold: 28, baseline: 38 },
        sourceSeverity: 'warning',
        severity: 'warning',
        status: 'degraded',
        correlationKeys: ['cooling-loop-b', 'hall-b'],
        tags: { powerPath: 'b', coolingLoop: 'b' },
        evidence: [{ type: 'simulated_sensor', summary: 'CDU-2 pressure 31 psi versus 38 psi simulated baseline.' }],
      }),
      observation({
        observationId: 'sim-cooling-rack-b17-temp',
        observedAt: at(baseTime, 180),
        environment: 'sandbox',
        siteId: 'sim-site-texas-01',
        facilityArea: 'hall-b',
        rowId: 'row-b',
        rackId: 'rack-b17',
        sourceSystem: 'signalboost-dc-simulator',
        sourceKind: 'simulator',
        vendor: 'simulation',
        assetClass: 'environment_sensor',
        assetId: 'temp-rack-b17-inlet',
        eventType: 'rack_inlet_temperature_rising',
        message: 'Rack B17 inlet temperature is rising while simulated compute load remains approximately stable.',
        metric: { name: 'rack_inlet_temperature', value: 31.8, unit: 'C', warningThreshold: 30, criticalThreshold: 35, baseline: 25.4 },
        sourceSeverity: 'warning',
        severity: 'warning',
        status: 'rising',
        correlationKeys: ['cooling-loop-b', 'hall-b', 'rack-b17'],
        tags: { coolingLoop: 'b', workloadTrend: 'stable' },
        evidence: [{ type: 'simulated_sensor', summary: 'Rack B17 inlet temperature rose from 25.4 C baseline to 31.8 C while workload trend is marked stable.' }],
      }),
      observation({
        observationId: 'sim-cooling-rack-b18-temp',
        observedAt: at(baseTime, 240),
        environment: 'sandbox',
        siteId: 'sim-site-texas-01',
        facilityArea: 'hall-b',
        rowId: 'row-b',
        rackId: 'rack-b18',
        sourceSystem: 'signalboost-dc-simulator',
        sourceKind: 'simulator',
        vendor: 'simulation',
        assetClass: 'environment_sensor',
        assetId: 'temp-rack-b18-inlet',
        eventType: 'rack_inlet_temperature_rising',
        message: 'Rack B18 inlet temperature is also rising on the same simulated cooling loop.',
        metric: { name: 'rack_inlet_temperature', value: 31.1, unit: 'C', warningThreshold: 30, criticalThreshold: 35, baseline: 25.6 },
        sourceSeverity: 'warning',
        severity: 'warning',
        status: 'rising',
        correlationKeys: ['cooling-loop-b', 'hall-b', 'rack-b18'],
        tags: { coolingLoop: 'b' },
        evidence: [{ type: 'simulated_sensor', summary: 'Rack B18 inlet temperature rose from 25.6 C baseline to 31.1 C.' }],
      }),
    ]
  }

  if (scenario === 'pdu-overload') {
    return [
      observation({
        observationId: 'sim-pdu-a3-load',
        observedAt: at(baseTime, 0),
        environment: 'sandbox',
        siteId: 'sim-site-arizona-01',
        facilityArea: 'hall-a',
        sourceSystem: 'signalboost-dc-simulator',
        sourceKind: 'simulator',
        vendor: 'simulation',
        assetClass: 'pdu',
        assetId: 'pdu-a3',
        eventType: 'load_high',
        message: 'PDU A3 load is above the simulated warning threshold.',
        metric: { name: 'load_pct', value: 87, unit: '%', warningThreshold: 80, criticalThreshold: 95, baseline: 68 },
        sourceSeverity: 'warning',
        severity: 'warning',
        status: 'high_load',
        correlationKeys: ['power-path-a', 'pdu-a3'],
        tags: { powerPath: 'a' },
        evidence: [{ type: 'simulated_power_meter', summary: 'PDU A3 load is 87% versus 68% simulated baseline.' }],
      }),
      observation({
        observationId: 'sim-pdu-a3-branch-12',
        observedAt: at(baseTime, 90),
        environment: 'sandbox',
        siteId: 'sim-site-arizona-01',
        facilityArea: 'hall-a',
        rowId: 'row-a',
        rackId: 'rack-a12',
        sourceSystem: 'signalboost-dc-simulator',
        sourceKind: 'simulator',
        vendor: 'simulation',
        assetClass: 'pdu',
        assetId: 'pdu-a3',
        eventType: 'branch_current_high',
        message: 'A simulated PDU A3 branch feeding rack A12 is approaching its current limit.',
        metric: { name: 'branch_current', value: 29.4, unit: 'A', warningThreshold: 28, criticalThreshold: 31, baseline: 22 },
        sourceSeverity: 'warning',
        severity: 'warning',
        status: 'high_load',
        correlationKeys: ['power-path-a', 'pdu-a3', 'rack-a12'],
        tags: { powerPath: 'a' },
        evidence: [{ type: 'simulated_power_meter', summary: 'PDU A3 branch current is 29.4 A on a simulated 31 A critical limit.' }],
      }),
    ]
  }

  if (scenario === 'unrelated-concurrent-alerts') {
    return [
      observation({
        observationId: 'sim-unrelated-ups-battery',
        observedAt: at(baseTime, 0),
        environment: 'sandbox',
        siteId: 'sim-site-texas-01',
        facilityArea: 'electrical-room-1',
        sourceSystem: 'signalboost-dc-simulator',
        sourceKind: 'simulator',
        vendor: 'simulation',
        assetClass: 'battery',
        assetId: 'ups-a-battery-string-2',
        eventType: 'battery_internal_resistance_high',
        message: 'UPS A battery string 2 shows elevated simulated internal resistance.',
        metric: { name: 'internal_resistance_index', value: 1.42, unit: 'ratio', warningThreshold: 1.3, criticalThreshold: 1.7, baseline: 1 },
        sourceSeverity: 'warning',
        severity: 'warning',
        status: 'degraded',
        correlationKeys: ['ups-a-battery-string-2'],
        tags: { powerPath: 'a' },
        evidence: [{ type: 'simulated_battery_test', summary: 'Battery resistance index is 1.42 versus simulated baseline 1.0.' }],
      }),
      observation({
        observationId: 'sim-unrelated-switch-link',
        observedAt: at(baseTime, 120),
        environment: 'sandbox',
        siteId: 'sim-site-texas-01',
        facilityArea: 'hall-c',
        sourceSystem: 'signalboost-dc-simulator',
        sourceKind: 'simulator',
        vendor: 'simulation',
        assetClass: 'network_switch',
        assetId: 'leaf-c07',
        eventType: 'uplink_flap',
        message: 'Leaf switch C07 reports a simulated uplink flap.',
        sourceSeverity: 'warning',
        severity: 'warning',
        status: 'intermittent',
        correlationKeys: ['leaf-c07-uplink-2'],
        tags: { networkFabric: 'c' },
        evidence: [{ type: 'simulated_syslog', summary: 'Leaf C07 uplink 2 transitioned down/up twice within 60 seconds.' }],
      }),
    ]
  }

  return []
}
