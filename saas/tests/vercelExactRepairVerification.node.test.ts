import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyExactVercelDeployment } from '../self-healing-host/vercel-deployment-verification-pure.ts'

test('READY is success only for the exact deployment id created by the repair', () => {
  assert.deepEqual(
    classifyExactVercelDeployment({
      expectedDeploymentId: 'dpl_exact123',
      deployment: { id: 'dpl_exact123', readyState: 'READY', url: 'signalboost.example.vercel.app' },
    }),
    {
      deploymentId: 'dpl_exact123',
      deploymentUrl: 'https://signalboost.example.vercel.app',
      state: 'READY',
      terminal: true,
      outcomeStatus: 'success',
      verified: true,
    },
  )
})

test('a different newer READY deployment is never accepted as repair evidence', () => {
  assert.equal(
    classifyExactVercelDeployment({
      expectedDeploymentId: 'dpl_repair',
      deployment: { id: 'dpl_unrelated', readyState: 'READY' },
    }),
    null,
  )
})

test('ERROR and CANCELED are exact terminal failures', () => {
  for (const state of ['ERROR', 'CANCELED']) {
    const result = classifyExactVercelDeployment({
      expectedDeploymentId: 'dpl_exact123',
      deployment: { id: 'dpl_exact123', readyState: state },
    })
    assert.equal(result?.terminal, true)
    assert.equal(result?.outcomeStatus, 'failure')
    assert.equal(result?.verified, false)
  }
})

test('BUILDING remains pending and creates no verdict', () => {
  const result = classifyExactVercelDeployment({
    expectedDeploymentId: 'dpl_exact123',
    deployment: { id: 'dpl_exact123', readyState: 'BUILDING' },
  })
  assert.equal(result?.terminal, false)
  assert.equal(result?.outcomeStatus, null)
  assert.equal(result?.verified, null)
})
