import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Builder terminal outcomes enter verified Production evidence without manufacturing academic proof', async () => {
  const adapter = await readFile(new URL('../lib/builder/university-outcome.ts', import.meta.url), 'utf8')
  assert.match(adapter, /BUILDER_UNIVERSITY_AGENT_ID = 'software-specialist'/)
  assert.match(adapter, /BUILDER_UNIVERSITY_SUBJECT_ID = 'computer_science'/)
  assert.match(adapter, /recordVerifiedCosProductionOutcome\(\{/)
  assert.match(adapter, /sourceClass: 'production_outcome'/)
  assert.match(adapter, /universityEvidence: null/)
  assert.match(adapter, /authorityGranted: false/)
})

test('Builder distinguishes proven success, observed artifacts, and terminal failure', async () => {
  const runner = await readFile(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.match(runner, /merge_watch_outcome === 'healthy' \? 'success' : succeeded \? 'observed' : 'failure'/)
  assert.match(runner, /status: verifiedBuilderCognitiveApplication\(result\) \? 'success' : 'observed'/)
  assert.match(runner, /verification: 'generation_fenced_terminal_builder_failure'/)
  assert.match(runner, /terminal_builder_completion_without_learning_proof/)
})
