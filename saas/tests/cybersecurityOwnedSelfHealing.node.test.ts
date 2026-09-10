import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ownedSiteCybersecurityMonitoringCollector,
  OWNED_SITE_CYBERSECURITY_FINDINGS_ERROR,
  OWNED_SITE_CYBERSECURITY_PROBE_FAILED_ERROR,
} from '../self-healing-host/owned-site-cybersecurity-monitoring.ts'

const context = { provider: 'signalboost-platform', environment: 'production' as const, metadata: {} }
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('owned cybersecurity findings become one pre-authorized supervisor incident', async () => {
  const collector = ownedSiteCybersecurityMonitoringCollector({
    apiBaseUrl: 'https://deployment.example',
    now: () => new Date('2026-09-10T17:30:00.000Z'),
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(url), 'https://deployment.example/api/public/cybersecurity-preview')
      assert.equal(init?.method, 'POST')
      assert.deepEqual(JSON.parse(String(init?.body)), { url: 'https://itmounts.com' })
      return new Response(JSON.stringify({
        ok: true,
        finalUrl: 'https://itmounts.com/',
        summary: { score: 87, findings: 2, high: 0, medium: 1, low: 1 },
        findings: [
          { code: 'wildcard_cors', category: 'headers', severity: 'medium' },
          { code: 'server_header_exposed', category: 'exposure', severity: 'low', value: 'Vercel' },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch,
  })

  const incidents = await collector.observer.observe(context)
  assert.equal(incidents.length, 1)
  assert.equal(incidents[0].errorCode, OWNED_SITE_CYBERSECURITY_FINDINGS_ERROR)
  assert.equal(incidents[0].severity, 'warning')
  assert.equal(incidents[0].affectedResource, 'https://itmounts.com/')
  assert.equal(incidents[0].metadata.nativeProbe, 'owned-site-cybersecurity')
  assert.equal(incidents[0].metadata.recoveryPreauthorized, true)
  assert.equal(incidents[0].metadata.ownedPlatform, true)
})

test('healthy owned cybersecurity report produces no incident', async () => {
  const collector = ownedSiteCybersecurityMonitoringCollector({
    apiBaseUrl: 'https://deployment.example',
    fetchImpl: (async () => new Response(JSON.stringify({
      ok: true,
      finalUrl: 'https://itmounts.com/',
      summary: { score: 100, findings: 0, high: 0, medium: 0, low: 0 },
      findings: [],
    }), { status: 200 })) as typeof fetch,
  })
  assert.deepEqual(await collector.observer.observe(context), [])
})

test('cybersecurity probe failure becomes a critical owned-site incident', async () => {
  const collector = ownedSiteCybersecurityMonitoringCollector({
    apiBaseUrl: 'https://deployment.example',
    fetchImpl: (async () => new Response(JSON.stringify({ ok: false, error: 'Could not load this public website.' }), { status: 400 })) as typeof fetch,
  })
  const incidents = await collector.observer.observe(context)
  assert.equal(incidents.length, 1)
  assert.equal(incidents[0].errorCode, OWNED_SITE_CYBERSECURITY_PROBE_FAILED_ERROR)
  assert.equal(incidents[0].severity, 'critical')
})

test('public cybersecurity endpoint remains report-only while owner route owns remediation', () => {
  const publicRoute = read('../app/api/public/cybersecurity-preview/route.ts')
  const ownerRoute = read('../app/api/owner/cybersecurity/remediate/route.ts')
  const loop = read('../self-healing-host/native-autonomous-loop.ts')
  const pageLayout = read('../app/cybersecurity-check/layout.tsx')
  const status = read('../components/owner/CybersecurityRepairStatus.tsx')

  assert.match(publicRoute, /remediationLocked: true/)
  assert.match(publicRoute, /wildcard_cors/)
  assert.match(publicRoute, /server_header_exposed/)
  assert.doesNotMatch(publicRoute, /remediateNativeIncidents|enqueueOwnedSiteCybersecurityRepair/)

  assert.match(ownerRoute, /accessFromVerifiedIdentity\(user\.id, user\.email\)\.isOwner/)
  assert.match(ownerRoute, /ownedSiteCybersecurityMonitoringCollector/)
  assert.match(ownerRoute, /remediateNativeIncidents\(monitoring\.incidents, \{ maxIncidents: 1 \}\)/)
  assert.match(ownerRoute, /status: 'fixed'/)
  assert.match(ownerRoute, /Production still has Cybersecurity Preview findings/)
  assert.match(loop, /enqueueOwnedSiteCybersecurityRepair/)
  assert.match(pageLayout, /CybersecurityRepairStatus/)
  assert.match(status, /\/api\/owner\/cybersecurity\/remediate/)
  assert.match(status, /data-owner-cybersecurity-repair-status/)
})

test('native proactive monitor includes canonical cybersecurity collector', () => {
  const cron = read('../app/api/cron/native-proactive-monitoring/route.ts')
  assert.match(cron, /ownedSiteCybersecurityMonitoringCollector\(\{ apiBaseUrl: baseUrl \}\)/)
  assert.match(cron, /self-healing-native-proactive-monitoring-v8/)
})

test('root header policy removes wildcard CORS intent without weakening cybersecurity checks', () => {
  const config = read('../next.config.mjs')
  const publicRoute = read('../app/api/public/cybersecurity-preview/route.ts')
  assert.match(config, /Access-Control-Allow-Origin', value: 'https:\/\/itmounts\.com'/)
  assert.doesNotMatch(config, /Access-Control-Allow-Origin', value: '\*'/)
  assert.match(config, /Server', value: ''/)
  assert.match(publicRoute, /cors\.trim\(\) === '\*'/)
  assert.match(publicRoute, /if \(server\) add\(findings, 'server_header_exposed'/)
})

test('Vercel CDN deletes the hosting Server header on the canonical public root', () => {
  const config = JSON.parse(read('../vercel.json')) as { routes?: Array<{ src?: string; transforms?: Array<{ type?: string; op?: string; target?: { key?: string } }> }> }
  const root = config.routes?.find(route => route.src === '/')
  assert.ok(root, 'expected an exact-root CDN transform route')
  assert.ok(root.transforms?.some(transform =>
    transform.type === 'response.headers'
      && transform.op === 'delete'
      && String(transform.target?.key || '').toLowerCase() === 'server'
  ), 'expected the root CDN route to delete the Server response header')
})

test('owner manual canonical scan starts protected Self-Healing and refreshes visible status', () => {
  const page = read('../app/cybersecurity-check/page.tsx')
  const status = read('../components/owner/CybersecurityRepairStatus.tsx')

  assert.match(page, /isOwner && isCanonicalOwnedTarget\(scannedTarget\)/)
  assert.match(page, /fetch\('\/api\/owner\/cybersecurity\/remediate'/)
  assert.match(page, /CustomEvent\(OWNER_STATUS_EVENT/)
  assert.match(page, /\{isOwner \? null : <span>\{copy\.hint\}<\/span>\}/)
  assert.match(status, /OWNER_STATUS_EVENT = 'itmounts:cybersecurity-owner-status'/)
  assert.match(status, /window\.addEventListener\(OWNER_STATUS_EVENT, onManualOwnerStatus\)/)
  assert.match(status, /schedule\(String\(detail\.status \|\| ''\)\)/)
})
