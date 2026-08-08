import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { selfHealingSupervisorCosManifest } from '../lib/portable-products/cos-runtimes/selfHealingSupervisor.ts'

test('first-party Self-Healing portable exposes a universal COS manifest', () => {
  assert.equal(selfHealingSupervisorCosManifest.portableId, 'self-healing-supervisor')
  assert.ok(selfHealingSupervisorCosManifest.capabilities.some(item => item.capabilityId === 'supervisor.inspect_deployments' && item.readOnly))
  assert.ok(selfHealingSupervisorCosManifest.capabilities.some(item => item.capabilityId === 'supervisor.route_latest_failed_deployment' && item.riskClass === 'low_risk_reversible'))
})

test('Vercel schedules the COS leadership tick', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  const cron = config.crons.find((item: any) => item.path === '/api/cron/cos-autonomy')
  assert.ok(cron)
  assert.equal(cron.schedule, '*/5 * * * *')
})

test('COS cron has a first-party mission without requiring custom mission JSON', async () => {
  const source = await readFile(new URL('../app/api/cron/cos-autonomy/route.ts', import.meta.url), 'utf8')
  assert.match(source, /signalboost-self-healing-supervisor/)
  assert.match(source, /first_party_default/)
  assert.match(source, /COS_AUTONOMY_MISSIONS/)
})

test('portable bridge keeps Supervisor governance in the actuation path', async () => {
  const source = await readFile(new URL('../lib/portable-products/cos-runtimes/selfHealingSupervisor.ts', import.meta.url), 'utf8')
  assert.match(source, /dispatchRepairPlan/)
  assert.match(source, /GATEWAY_POLICY/)
  assert.match(source, /createSignalBoostGatewayHost/)
  assert.doesNotMatch(source, /rollbackDeployment\(/)
})
