import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createPortableCapabilityDescriptor,
  createPortableConnectorRuntime,
  createPortableStructuredReference,
  resolvePortableCapabilities,
  type PortableCapabilityManifest,
} from '../provider-hub-core/index.ts'

const manifest: PortableCapabilityManifest = {
  portableId: 'self-healing-supervisor',
  manifestVersion: '1.0.0',
  requirements: [
    { capabilityId: 'logs.search', required: true, allowedRisk: 'read', preferredProviders: ['datadog', 'splunk'] },
    { capabilityId: 'deployment.rollback', required: true, allowedRisk: 'consequential' },
  ],
}

const logCapability = createPortableCapabilityDescriptor({
  capabilityId: 'logs.search',
  providerId: 'datadog',
  connectionId: 'conn_dd',
  tenantId: 'tenant_1',
  environmentId: 'prod',
  risk: 'read',
  availability: 'available',
  requiresApproval: false,
  scopes: ['logs:read'],
})

const rollbackCapability = createPortableCapabilityDescriptor({
  capabilityId: 'deployment.rollback',
  providerId: 'vercel',
  connectionId: 'conn_vercel',
  tenantId: 'tenant_1',
  environmentId: 'prod',
  risk: 'consequential',
  availability: 'available',
  requiresApproval: true,
  scopes: ['deployment:write'],
})

test('consequential capabilities cannot bypass approval policy', () => {
  assert.throws(() => createPortableCapabilityDescriptor({
    ...rollbackCapability,
    requiresApproval: false,
  }), /must require approval/)
})

test('capability resolution prefers healthy authorized provider matches', () => {
  const splunk = createPortableCapabilityDescriptor({
    ...logCapability,
    providerId: 'splunk',
    connectionId: 'conn_splunk',
  })
  const resolved = resolvePortableCapabilities(manifest, [splunk, rollbackCapability, logCapability])
  assert.equal(resolved.satisfied, true)
  assert.equal(resolved.resolved['logs.search'].providerId, 'datadog')
  assert.equal(resolved.resolved['deployment.rollback'].providerId, 'vercel')
})

test('runtime isolates discovery by tenant and environment', async () => {
  const runtime = createPortableConnectorRuntime({
    discovery: {
      async discover() {
        return [
          logCapability,
          rollbackCapability,
          createPortableCapabilityDescriptor({ ...logCapability, tenantId: 'other_tenant', connectionId: 'other' }),
        ]
      },
    },
    execution: { async execute({ descriptor, invocation }) { return { ok: true, providerId: descriptor.providerId, capabilityId: invocation.capabilityId } } },
  })

  const discovered = await runtime.discover({ tenantId: 'tenant_1', environmentId: 'prod', manifest })
  assert.equal(discovered.capabilities.length, 2)
  assert.equal(discovered.resolution.satisfied, true)
})

test('runtime refuses consequential execution until buyer approval evidence is present', async () => {
  let executions = 0
  const audit: any[] = []
  const runtime = createPortableConnectorRuntime({
    discovery: { async discover() { return [logCapability, rollbackCapability] } },
    execution: {
      async execute({ descriptor, invocation }) {
        executions++
        return { ok: true, providerId: descriptor.providerId, capabilityId: invocation.capabilityId }
      },
    },
    audit: { async append(event) { audit.push(event) } },
    createId: () => 'evt_1',
    now: () => new Date('2026-08-12T15:00:00.000Z'),
  })

  const refused = await runtime.invoke({
    manifest,
    invocation: {
      tenantId: 'tenant_1', environmentId: 'prod', portableId: manifest.portableId,
      capabilityId: 'deployment.rollback', args: { deploymentId: 'd_1' },
    },
  })
  assert.equal(refused.ok, false)
  assert.equal(refused.mode, 'approval_required')
  assert.equal(executions, 0)

  const approved = await runtime.invoke({
    manifest,
    invocation: {
      tenantId: 'tenant_1', environmentId: 'prod', portableId: manifest.portableId,
      capabilityId: 'deployment.rollback', args: { deploymentId: 'd_1' },
      approval: { approvalId: 'approval_1', approvedBy: 'buyer-admin', approvedAt: '2026-08-12T14:59:00.000Z' },
    },
  })
  assert.equal(approved.ok, true)
  assert.equal(executions, 1)
  assert.equal(audit.length, 1)
  assert.equal(audit[0].approvalId, 'approval_1')
  assert.equal(approved.provenance?.connectionId, 'conn_vercel')
})

test('connector-native references preserve typed identity across tools', async () => {
  const deployment = createPortableStructuredReference({
    kind: 'deployment', providerId: 'vercel', tenantId: 'tenant_1', environmentId: 'prod',
    objectId: 'd_1', canonicalRef: 'vercel://deployment/d_1', metadata: { project: 'signalboost-live' },
  })
  const runtime = createPortableConnectorRuntime({
    discovery: { async discover() { return [logCapability] } },
    execution: {
      async execute({ descriptor, invocation }) {
        return { ok: true, providerId: descriptor.providerId, capabilityId: invocation.capabilityId, references: [deployment] }
      },
    },
  })

  const result = await runtime.invoke({
    manifest: { ...manifest, requirements: [manifest.requirements[0]] },
    invocation: { tenantId: 'tenant_1', environmentId: 'prod', portableId: manifest.portableId, capabilityId: 'logs.search', args: {} },
  })
  assert.equal(result.references?.[0].canonicalRef, 'vercel://deployment/d_1')
})
