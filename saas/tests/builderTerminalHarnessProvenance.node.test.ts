import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/builder/repository-repair-job-lifecycle.ts', import.meta.url), 'utf8')

test('every terminal repository repair outcome forwards persisted Harness metadata', () => {
  const calls = [...source.matchAll(/recordBuilderUniversityProductionOutcome\(\{/g)]
  assert.equal(calls.length, 3, 'all three terminal repair outcome paths must be covered')
  for (const match of calls) {
    const call = source.slice(match.index, source.indexOf('}).catch(', match.index))
    assert.match(call, /job:\s*\{[^}]*metadata:\s*record\(row\.metadata\)/,
      'the terminal outcome must carry persisted job metadata, not lose the Harness correlation')
  }
})
