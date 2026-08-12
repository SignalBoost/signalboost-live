import assert from 'node:assert/strict'
import test from 'node:test'
import {
  executeCosConnectorRecipe,
  SELF_HEALING_DIAGNOSTIC_RECIPE,
} from '../lib/ai/cos/connectorDelegation.ts'
import type { PortableConnectorRuntimePort } from '../lib/supervisor/portable/host-context.ts'

function runtimeWith(capabilities: Record<string, 'read' | 'write' | 'consequential'>): PortableConnectorRuntimePort {
  return {
    async discover(input) {
      const resolved = Object.fromEntries(Object.entries(capabilities).map(([capabilityId, risk]) => [capabilityId, {
        schemaVersion: 'portable-connector-capability-v1' as const,
        tenantId: input.tenantId,
        environmentId: input.environmentId,
        providerId: 'test-provider',
        connectionId: 'test-connection',
        capabilityId,
        risk,
        requiresApproval: risk === 'consequential',
        availability: 'available' as const,
        scopes: Object.freeze([]),
      }]))
      const missingRequired = input.manifest.required.map(item => item.capabilityId).filter(id => !resolved[id])
      return {
        capabilities: Object.freeze(Object.values(resolved)),
        resolution: {
          resolved,
          missingRequired,
          missingOptional: [],
          ready: missingRequired.length === 0,
        },
      }
    },
    async invoke(input) {
      return { ok: true, providerId: 'test-provider', capabilityId: input.invocation.capabilityId, data: { collected: true } }
    },
  }
}

test('delegates available read-only diagnostic steps in one deterministic routine', async () => {
  const result = await executeCosConnectorRecipe(runtimeWith({
    'deployment.read': 'read',
    'logs.search': 'read',
    'metrics.query': 'read',
  }), {
    tenantId: 'buyer-1', environmentId: 'prod', portableId: 'self-healing-supervisor', recipe: SELF_HEALING_DIAGNOSTIC_RECIPE,
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.evidence.map(item => item.capabilityId), ['deployment.read', 'logs.search', 'metrics.query'])
})

test('fails before execution when a required capability is unavailable', async () => {
  const result = await executeCosConnectorRecipe(runtimeWith({ 'deployment.read': 'read' }), {
    tenantId: 'buyer-1', environmentId: 'prod', portableId: 'self-healing-supervisor', recipe: SELF_HEALING_DIAGNOSTIC_RECIPE,
  })
  assert.equal(result.ok, false)
  assert.equal(result.mode, 'capability_unavailable')
  assert.deepEqual(result.missingRequired, ['logs.search'])
})

test('does not execute write or consequential capabilities as routine evidence gathering', async () => {
  const result = await executeCosConnectorRecipe(runtimeWith({
    'deployment.read': 'read',
    'logs.search': 'read',
    'metrics.query': 'write',
    'health.read': 'consequential',
  }), {
    tenantId: 'buyer-1', environmentId: 'prod', portableId: 'self-healing-supervisor', recipe: SELF_HEALING_DIAGNOSTIC_RECIPE,
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.evidence.map(item => item.capabilityId), ['deployment.read', 'logs.search'])
})
