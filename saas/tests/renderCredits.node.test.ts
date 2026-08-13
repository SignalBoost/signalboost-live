// saas/tests/renderCredits.node.test.ts
// Pins customer pricing math, unlimited owner entitlements, and owner-only access.

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { RENDER_MARKUP, creditsForProviderCost } from '../lib/credits/renderPricing.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


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

test('verified owner bypasses deductions only after usage is durably accounted', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'lib/credits/renderCredits.ts'), 'utf8').then(hydrateLocalizedSource)
  assert.match(source, /entitlements\.unlimitedCredits/)
  assert.match(source, /credits_charged:\s*0/)
  assert.match(source, /provider_cost_cents:\s*Math\.ceil/)
  assert.match(source, /if \(error \|\| !row\?\.id\)/)
  assert.match(source, /Could not record owner render usage\./)
  assert.match(source, /ledgerId:\s*row\.id/)
  assert.match(source, /unlimited:\s*true/)
  assert.doesNotMatch(source, /owner_unlimited_/)
})

test('owner entitlement is granted only through OWNER_EMAILS', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'lib/auth/ownerEntitlements.ts'), 'utf8').then(hydrateLocalizedSource)
  assert.match(source, /OWNER_EMAILS/)
  assert.match(source, /auth\.admin\.getUserById/)
  assert.doesNotMatch(source, /team_members/)
  assert.doesNotMatch(source, /ADMIN_EMAILS/)
})

test('canonical protected access treats only owner as admin', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'lib/auth/access.ts'), 'utf8').then(hydrateLocalizedSource)
  assert.match(source, /isAdmin:\s*isOwner/)
  assert.match(source, /if \(!ctx\.isOwner\)/)
  assert.doesNotMatch(source, /ADMIN_EMAILS/)
  assert.doesNotMatch(source, /team_members/)
})

test('credits status reuses the already-verified identity instead of repeating auth lookups', async () => {
  const [access, credits, route] = await Promise.all([
    readFile(path.resolve(process.cwd(), 'lib/auth/access.ts'), 'utf8').then(hydrateLocalizedSource),
    readFile(path.resolve(process.cwd(), 'lib/credits.ts'), 'utf8').then(hydrateLocalizedSource),
    readFile(path.resolve(process.cwd(), 'app/api/credits/route.ts'), 'utf8').then(hydrateLocalizedSource),
  ])

  assert.match(access, /export function accessFromVerifiedIdentity/)
  assert.match(route, /accessFromVerifiedIdentity\(user\.id, user\.email\)/)
  assert.doesNotMatch(route, /\bgetAccess\b/)
  assert.match(route, /getCreditState\(user\.id, \{ verifiedEmail: user\.email \}\)/)
  assert.match(credits, /export function isPrivilegedCreditEmail/)
  assert.match(credits, /verifiedEmail\?: string \| null/)
  assert.match(credits, /getCreditState\(userId, \{ privilegeChecked: true \}\)/)
})

test('admin layout is owner-only', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'app/admin/layout.tsx'), 'utf8').then(hydrateLocalizedSource)
  assert.match(source, /if \(!access\.isOwner\) redirect\('\/dashboard'\)/)
  assert.doesNotMatch(source, /access\.isAdmin/)
})

test('Hub permission middleware rejects workspace admins and synthesizes only owner', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'lib/auth/permission-middleware.ts'), 'utf8').then(hydrateLocalizedSource)
  assert.match(source, /if \(!access\.isOwner/)
  assert.match(source, /role:\s*'owner'/)
  assert.doesNotMatch(source, /hub_workspace_users/)
  assert.doesNotMatch(source, /access\.role === 'admin'/)
})

test('root marketing admin gate uses only owner allowlist', async () => {
  const source = await readFile(path.resolve(process.cwd(), '../lib/auth/marketingAdmin.ts'), 'utf8').then(hydrateLocalizedSource)
  assert.match(source, /OWNER_EMAILS/)
  assert.match(source, /OWNER_EMAIL/)
  assert.doesNotMatch(source, /ADMIN_EMAILS/)
  assert.doesNotMatch(source, /role === 'admin'/)
})

test('render-credit API exposes unlimited owner state', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'app/api/agency/render-credits/route.ts'), 'utf8').then(hydrateLocalizedSource)
  assert.match(source, /access\.isOwner/)
  assert.match(source, /unlimited:\s*true/)
  assert.match(source, /balance:\s*null/)
})