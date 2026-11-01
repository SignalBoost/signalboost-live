import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const script = new URL('../scripts/launch-production-smoke.mjs', import.meta.url).href

function smoke(responses) {
  const code = [
    `const responses = ${JSON.stringify(responses)};`,
    `globalThis.fetch = async (target, init) => { const path = new URL(target).pathname; const item = responses[path]; if (!item) throw Error('unexpected path'); if (init.redirect !== 'follow') throw Error('redirects not followed'); return { status: item.status, url: item.url }; };`,
    `await import(${JSON.stringify(script)});`,
  ].join('\n')
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, ITMOUNTS_SMOKE_BASE_URL: 'https://www.itmounts.com' } })
  const output = result.stdout.trim().split('\n').map(line => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean)
  return { code: result.status, output, report: output.at(-1), stderr: result.stderr }
}

const valid = {
  '/': { status: 200, url: 'https://itmounts.com/' },
  '/dashboard': { status: 200, url: 'https://itmounts.com/dashboard' },
  '/api/internal/lab-phase-observability/health': { status: 403, url: 'https://itmounts.com/api/internal/lab-phase-observability/health' },
}

test('canonical www to apex redirect can pass only after final authorized statuses', () => {
  const result = smoke(valid)
  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.report?.result, 'passed')
})

test('internal health redirected to a public login page cannot pass', () => {
  const result = smoke({ ...valid, '/api/internal/lab-phase-observability/health': { status: 200, url: 'https://itmounts.com/login' } })
  assert.equal(result.code, 1)
  assert.deepEqual(result.report?.failures, ['/api/internal/lab-phase-observability/health'])
})

test('redirects to an unrelated host or endpoint cannot certify public health', () => {
  for (const url of ['https://example.com/', 'https://itmounts.com/login']) {
    const result = smoke({ ...valid, '/': { status: 200, url } })
    assert.equal(result.code, 1)
    assert.deepEqual(result.report?.failures, ['/'])
  }
})
