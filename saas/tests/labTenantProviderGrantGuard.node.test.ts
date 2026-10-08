import assert from 'node:assert/strict'
import test from 'node:test'
import { validateTenantProviderGrant } from '../lib/ai/cos/labTenantProviderGrantGuard.ts'
const org = '11111111-2222-4333-8444-555555555555'
const artifact = '22222222-3333-4444-8555-666666666666'
const scope = { organizationId: org, permanentArtifactId: artifact, providerId: 'teacher-x', capability: 'teacher.invoke' as const }
const grant = { organization_id: org, permanent_artifact_id: artifact, provider_id: 'teacher-x',
  capability: 'teacher.invoke', secret_reference: `vault://${org}/teacher-key`,
  expires_at: '2027-01-01T00:00:00Z', revoked_at: null }
const now = new Date('2026-10-08T00:00:00Z')
const valid = (g: typeof grant | null, s = scope) => validateTenantProviderGrant(s, g, now)
test('Phase 3: exact scope gets only an opaque tenant-bound vault reference', () => {
  assert.deepEqual(valid(grant), { allowed: true, secretReference: grant.secret_reference })
})
test('Phase 3: cross-tenant, cross-artifact, provider and capability substitutions fail closed', () => {
  for (const s of [
    { ...scope, organizationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
    { ...scope, permanentArtifactId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
    { ...scope, providerId: 'another' },
    { ...scope, capability: 'compute.execute' as const },
  ]) assert.equal(valid(grant, s).allowed, false)
})
test('Phase 3: expired, revoked, missing and foreign vault references fail closed', () => {
  for (const g of [
    null, { ...grant, expires_at: '2020-01-01T00:00:00Z' },
    { ...grant, revoked_at: '2026-10-01T00:00:00Z' },
    { ...grant, secret_reference: 'literal-secret' },
    { ...grant, secret_reference: 'vault://aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/other' },
    { ...grant, secret_reference: `vault://${org}/../escape` },
  ]) assert.equal(valid(g).allowed, false)
})
