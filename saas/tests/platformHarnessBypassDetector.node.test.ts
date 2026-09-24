// saas/tests/platformHarnessBypassDetector.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import test from 'node:test'

const root = new URL('..', import.meta.url)

function filesUnder(dir: string): string[] {
  const base = new URL(`${dir.replace(/\/$/, '')}/`, root)
  const path = base.pathname
  const out: string[] = []
  const visit = (current: string) => {
    for (const name of readdirSync(current)) {
      const full = join(current, name)
      if (statSync(full).isDirectory()) visit(full)
      else if (/\.(?:ts|tsx|mjs|js)$/.test(name)) out.push(full)
    }
  }
  visit(path)
  return out
}

function rel(path: string): string {
  return relative(root.pathname, path).split(sep).join('/')
}

test('all COS/Builder/RunPod scheduled routes have mandatory Harness ingress or own canonical Harness runtime', () => {
  const cron = filesUnder('app/api/cron')
    .filter(path => /\/route\.ts$/.test(path))
    .filter(path => /\/(?:cos-|builder-|runpod-)/.test(path))
  assert.ok(cron.length >= 50, `expected broad scheduled surface, found ${cron.length}`)

  const missing: string[] = []
  for (const path of cron) {
    const source = readFileSync(path, 'utf8')
    const selfGovernedResidency = rel(path) === 'app/api/cron/cos-university-residency/route.ts'
      && /platform-harness\/residency/.test(source)
      && /runBuilderResidencyOrchestrator/.test(source)
    if (!selfGovernedResidency && !/withScheduledProductionHarnessIngress/.test(source)) missing.push(rel(path))
  }
  assert.deepEqual(missing, [])
})

test('API routes cannot import the raw provider router directly', () => {
  const offenders = filesUnder('app/api').filter(path =>
    /(?:from\s+['"]@\/lib\/ai\/providerRouter|require\(['"]@\/lib\/ai\/providerRouter)/.test(readFileSync(path, 'utf8')),
  ).map(rel)
  assert.deepEqual(offenders, [])
})

test('raw provider execution stays behind the two approved COS gateway adapters', () => {
  const allowed = new Set(['lib/cos/textGateway.ts', 'lib/cos/aiPort.ts'])
  const providerImport = /(?:from\s+['"]@\/lib\/ai\/providerRouter|from\s+['"]\.\.\/ai\/providerRouter|from\s+['"]\.\/providerRouter)/
  const offenders = filesUnder('lib').filter(path => {
    const name = rel(path)
    if (allowed.has(name)) return false
    return readFileSync(path, 'utf8').split('\n').some(line =>
      providerImport.test(line) && !/^\s*import\s+type\b/.test(line),
    )
  }).map(rel)
  assert.deepEqual(offenders, [])
})
