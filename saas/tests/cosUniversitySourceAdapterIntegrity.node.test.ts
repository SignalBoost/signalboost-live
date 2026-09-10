import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('knowledge gaps carry bounded adapter exclusions into acquisition routing', () => {
  const contract = file('lib/cos-core/layers/learning/index.ts')
  const gaps = file('lib/cos-core/layers/learning/gaps.ts')
  const cycle = file('lib/cos-core/layers/learning/cycle.ts')

  assert.match(contract, /excludedAdapterIds\?: string\[\]/)
  assert.match(gaps, /excludedAdapterIds\?: string\[\]/)
  assert.match(gaps, /signal\.excludedAdapterIds \?\? \[\]/)
  assert.match(gaps, /excludedAdapterIds: excludedAdapterIds\.length \? excludedAdapterIds : undefined/)
  assert.match(cycle, /const excluded=new Set\(\(gap\.excludedAdapterIds\?\?\[\]\)/)
  assert.match(cycle, /if\(adapter\.id&&excluded\.has\(adapter\.id\)\)return false/)
  assert.match(cycle, /return !allowed\.length\|\|allowed\.includes\(adapter\.kind\)/)
})

test('University study excludes only the tertiary reference adapter from the shared public-web source kind', () => {
  const strategist = file('lib/ai/cos/cosUniversityStudyStrategy.ts')
  const liveSources = file('lib/cos-core/layers/learning/liveSources.ts')
  const connectors = file('lib/cos-core/layers/learning/connectors.ts')

  assert.match(strategist, /UNIVERSITY_EXCLUDED_STUDY_ADAPTER_IDS = \['reference'\] as const/)
  const exclusions = strategist.match(/excludedAdapterIds: \[\.\.\.UNIVERSITY_EXCLUDED_STUDY_ADAPTER_IDS\]/g) || []
  assert.equal(exclusions.length, 2, 'subject and language University gaps must both exclude reference')

  assert.match(liveSources, /id: 'reference'/)
  assert.match(liveSources, /id: 'credible_web'/)
  assert.match(liveSources, /kind: 'approved_public_web'/)
  assert.match(connectors, /en\.wikipedia\.org/)

  const credibleWebStart = liveSources.indexOf("id: 'credible_web'")
  assert.ok(credibleWebStart >= 0)
  const credibleWebBlock = liveSources.slice(credibleWebStart, credibleWebStart + 1200)
  assert.match(credibleWebBlock, /kind: 'approved_public_web'/)
  assert.doesNotMatch(strategist, /UNIVERSITY_EXCLUDED_STUDY_ADAPTER_IDS = \[[^\]]*credible_web/)
})

test('generic non-University learning keeps normal adapter behavior', () => {
  const cycle = file('lib/cos-core/layers/learning/cycle.ts')
  const gaps = file('lib/cos-core/layers/learning/gaps.ts')

  assert.match(cycle, /gap\.excludedAdapterIds\?\?\[\]/)
  assert.match(cycle, /return !allowed\.length\|\|allowed\.includes\(adapter\.kind\)/)
  assert.doesNotMatch(cycle, /gap\.id\.startsWith\(['"](?:auto-gap:)?university/)
  assert.doesNotMatch(gaps, /excludedAdapterIds:\s*\['reference'\]/)
})
