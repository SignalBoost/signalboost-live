import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('legacy Hub execution cannot accept approval claims from a request body', () => {
  const route = read('../app/api/hub/run/route.ts')
  assert.match(route, /approvalGranted: false,/)
  assert.match(route, /approverRole: undefined,/)
  assert.doesNotMatch(route, /approvalGranted: !!body\?\.approvalGranted/)
  assert.doesNotMatch(route, /approverRole: typeof body\?\.approverRole/)
})

test('operator Hub approval is derived from authenticated owner policy only', () => {
  const route = read('../app/api/hub/operator/run/route.ts')
  assert.match(route, /const isOwner = ctx\.role === 'owner'/)
  assert.match(route, /const elevated = body\?\.elevated === true && isOwner/)
  assert.match(route, /approvalGranted: decision\.autoApproved,/)
  assert.match(route, /approverRole: decision\.autoApproved \? role : undefined,/)
  assert.doesNotMatch(route, /approvalGranted: decision\.autoApproved \? true : !!body\?\.approvalGranted/)
  assert.doesNotMatch(route, /approverRole: typeof body\?\.approverRole/)
})

test('host-side operator safety still evaluates permission and approval independently', () => {
  const policy = read('../console-core/operator/safetyPolicy.ts')
  assert.match(policy, /function approvalSufficient/)
  assert.match(policy, /if \(!granted\) return false/)
  assert.match(policy, /permits\(required as PermissionPolicy, approverRole \|\| 'user'\)/)
})
