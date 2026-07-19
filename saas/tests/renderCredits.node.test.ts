// saas/tests/renderCredits.node.test.ts
// Pins customer pricing math and the verified-owner unlimited entitlement wiring.

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { RENDER_MARKUP, creditsForProviderCost } from '../lib/credits/renderPricing.ts'

test('markup is 3x', () => {
  assert.equal(RENDER_MARKUP, 3)
})

test('a provider cost of 100c charges the user 300 credits (3x)', () => {
  assert.equal(creditsForProviderCost(100), 300)
})

test('rounds up so the platform never undercharges', () => {
  assert.equal(creditsForProviderCost(33), 99)
  assert.equal(creditsForProviderCost(33.4), 102)
})

test('zero or negative provider cost never charges negative credits', () => {
  assert.equal(creditsForProviderCost(0), 0)
  assert.equal(creditsForProviderCost(-50), 0)
})

test('a typical $4 render costs a customer 1200 credits', () => {
  assert.equal(creditsForProviderCost(400), 1200)
})

test('verified owner bypasses deductions while usage remains accounted', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'lib/credits/renderCredits.ts'), 'utf8')
  assert.match(source, /entitlements\.unlimitedCredits/)
  assert.match(source, /credits_charged:\s*0/)
  assert.match(source, /provider_cost_cents:\s*Math\.ceil/)
  assert.match(source, /unlimited:\s*true/)
})

test('owner entitlement uses OWNER_EMAILS and team_members owner role', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'lib/auth/ownerEntitlements.ts'), 'utf8')
  assert.match(source, /OWNER_EMAILS/)
  assert.match(source, /team_members/)
  assert.match(source, /role[^\n]*owner|owner[^\n]*role/)
  assert.match(source, /auth\.admin\.getUserById/)
})

test('render-credit API exposes unlimited owner state', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'app/api/agency/render-credits/route.ts'), 'utf8')
  assert.match(source, /access\.isOwner/)
  assert.match(source, /unlimited:\s*true/)
  assert.match(source, /balance:\s*null/)
})
