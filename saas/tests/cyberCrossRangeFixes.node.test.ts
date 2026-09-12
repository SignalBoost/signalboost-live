import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ts = require('typescript')

const source = readFileSync(new URL('../lib/cyber/dependencyScanner.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const range = (introduced: string, fixed: string) => ({ type: 'SEMVER', events: [{ introduced }, { fixed }] })
const entry = (ranges: unknown[], extra: Record<string, unknown> = {}) => ({ package: { ecosystem: 'npm', name: 'example' }, ranges, ...extra })

async function normalized(affected: unknown[]) {
  const module = { exports: {} as any }
  const imports = (name: string) => {
    assert.equal(name, '@/lib/audit/repoTarget')
    return {
      parseRepoUrl: () => ({ repo: 'SignalBoost/signalboost-live', branch: 'main', subPath: '', raw: 'https://github.com/SignalBoost/signalboost-live' }),
      listRepoTree: async () => ({ ok: true, branch: 'main', files: ['package.json'] }),
      readRepoFileFrom: async () => ({ ok: true, content: JSON.stringify({ dependencies: { example: '1.2.3' } }) }),
    }
  }
  const fetcher = async (input: unknown) => Response.json(String(input).endsWith('/querybatch')
    ? { results: [{ vulns: [{ id: 'GHSA-cross-range' }] }] }
    : { id: 'GHSA-cross-range', summary: 'Still-visible advisory', database_specific: { severity: 'HIGH' }, affected })
  new Function('require', 'module', 'exports', 'fetch', output)(imports, module, module.exports, fetcher)
  const report = await module.exports.scanDependencyAdvisories()
  assert.equal(report.ok, true)
  assert.equal(report.summary.high, 1, 'A blocked recommendation must not erase its finding')
  assert.equal(report.advisories[0].summary, 'Still-visible advisory')
  assert.equal(report.advisories[0].detailStatus, 'available')
  return report.advisories[0].fixedVersions
}

test('overlapping sibling ranges select only the fix outside both ranges, regardless of order', async () => {
  const ranges = [range('0', '1.2.4'), range('1.2.0', '1.2.5')]
  for (const ordered of [ranges, [...ranges].reverse()]) {
    assert.deepEqual(await normalized([entry(ordered)]), ['1.2.5'])
  }
})

test('every matching affected entry is checked before a fix becomes plan evidence', async () => {
  const entries = [entry([range('0', '1.2.4')]), entry([range('1.2.0', '1.2.5')])]
  for (const ordered of [entries, [...entries].reverse()]) {
    assert.deepEqual(await normalized(ordered), ['1.2.5'])
  }
})

for (const [name, sibling] of [
  ['open-ended range', { type: 'SEMVER', events: [{ introduced: '1.2.0' }] }],
  ['future reintroduction at the proposed fix', range('1.2.4', '1.2.5')],
  ['inclusive last_affected boundary', { type: 'SEMVER', events: [{ introduced: '1.2.0' }, { last_affected: '1.2.4' }] }],
  ['limit above the proposed fix', { type: 'SEMVER', events: [{ introduced: '1.2.0' }, { limit: '1.2.5' }] }],
  ['malformed sibling', { type: 'SEMVER', events: [{ introduced: '1.2.0' }, { introduced: '1.2.1' }, { fixed: '1.2.5' }] }],
  ['empty sibling', { type: 'SEMVER', events: [] }],
  ['unsupported GIT range', { type: 'GIT', events: [{ introduced: 'abc' }, { fixed: 'def' }] }],
] as const) {
  test(`a ${name} vetoes an unsafe or unverified candidate without hiding the finding`, async () => {
    assert.deepEqual(await normalized([entry([range('0', '1.2.4'), sibling])]), [])
  })
}

test('explicit affected versions veto a candidate even when a range calls it fixed', async () => {
  assert.deepEqual(await normalized([entry([range('0', '1.2.4')], { versions: ['1.2.4'] })]), [])
  assert.deepEqual(await normalized([entry([range('0', '1.2.4')]), entry([], { versions: ['1.2.4'] })]), [])
})

test('malformed version lists or matching entries do not grant patch authority', async () => {
  for (const sibling of [entry([], { versions: '1.2.4' }), entry([]), entry([], { versions: ['1.2.4+build'] }), entry([], { ranges: null })]) {
    assert.deepEqual(await normalized([entry([range('0', '1.2.4')]), sibling]), [])
  }
})

test('disjoint and duplicate ranges preserve a genuinely unaffected compatible fix', async () => {
  for (const sibling of [range('0', '1.1.0'), range('1.3.0', '1.3.1'), range('0', '1.2.4')]) {
    assert.deepEqual(await normalized([entry([range('0', '1.2.4'), sibling])]), ['1.2.4'])
  }
})

test('last_affected is inclusive and a larger confirmed fix is retained', async () => {
  assert.deepEqual(await normalized([entry([range('0', '1.2.5'), { type: 'SEMVER', events: [{ introduced: '1.2.0' }, { last_affected: '1.2.4' }] }])]), ['1.2.5'])
})

test('unrelated packages do not veto the queried package and records remain unchanged', async () => {
  const affected = [entry([range('0', '1.2.4')]), { package: { ecosystem: 'npm', name: 'unrelated' }, ranges: [{ type: 'GIT', events: [] }] }]
  const original = JSON.stringify(affected)
  assert.deepEqual(await normalized(affected), ['1.2.4'])
  assert.equal(JSON.stringify(affected), original)
})
