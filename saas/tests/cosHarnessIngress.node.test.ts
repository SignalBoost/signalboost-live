import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  createCosProductionIngressManifest,
  currentCosHarnessIngress,
  requireCosHarnessIngress,
  withCosHarnessIngress,
} from '../platform-harness/index.ts'

test('COS mandatory ingress creates a zero-capability Production HarnessRun', () => {
  const manifest = createCosProductionIngressManifest({
    runId: 'cos-ingress-test',
    objective: 'answer one interactive request',
    tenantId: 'tenant-test',
  })

  assert.equal(manifest.runId, 'cos-ingress-test')
  assert.equal(manifest.profile, 'production')
  assert.equal(manifest.environment.class, 'production')
  assert.equal(manifest.identity.agentId, 'cos-primary')
  assert.equal(manifest.identity.portableId, 'cos')
  assert.deepEqual(manifest.capabilities, [])
  assert.equal(manifest.authorityManifestRef, 'host://cos-primary-ingress/cos-ingress-test')
  assert.ok(Number(manifest.limits.deadlineMs) > 0)
})

test('COS execution fails closed outside the mandatory Harness ingress scope', () => {
  assert.equal(currentCosHarnessIngress(), null)
  assert.throws(() => requireCosHarnessIngress(), /cos_harness_ingress_required/)
})

test('COS execution can read the exact HarnessRun only inside its ingress scope', async () => {
  const manifest = createCosProductionIngressManifest({
    runId: 'cos-ingress-scope-test',
    objective: 'bind one COS turn',
    tenantId: 'tenant-test',
  })

  await withCosHarnessIngress(manifest, async () => {
    assert.equal(requireCosHarnessIngress().runId, manifest.runId)
    assert.equal(currentCosHarnessIngress()?.manifest.runId, manifest.runId)
  })

  assert.equal(currentCosHarnessIngress(), null)
})

test('live COS route requires Harness ingress before postCosPrimary execution', () => {
  const source = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  const core = source.indexOf('export async function postCosPrimary(req:NextRequest){')
  const guard = source.indexOf('requireCosHarnessIngress()', core)
  const wrapper = source.indexOf('createCosProductionIngressManifest({')
  const dispatch = source.lastIndexOf('postCosPrimary(req)')

  assert.ok(core >= 0)
  assert.ok(guard > core && guard < source.indexOf('const startedAt=Date.now()', core))
  assert.ok(wrapper >= 0 && wrapper < dispatch)
})
