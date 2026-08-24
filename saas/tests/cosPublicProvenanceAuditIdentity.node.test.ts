import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { getAccess } from '../lib/auth/access.ts'
import { publicAuditUserId, withPublicAuditIdentity } from '../lib/auth/publicAuditIdentity.ts'
import { isPublicDeliveryScope, withPublicDeliveryScope } from '../lib/auth/publicDeliveryScope.ts'

const TEST_USER_ID = '11111111-2222-4333-8444-555555555555'

test('public audit identity survives public-delivery isolation without granting authorization', async () => {
  assert.equal(publicAuditUserId(), null)
  await withPublicAuditIdentity(TEST_USER_ID, async () => {
    assert.equal(publicAuditUserId(), TEST_USER_ID)
    await withPublicDeliveryScope(async () => {
      assert.equal(isPublicDeliveryScope(), true)
      assert.equal(publicAuditUserId(), TEST_USER_ID, 'audit correlation must survive nested public scope')
      const access = await getAccess()
      assert.equal(access.userId, null, 'public model execution must not inherit authenticated identity')
      assert.equal(access.role, 'guest')
      assert.equal(access.isOwner, false)
      assert.equal(access.isAdmin, false)
    })
  })
  assert.equal(publicAuditUserId(), null, 'audit identity must not leak outside the request scope')
})

test('browser ingress captures audit identity before entering public delivery scope', () => {
  const source = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(source, /const auditUserId = \(await getAccess\(\)/)
  assert.match(source, /withPublicAuditIdentity\(auditUserId/)
  assert.match(source, /withPublicDeliveryScope/)
  assert.ok(source.indexOf('const auditUserId = (await getAccess()') < source.indexOf('withPublicAuditIdentity(auditUserId'), 'identity must be captured before public scope')
})

test('COS primary provenance falls back to audit identity and blocks cross-scope reads', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosPrimaryTurnProvenance.ts', import.meta.url), 'utf8')
  assert.match(source, /return userId \|\| publicAuditUserId\(\)/)
  assert.match(source, /delivery_scope: 'public_concierge'/)
  assert.match(source, /authorization_authority: false/)
  assert.match(source, /exposed_to_reasoning: false/)
  assert.match(source, /publicScopeCompatible\(data\.provenance\)/)
  assert.match(source, /recordLatestUserTurnProvenance\(effectiveUserId/)
})
