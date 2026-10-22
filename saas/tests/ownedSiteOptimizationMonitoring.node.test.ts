import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isCanonicalOwnedSite,
  ownedSiteOptimizationMonitoringCollector,
  OWNED_SITE_OPTIMIZATION_FINDINGS_ERROR,
  OWNED_SITE_OPTIMIZATION_PROBE_FAILED_ERROR,
} from '../self-healing-host/owned-site-optimization-monitoring.ts'

const context = {
  provider: 'signalboost-platform',
  environment: 'production' as const,
  metadata: {},
}

test('owned-site target allowlist accepts only canonical iTMounts HTTPS host', () => {
  assert.equal(isCanonicalOwnedSite('https://itmounts.com/'), true)
  assert.equal(isCanonicalOwnedSite('https://itmounts.com/home'), true)
  assert.equal(isCanonicalOwnedSite('http://itmounts.com/'), false)
  assert.equal(isCanonicalOwnedSite('https://example.com/'), false)
  assert.equal(isCanonicalOwnedSite('https://itmounts.com.evil.example/'), false)
})

test('owned-site optimizer findings become one pre-authorized supervisor incident', async () => {
  const collector = ownedSiteOptimizationMonitoringCollector({
    apiBaseUrl: 'https://deployment.example',
    now: () => new Date('2026-09-10T14:30:00.000Z'),
    fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
      assert.equal(init?.method, 'POST')
      assert.deepEqual(JSON.parse(String(init?.body)), { url: 'https://itmounts.com' })
      return new Response(JSON.stringify({
        ok: true,
        finalUrl: 'https://itmounts.com/',
        summary: { score: 80, findings: 3, high: 0, medium: 2, low: 1 },
        findings: [
          { code: 'many_scripts', category: 'performance', severity: 'medium', value: 38 },
          { code: 'missing_csp', category: 'security', severity: 'medium' },
          { code: 'missing_hsts', category: 'security', severity: 'low' },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch,
  })

  const incidents = await collector.observer.observe(context)
  assert.equal(incidents.length, 1)
  assert.equal(incidents[0].errorCode, OWNED_SITE_OPTIMIZATION_FINDINGS_ERROR)
  assert.equal(incidents[0].severity, 'warning')
  assert.equal(incidents[0].affectedResource, 'https://itmounts.com/')
  assert.equal(incidents[0].metadata.nativeProbe, 'owned-site-optimization')
  assert.equal(incidents[0].metadata.recoveryPreauthorized, true)
  assert.equal(incidents[0].metadata.ownedPlatform, true)
  // Only repairable findings drive the repair; the workload measurement stays visible as advisory.
  assert.equal((incidents[0].metadata.report as any).findingCodes, 'missing_csp,missing_hsts')
  assert.equal((incidents[0].metadata.report as any).advisoryCodes, 'many_scripts')
})

test('a report with only workload or content measurements queues no repair (Production 2026-10-22: many_scripts x11)', async () => {
  for (const codes of [['many_scripts'], ['many_scripts', 'large_html', 'moderate_response', 'missing_cta']]) {
    const collector = ownedSiteOptimizationMonitoringCollector({
      apiBaseUrl: 'https://deployment.example',
      fetchImpl: (async () => new Response(JSON.stringify({
        ok: true, finalUrl: 'https://itmounts.com/', summary: { score: 92, findings: codes.length, high: 0, medium: codes.length, low: 0 },
        findings: codes.map(code => ({ code, category: 'performance', severity: 'medium', value: 38 })),
      }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch,
    })
    assert.deepEqual(await collector.observer.observe(context), [], codes.join(','))
  }
})

test('healthy owned-site optimizer report produces no incident', async () => {
  const collector = ownedSiteOptimizationMonitoringCollector({
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

test('optimizer 400 on owned site becomes a critical repair incident', async () => {
  const collector = ownedSiteOptimizationMonitoringCollector({
    apiBaseUrl: 'https://deployment.example',
    fetchImpl: (async () => new Response(JSON.stringify({ ok: false, error: 'Could not load this public website.' }), { status: 400 })) as typeof fetch,
  })
  const incidents = await collector.observer.observe(context)
  assert.equal(incidents.length, 1)
  assert.equal(incidents[0].errorCode, OWNED_SITE_OPTIMIZATION_PROBE_FAILED_ERROR)
  assert.equal(incidents[0].severity, 'critical')
})
