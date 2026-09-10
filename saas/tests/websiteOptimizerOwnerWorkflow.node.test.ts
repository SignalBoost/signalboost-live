import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('owner canonical Website Optimizer scan enters the protected Self-Healing lane', () => {
  const page = read('../app/website-optimizer/page.tsx')
  const route = read('../app/api/owner/site-optimization/remediate/route.ts')

  assert.match(page, /owner && isCanonicalOwnedTarget\(scanTarget\)/)
  assert.match(page, /await startOwnerWorkflow\(\)/)
  assert.match(page, /\/api\/owner\/site-optimization\/remediate/)
  assert.match(page, /ownerTarget \? \(/)

  assert.match(route, /sameOriginOk\(req\)/)
  assert.match(route, /accessFromVerifiedIdentity\(user\.id, user\.email\)\.isOwner/)
  assert.match(route, /ownedSiteOptimizationMonitoringCollector\(\{ apiBaseUrl: PUBLIC_BRAND\.siteUrl \}\)/)
  assert.match(route, /remediateNativeIncidents\(monitoring\.incidents, \{ maxIncidents: 1 \}\)/)
  assert.doesNotMatch(route, /req\.json\(|searchParams/)
})

test('public Website Optimizer scans remain report-only and cannot trigger repository repair', () => {
  const page = read('../app/website-optimizer/page.tsx')
  const publicRoute = read('../app/api/public/site-optimization/route.ts')

  assert.match(page, /\/api\/public\/site-optimization/)
  assert.match(page, /planHref\(target\)/)
  assert.match(page, /else if \(!owner\)/)
  assert.match(publicRoute, /remediationLocked: true/)
  assert.doesNotMatch(publicRoute, /remediateNativeIncidents|enqueueOwnedSiteOptimizationRepair/)
})

test('owner workflow reports a visible terminal status for healthy and repair cases', () => {
  const page = read('../app/website-optimizer/page.tsx')
  const route = read('../app/api/owner/site-optimization/remediate/route.ts')

  assert.match(page, /ownerWorkflow\?\.message/)
  assert.match(route, /status: 'healthy'/)
  assert.match(route, /status: unavailable \? 'repair_unavailable' : 'repair_started'/)
  assert.match(route, /message,/)
})
