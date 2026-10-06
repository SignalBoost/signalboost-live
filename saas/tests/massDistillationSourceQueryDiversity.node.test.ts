import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../lib/ai/cos/cosUniversityDistillationCurriculumPlan.ts', import.meta.url), 'utf8')

test('both rights-cleared discovery paths expose rotating lens before long theme', () => {
  const queries = source.match(/discoveryQuery: \x60\$\{subject\.title\} \$\{lens\} \$\{theme\}\x60/g) || []
  assert.equal(queries.length, 2)
  assert.doesNotMatch(source, /discoveryQuery: \x60\$\{subject\.title\} \$\{theme\} \$\{lens\}\x60/)
})
