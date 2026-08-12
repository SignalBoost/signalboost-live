import assert from 'node:assert/strict'
import test from 'node:test'
import { createConnectorAwareThinker } from '../lib/supervisor/portable/connector-aware-thinker.ts'
import type { HostContext } from '../lib/supervisor/portable/host-context.ts'

const host: HostContext = {
  secrets: { async getSecret() { return undefined } },
  notifications: { notify() {} },
  approvers: { approversFor() { return [] } },
  branding: { productName: 'Buyer Supervisor' },
  connectors: {
    async discover(input) {
      const resolved = Object.fromEntries(input.manifest.requirements.map(req => [req.capabilityId, {
        schemaVersion: 'portable-connector-capability-v1' as const,
        capabilityId: req.capabilityId,
        providerId: 'buyer-provider',
        connectionId: 'buyer-connection',
        tenantId: input.tenantId,
        environmentId: input.environmentId,
        risk: 'read' as const,
        availability: 'available' as const,
        requiresApproval: false,
        scopes: [],
      }]))
      return { capabilities: Object.values(resolved), resolution: { portableId: input.manifest.portableId, satisfied: true, resolved, missing: [] } }
    },
    async invoke(input) {
      return { ok: true, providerId: 'buyer-provider', capabilityId: input.invocation.capabilityId, data: { status: 'ok' } }
    },
  },
}

test('injects compact connector evidence before underlying thinker runs', async () => {
  let seen: any
  const thinker = createConnectorAwareThinker({
    host,
    tenantId: 'tenant-1',
    thinker: { proposeRepairPlan(incident) { seen = incident; return { ok: true } } },
  })

  await thinker.proposeRepairPlan({
    incidentId: 'inc-1', provider: 'generic', environment: 'production', severity: 'warning',
    detectedAt: new Date().toISOString(), source: 'api', errorMessage: 'deployment latency',
    evidence: [{ evidenceId: 'e1', type: 'alert', capturedAt: new Date().toISOString(), summary: 'latency' }],
    metadata: {},
  })

  const packet = seen.metadata.connectorEvidence
  assert.equal(packet.ok, true)
  assert.ok(Array.isArray(packet.items))
  assert.ok(packet.items.length >= 2)
  assert.equal(packet.items[0].providerId, 'buyer-provider')
})
