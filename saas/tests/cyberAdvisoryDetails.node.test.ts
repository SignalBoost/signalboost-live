import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ts = require('typescript')

const vuln = (id = 'GHSA-example-1') => ({
  id, summary: 'A package-specific security advisory', database_specific: { severity: 'HIGH' },
  aliases: ['CVE-2026-0001'],
  affected: [
    { package: { ecosystem: 'npm', name: 'different-package' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '9.0.0' }] }] },
    { package: { ecosystem: 'npm', name: 'example' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.2.4' }] }] },
  ],
  references: [{ type: 'ADVISORY', url: 'https://github.com/advisories/GHSA-example-1' }],
})

function scanner(fetcher: typeof fetch) {
  const file = new URL('../lib/cyber/dependencyScanner.ts', import.meta.url)
  const source = readFileSync(file, 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} as any }
  const imports = (spec: string) => {
    assert.equal(spec, '@/lib/audit/repoTarget')
    return {
      parseRepoUrl: () => ({ repo: 'SignalBoost/signalboost-live', branch: 'main', subPath: '', raw: 'SignalBoost/signalboost-live' }),
      listRepoTree: async () => ({ ok: true, branch: 'main', files: ['package.json'] }),
      readRepoFileFrom: async () => ({ ok: true, content: JSON.stringify({ dependencies: { example: '1.2.3' } }) }),
    }
  }
  new Function('require', 'module', 'exports', 'fetch', output)(imports, module, module.exports, fetcher)
  return module.exports.scanDependencyAdvisories
}
const json = (body: unknown, status = 200) => Response.json(body, { status })

test('ID-only OSV batch results are hydrated before severity, explanation and package-specific fixes are used', async () => {
  const urls: string[] = []
  const scan = scanner((async (input: any) => {
    urls.push(String(input))
    return String(input).endsWith('/querybatch') ? json({ results: [{ vulns: [{ id: 'GHSA-example-1', modified: '2026-09-01T00:00:00Z' }] }] }) : json(vuln())
  }) as typeof fetch)
  const report = await scan()
  assert.equal(report.ok, true)
  assert.equal(report.advisories[0].severity, 'high')
  assert.equal(report.advisories[0].summary, vuln().summary)
  assert.deepEqual(report.advisories[0].fixedVersions, ['1.2.4'])
  assert.deepEqual(report.advisories[0].aliases, ['CVE-2026-0001'])
  assert.equal(report.advisories[0].detailStatus, 'available')
  assert.equal(report.summary.high, 1)
  assert.ok(urls.includes('https://api.osv.dev/v1/vulns/GHSA-example-1'))
})

test('failed detail retrieval preserves the finding as explicitly unknown, never harmless or fixable', async () => {
  const scan = scanner((async (input: any) => String(input).endsWith('/querybatch')
    ? json({ results: [{ vulns: [{ id: 'GHSA-example-1' }] }] }) : json({ error: 'unavailable' }, 503)) as typeof fetch)
  const report = await scan()
  assert.equal(report.ok, true)
  assert.equal(report.advisories.length, 1)
  assert.equal(report.summary.unknown, 1)
  assert.equal(report.advisories[0].detailStatus, 'unavailable')
  assert.deepEqual(report.advisories[0].fixedVersions, [])
  assert.match(report.advisories[0].summary, /unavailable/i)
})

test('malformed or truncated batch results cannot become a successful zero-finding scan', async () => {
  for (const body of [{}, { results: [] }, { results: [null] }, { results: [{ vulns: 'invalid' }] }]) {
    const report = await scanner((async () => json(body)) as typeof fetch)()
    assert.equal(report.ok, false)
  }
})

test('moderate is normalized to medium; an unsupported CVSS vector remains unknown rather than guessed', async () => {
  for (const [severity, expected] of [['MODERATE', 'medium'], ['not-high', 'unknown']] as const) {
    const record = { ...vuln(), database_specific: { severity }, severity: [{ type: 'CVSS_V4', score: 'CVSS:4.0/AV:N' }] }
    const report = await scanner((async (input: any) => String(input).endsWith('/querybatch')
      ? json({ results: [{ vulns: [{ id: record.id }] }] }) : json(record)) as typeof fetch)()
    assert.equal(report.advisories[0].severity, expected)
    assert.equal(report.advisories[0].summary, record.summary)
  }
})

test('mismatched advisory identity or package cannot supply severity or fixed-version authority', async () => {
  for (const record of [{ ...vuln(), id: 'GHSA-other' }, { ...vuln(), affected: [vuln().affected[0]] }]) {
    const report = await scanner((async (input: any) => String(input).endsWith('/querybatch')
      ? json({ results: [{ vulns: [{ id: 'GHSA-example-1' }] }] }) : json(record)) as typeof fetch)()
    assert.equal(report.advisories[0].detailStatus, 'unavailable')
    assert.deepEqual(report.advisories[0].fixedVersions, [])
    assert.equal(report.summary.unknown, 1)
  }
})

