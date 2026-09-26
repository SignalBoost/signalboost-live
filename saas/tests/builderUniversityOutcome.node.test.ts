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
  const lifecycle = await readFile(new URL('../lib/builder/repository-repair-job-lifecycle.ts', import.meta.url), 'utf8')
  assert.match(runner, /merge_watch_outcome === 'healthy' \? 'success' : repositoryCompleted \? 'observed' : 'failure'/)
  assert.match(runner, /repository_write_stage === 'pr_created'/)
  assert.match(runner, /status: verifiedBuilderCognitiveApplication\(result\) \? 'success' : 'observed'/)
  assert.match(runner, /verification: 'generation_fenced_terminal_builder_failure'/)
  assert.match(runner, /terminal_builder_completion_without_learning_proof/)
  assert.match(lifecycle, /generation_fenced_repository_merge_and_production_healthy/)
  assert.match(lifecycle, /generation_fenced_repository_merge_rolled_back/)
  assert.match(lifecycle, /generation_fenced_repository_merge_without_healthy_production_proof/)
  assert.match(lifecycle, /verification: 'generation_fenced_repository_base_superseded'/)
  assert.match(lifecycle, /finishedAt: updatedAt/)
})

test('repository success is fail-closed until exact main Production health is proven', async () => {
  const lifecycle = await readFile(new URL('../lib/builder/repository-repair-job-lifecycle.ts', import.meta.url), 'utf8')
  const migration = await readFile(new URL('../supabase/migrations/20260926010500_builder_repository_production_completion_gate.sql', import.meta.url), 'utf8')
  const specialist = await readFile(new URL('../lib/ai/cos/softwareSpecialist.ts', import.meta.url), 'utf8')
  assert.match(lifecycle, /input\.baseBranch === 'main' && input\.mergeWatchOutcome !== 'healthy'/)
  assert.match(lifecycle, /createSupabaseMergeWatchStore/)
  assert.match(migration, /production_proof_pending/)
  assert.match(migration, /merge_watch_outcome'.*healthy/s)
  assert.match(specialist, /ownerPlatformEngineeringSubmission: input\.signalBoostDeploymentContext === true/)
})
