import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const script = new URL('../scripts/launch-production-smoke.mjs', import.meta.url).href

function smoke(overrides = {}) {
  const responses = {
    'https://www.itmounts.com/': { status: 308, location: 'https://itmounts.com/' },
    'https://www.itmounts.com/dashboard': { status: 308, location: 'https://itmounts.com/dashboard' },
    'https://www.itmounts.com/api/internal/lab-phase-observability/health': { status: 308, location: 'https://itmounts.com/api/internal/lab-phase-observability/health' },
    'https://itmounts.com/': { status: 200 },
    'https://itmounts.com/dashboard': { status: 200 },
    'https://itmounts.com/api/internal/lab-phase-observability/health': { status: 403 },
    ...overrides,
  }
  const code = [
    `const responses = ${JSON.stringify(responses)};`,
    `globalThis.fetch = async (url, options) => {
      if (options.redirect !== 'manual') throw Error('unbounded redirect followed')
      const response = responses[String(url)]; if (!response) throw Error('unexpected destination: ' + url)
      return { status: response.status, headers: { get: name => name === 'location' ? response.location ?? null : null } }
    };`,
    `await import(${JSON.stringify(script)});`,
  ].join('\n')
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    encoding: 'utf8', env: { ...process.env, ITMOUNTS_SMOKE_BASE_URL: 'https://www.itmounts.com' },
  })
  const output = result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  return { status: result.status, report: output.at(-1), stderr: result.stderr }
}

test('www to apex canonical redirects resolve before public and private authorization checks', () => {
  const result = smoke()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.report?.result, 'passed')
})

test('a redirected internal health endpoint must finish with 401 or 403', () => {
  const result = smoke({ 'https://itmounts.com/api/internal/lab-phase-observability/health': { status: 200 } })
  assert.equal(result.status, 1)
  assert.deepEqual(result.report?.failures, ['/api/internal/lab-phase-observability/health'])
})

test('redirect to another host or a login page cannot certify the site', () => {
  for (const location of ['https://example.com/', 'https://itmounts.com/login']) {
    const result = smoke({ 'https://www.itmounts.com/': { status: 308, location } })
    assert.equal(result.status, 1)
    assert.deepEqual(result.report?.failures, ['/'])
  }
})

test('a redirect loop cannot run unbounded', () => {
  const result = smoke({ 'https://itmounts.com/': { status: 308, location: 'https://www.itmounts.com/' } })
  assert.equal(result.status, 1)
  assert.deepEqual(result.report?.failures, ['/'])
})
