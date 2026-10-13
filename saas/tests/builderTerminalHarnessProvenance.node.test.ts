import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/builder/repository-repair-job-lifecycle.ts', import.meta.url), 'utf8')
const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')

test('Builder completion paths do not depend on University outcome recording', () => {
  for (const [name, code] of [['job runner', runner], ['repository repair lifecycle', source]]) {
    assert.doesNotMatch(code, /recordBuilderUniversityProductionOutcome|university-outcome\.ts|builder_university_outcome_record_failed/, name)
    assert.match(code, /finishBuilderJob|persistHistory/, name)
    assert.match(code, /recordBuilderEpisode|recordRepositoryRepairEpisode/, name)
  }
})
