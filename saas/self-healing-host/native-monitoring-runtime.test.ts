import assert from 'node:assert/strict'
import test from 'node:test'
import type { Observer } from '../lib/supervisor/execution-contracts.ts'
import { runNativeMonitoring, vercelNativeMonitoringCollector } from './native-monitoring-runtime.ts'

const quietObserver: Observer = { observe: async () => [] }

test('native monitoring runs existing observer adapters read-only', async () => {
  const result = await runNativeMonitoring({
    context: { provider: 'vercel', environment: 'preview' },
    collectors: [vercelNativeMonitoringCollector(quietObserver)],
  })
  assert.equal(result.mode, 'native')
  assert.equal(result.readOnly, true)
  assert.equal(result.providerMutations, false)
  assert.deepEqual(result.collectorsRun, ['vercel-deployment-health'])
  assert.deepEqual(result.signalsObserved, ['deployment-health', 'provider-health'])
})

test('hybrid mode keeps native observation active', async () => {
  const result = await runNativeMonitoring({
    context: { provider: 'vercel', environment: 'production' },
    collectors: [vercelNativeMonitoringCollector(quietObserver)],
    externalConnected: true,
  })
  assert.equal(result.mode, 'hybrid')
  assert.equal(result.collectorsRun.length, 1)
})

test('native monitoring can be disabled when buyer uses external monitoring only', async () => {
  const result = await runNativeMonitoring({
    context: { provider: 'external', environment: 'production' },
    collectors: [vercelNativeMonitoringCollector(quietObserver)],
    nativeEnabled: false,
    externalConnected: true,
  })
  assert.equal(result.mode, 'external')
  assert.deepEqual(result.collectorsRun, [])
})
