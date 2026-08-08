import test from 'node:test'
import assert from 'node:assert/strict'
import { HttpUniversalPortableRuntime } from '../lib/ai/cos/autonomy/httpPortableRuntime.ts'
import type { PortableHttpTransport } from '../lib/ai/cos/autonomy/httpPortableRuntime.ts'

function transport(portableId: string): PortableHttpTransport {
  return {
    async request({ url, method, body }) {
      const path = new URL(url).pathname
      if (path.endsWith('/manifest') && method === 'GET') return { ok: true, status: 200, json: {
        schemaVersion: 'cos-autonomy-v1', portableId, portableVersion: '1.0.0', capabilities: [{
          capabilityId: 'inspect', version: '1', description: 'Inspect state', readOnly: true, reversible: true,
          requiresApproval: false, riskClass: 'read_only', evidenceTypes: ['state'], verificationTypes: ['state'],
        }],
      } }
      if (path.endsWith('/observe')) return { ok: true, status: 200, json: { observedAt: new Date(0).toISOString(), summary: `${portableId} observed`, facts: {}, evidenceIds: [`${portableId}-e1`], stateFingerprint: `${portableId}-s1` } }
      if (path.endsWith('/invoke')) return { ok: true, status: 200, json: { actionId: (body as any).action.actionId, status: 'completed', summary: `${portableId} invoked`, evidenceIds: [`${portableId}-e2`] } }
      if (path.endsWith('/verify')) return { ok: true, status: 200, json: { status: 'verified', goalSatisfied: true, summary: `${portableId} verified` } }
      if (path.endsWith('/recover')) return { ok: true, status: 200, json: { status: 'restored', summary: `${portableId} restored` } }
      return { ok: false, status: 404, error: 'not_found' }
    },
  }
}

for (const portableId of ['self-healing-supervisor', 'browser-governor']) {
  test(`same COS HTTP contract operates ${portableId}`, async () => {
    const runtime = new HttpUniversalPortableRuntime({ portableId, baseUrl: `https://${portableId}.internal` }, transport(portableId))
    const manifest = await runtime.getManifest()
    assert.equal(manifest.portableId, portableId)
    const observation = await runtime.observe({ objective: 'maintain healthy operation' })
    assert.equal(observation.summary, `${portableId} observed`)
    const action = { actionId: 'a1', capabilityId: 'inspect', justification: 'inspect', params: {} }
    const result = await runtime.invoke({ objective: 'maintain healthy operation', action })
    assert.equal(result.status, 'completed')
    const plan = { planId: 'p1', objective: 'maintain healthy operation', actions: [action], expectedOutcome: 'healthy', confidence: 1 }
    const verification = await runtime.verify({ objective: plan.objective, observation, plan, results: [result] })
    assert.equal(verification.goalSatisfied, true)
    const recovery = await runtime.recover({ objective: plan.objective, observation, plan, results: [result], verification })
    assert.equal(recovery.status, 'restored')
  })
}

test('portable identity mismatch fails closed', async () => {
  const runtime = new HttpUniversalPortableRuntime({ portableId: 'expected', baseUrl: 'https://portable.internal' }, transport('different'))
  await assert.rejects(() => runtime.getManifest(), /manifest_id_mismatch/)
})
