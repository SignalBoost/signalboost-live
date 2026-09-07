import assert from 'node:assert/strict'
import test from 'node:test'
import { accessFromVerifiedIdentity, publicAccessFromVerifiedIdentity } from '../lib/auth/access.ts'

const USER_ID = '11111111-1111-4111-8111-111111111111'

test('public Concierge preserves only the authenticated customer id', () => {
  const ctx = publicAccessFromVerifiedIdentity(USER_ID)

  assert.equal(ctx.userId, USER_ID)
  assert.equal(ctx.email, null)
  assert.equal(ctx.role, 'member')
  assert.equal(ctx.isMember, true)
  assert.equal(ctx.isOwner, false)
  assert.equal(ctx.isAdmin, false)
})

test('public Concierge downgrade cannot inherit owner authority', () => {
  const privateOwner = accessFromVerifiedIdentity(USER_ID, 'cadomos@gmail.com')
  const publicOwner = publicAccessFromVerifiedIdentity(USER_ID)

  assert.equal(privateOwner.isOwner, true)
  assert.equal(privateOwner.isAdmin, true)
  assert.equal(publicOwner.isOwner, false)
  assert.equal(publicOwner.isAdmin, false)
  assert.equal(publicOwner.role, 'member')
})