test('per-package pagination is followed and repeated advisory IDs are hydrated once', async () => {
  let batch = 0
  let details = 0
  const report = await scanner((async (input: any, init: any) => {
    if (String(input).endsWith('/querybatch')) {
      const queries = JSON.parse(init.body).queries
      if (batch++ === 0) return json({ results: [{ vulns: [{ id: 'GHSA-example-1' }], next_page_token: 'next' }] })
      assert.equal(queries[0].page_token, 'next')
      return json({ results: [{ vulns: [{ id: 'GHSA-example-1' }, { id: 'GHSA-example-2' }] }] })
    }
    details++
    return json(vuln(String(input).split('/').at(-1)))
  }) as typeof fetch)()
  assert.equal(report.ok, true)
  assert.equal(report.advisories.length, 2)
  assert.equal(details, 2)
})


test('repeated pagination fails closed and full-detail fetch concurrency stays bounded', async () => {
  const repeated = await scanner((async () => json({ results: [{ next_page_token: 'repeat' }] })) as typeof fetch)()
  assert.equal(repeated.ok, false)
  let active = 0
  let peak = 0
  const report = await scanner((async (input: any) => {
    if (String(input).endsWith('/querybatch')) return json({ results: [{ vulns: Array.from({ length: 9 }, (_, i) => ({ id: `GHSA-example-${i}` })) }] })
    peak = Math.max(peak, ++active)
    await new Promise(resolve => setTimeout(resolve, 2))
    active--
    return json(vuln(String(input).split('/').at(-1)))
  }) as typeof fetch)()
  assert.equal(report.advisories.length, 9)
  assert.ok(peak > 1 && peak <= 4)
})


test('only compatible fixes for the current affected interval reach stored plan evidence', async () => {
  const record = vuln()
  record.affected[1].ranges[0].events = [
    { introduced: '0' }, { fixed: '1.0.9' },
    { introduced: '1.2.0' }, { fixed: '1.2.4' },
    { introduced: '1.3.0' }, { fixed: '1.3.1' },
  ]
  const report = await scanner((async (input: any) => String(input).endsWith('/querybatch')
    ? json({ results: [{ vulns: [{ id: record.id }] }] }) : json(record)) as typeof fetch)()
  assert.equal(report.ok, true)
  assert.deepEqual(report.advisories[0].fixedVersions, ['1.2.4'])
  assert.equal(report.advisories[0].fixedVersions[0], '1.2.4')
  assert.ok(report.advisories[0].affectedRanges[0].includes('1.0.9'))
})

test('breaking, ambiguous and unclosed advisory intervals cannot supply a routine fix', async () => {
  for (const events of [
    [{ introduced: '0' }, { fixed: '2.0.0' }],
    [{ fixed: '1.2.4' }],
    [{ introduced: '1.3.0' }, { fixed: '1.3.1' }],
    [{ introduced: '1.2.0' }, { last_affected: '1.2.3' }],
    [{ introduced: '1.2.0' }, { limit: '1.2.4' }],
  ]) {
    const record = vuln()
    record.affected[1].ranges[0].events = events as any
    const report = await scanner((async (input: any) => String(input).endsWith('/querybatch')
      ? json({ results: [{ vulns: [{ id: record.id }] }] }) : json(record)) as typeof fetch)()
    assert.deepEqual(report.advisories[0].fixedVersions, [])
  }
})

for (const [name, events] of [
  ['consecutive introduced boundaries', [{ introduced: '0' }, { introduced: '1.2.0' }, { fixed: '1.2.4' }]],
  ['malformed trailing interval', [{ introduced: '0' }, { fixed: '1.2.4' }, { introduced: '1.3.0' }, { introduced: '1.3.1' }, { fixed: '1.3.2' }]],
  ['multiple keys after a valid interval', [{ introduced: '0' }, { fixed: '1.2.4' }, { introduced: '1.3.0', fixed: '1.3.2' }]],
  ['orphan fixed boundary before a valid interval', [{ fixed: '1.0.0' }, { introduced: '1.2.0' }, { fixed: '1.2.4' }]],
  ['a fix that is immediately reintroduced', [{ introduced: '0' }, { fixed: '1.2.4' }, { introduced: '1.2.4' }, { fixed: '1.2.5' }]],
] as const) {
  test(`the entire advisory range fails closed for ${name}`, async () => {
    const record = vuln()
    record.affected[1].ranges[0].events = events as any
    const report = await scanner((async (input: any) => String(input).endsWith('/querybatch')
      ? json({ results: [{ vulns: [{ id: record.id }] }] }) : json(record)) as typeof fetch)()
    assert.equal(report.ok, true)
    assert.equal(report.advisories[0].severity, 'high', 'The finding remains visible')
    assert.deepEqual(report.advisories[0].fixedVersions, [], 'Ambiguous data never grants patch evidence')
  })
}
