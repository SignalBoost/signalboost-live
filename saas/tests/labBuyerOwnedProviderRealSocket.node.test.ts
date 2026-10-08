import assert from 'node:assert/strict'
import test from 'node:test'
import { createGovernedHarnessExecutor } from '../platform-harness/runtime/governed-executor.ts'
import { dispatchBuyerOwnedProvider } from '../lib/ai/cos/labBuyerOwnedProviderDispatch.ts'
import type { HarnessManifest } from '../platform-harness/core/types.ts'
import type { GatewayHost, GovernancePolicy } from '../agent-gateway/types.ts'

const org = '11111111-2222-4333-8444-555555555555'
const artifact = '22222222-3333-4444-8555-666666666666'
const scope = { organizationId: org, permanentArtifactId: artifact, providerId: 'provider-a', capability: 'teacher.invoke' as const }
const grant = { organization_id: org, permanent_artifact_id: artifact, provider_id: 'provider-a', capability: 'teacher.invoke',
 secret_reference: `vault://${org}/teacher`, expires_at: '2027-01-01T00:00:00Z', revoked_at: null }
const manifest: HarnessManifest = {
 runId: 'run-1', objective: 'external provider invocation', profile: 'production',
 identity: { agentId: 'worker', role: 'worker', tenantId: org, artifact: { artifactId: artifact } },
 environment: { environmentId: 'prod', class: 'production' }, authorityManifestRef: 'independently-verified',
 capabilities: [{ id: 'teacher.invoke', mutating: true, risk: 'consequential', scopes: [artifact, 'provider-a'], environments: ['production'] }],
 limits: {}, learningFeedbackAllowed: false,
}

test('Phase 3: real Governed Socket cannot silently execute external-effect provider action', async () => {
 let executions = 0, approvals = 0
 const policy: GovernancePolicy = {
  classifier: { classify: () => 'external_effect' },
  allowlist: [{ actionKind: 'provider.invoke', target: 'teacher.invoke', rollback: 'fake-rollback' }],
  tenantId: org, environment: 'production',
 }
 const host: GatewayHost = {
  execution: { perform: async () => { executions++; return { ok: true } } },
  approvals: { requestApproval: async () => { approvals++; return { approvalId: 'human-approval-pending' } } },
 }
 const executor = createGovernedHarnessExecutor({ policy, host })
 const result = await dispatchBuyerOwnedProvider({
  scope, harnessRunId: 'run-1', actionId: 'provider-1',
  now: () => new Date('2026-10-08T12:00:00Z'),
  readGrant: async () => grant,
  resolveTrustedRun: async () => ({ manifest, status: 'active', authorityVerified: true }),
  executor,
 })
 assert.equal(result.status, 'execution_failed')
 assert.equal(executions, 0)
 assert.equal(approvals, 1)
})
test('Phase 3: unlisted provider action fails closed even with reversible classifier', async () => {
 let executions = 0
 const executor = createGovernedHarnessExecutor({
  policy: { classifier: { classify: () => 'reversible_internal' }, allowlist: [] },
  host: { execution: { perform: async () => { executions++; return { ok: true } } } },
 })
 const result = await dispatchBuyerOwnedProvider({
  scope, harnessRunId: 'run-1', actionId: 'provider-2',
  now: () => new Date('2026-10-08T12:00:00Z'),
  readGrant: async () => grant,
  resolveTrustedRun: async () => ({ manifest, status: 'active', authorityVerified: true }),
  executor,
 })
 assert.equal(result.status, 'execution_failed')
 assert.equal(executions, 0)
})
