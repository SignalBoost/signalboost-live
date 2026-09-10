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

test('owner Website Optimizer exposes durable fixing, failure and independently verified fixed states', () => {
  const route = read('../app/api/owner/site-optimization/remediate/route.ts')
  const status = read('../components/owner/WebsiteOptimizerRepairStatus.tsx')
  const layout = read('../app/website-optimizer/layout.tsx')

  assert.match(route, /export async function GET\(req: Request\)/)
  assert.match(route, /from\('builder_jobs'\)/)
  assert.match(route, /selfHealingOwnedSite: true, selfHealingSource: 'website-optimizer'/)
  assert.match(route, /status: 'queued'/)
  assert.match(route, /status: 'fixing'/)
  assert.match(route, /status: 'testing'/)
  assert.match(route, /status: 'failed'/)
  assert.match(route, /status: 'verifying'/)
  assert.match(route, /status: 'fixed'/)
  assert.match(route, /Fixed ✅/)
  assert.match(route, /Production still has Website Optimizer findings\. It is not fixed yet\./)
  assert.match(route, /productionVerification\(\)/)

  assert.match(status, /method: 'GET'/)
  assert.match(status, /window\.setTimeout\(refresh/)
  assert.match(status, /data-owner-optimizer-repair-status=/)
  assert.match(status, /status\.replaceAll\('_', ' '\)/)
  assert.match(layout, /<WebsiteOptimizerRepairStatus \/>/)
})

test('owned-site repair targeting cannot be hijacked by diagnostic transport errors', () => {
  const repair = read('../self-healing-host/owned-site-autonomous-repair.ts')

  assert.match(repair, /DIAGNOSTIC_TRANSPORT_FAILURE/)
  assert.match(repair, /diagnostic-provider transport\/schema errors are not website defects/)
  assert.match(repair, /saas\/app\/api\/public\/site-optimization\/route\.ts/)
  assert.match(repair, /saas\/next\.config\.mjs/)
  assert.match(repair, /saas\/app\/layout\.tsx/)
  assert.match(repair, /saas\/app\/page\.tsx/)
  assert.match(repair, /missing_csp and missing_nosniff are public HTTP response-header observations/)
  assert.match(repair, /many_scripts is the rendered public HTML script-element workload/)
})

test('iTMounts sends baseline CSP and nosniff headers without weakening optimizer checks', () => {
  const config = read('../next.config.mjs')
  const publicRoute = read('../app/api/public/site-optimization/route.ts')

  assert.match(config, /Content-Security-Policy/)
  assert.match(config, /X-Content-Type-Options/)
  assert.match(config, /value: 'nosniff'/)
  assert.match(config, /upgrade-insecure-requests/)
  assert.match(publicRoute, /if \(!csp\) add\(findings, 'missing_csp'/)
  assert.match(publicRoute, /if \(!\/nosniff\/i\.test\(xcto\)\) add\(findings, 'missing_nosniff'/)
})
