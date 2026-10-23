// saas/tests/builderV2ProgressReport.node.test.ts
// Every Builder V2 update shows what the build did, from host receipts, so a long run is never a black box.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { builderV2ProgressReport } from '../lib/builder/agent-v2.ts'
import type { BuilderV2Receipt } from '../lib/builder/agent-v2-dispatcher.ts'

const objective = [
  'Build OrderFlow.', 'Create all 4 files:', '```text', 'orderflow/', '├── package.json', '├── index.js', '├── src/', '│   └── cart.js', '└── test/', '    └── cart.test.js', '```',
  'Implement at least **20 meaningful automated tests**.', '## Mandatory verification', 'Execute all three commands:', '```bash', 'npm test', 'node --test test/*.test.js', 'node index.js', '```',
].join('\n')
const write = (path: string): BuilderV2Receipt => ({ tool: 'write_file', ok: true, changed: true, output: { path } })
const run = (command: string, exitCode: number, stderr = ''): BuilderV2Receipt => ({ tool: 'run_tests', ok: exitCode === 0, changed: false,
  output: { exitCode, stdout: exitCode ? '# pass 17\n# fail 3' : '# pass 20\n# fail 0', stderr, timedOut: false, requestedCommand: command, executedCommand: command } })

test('a mid-build report names files, each command result, tests, last steps and the failure output', () => {
  const steps = [write('package.json'), write('src/cart.js'), write('test/cart.test.js'), write('index.js'),
    run('npm test', 1, 'AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\n\n3 !== 2\n    at test/cart.test.js:14:10')]
  const report = builderV2ProgressReport(objective, ['package.json', 'src/cart.js', 'test/cart.test.js', 'index.js'], steps, { current: 3, max: 24 })
  assert.match(report, /^Progress \(work slice 3 of 24\):/)
  assert.match(report, /Required files: 4 of 4 written\n/)
  assert.match(report, /`npm test` failed \(exit 1\) · `node --test test\/\*\.test\.js` not run yet · `node index\.js` not run yet/)
  assert.match(report, /Tests passing: 0 of 20 required/)
  assert.match(report, /Last steps: wrote package\.json · wrote src\/cart\.js · wrote test\/cart\.test\.js · wrote index\.js · ran `npm test` \(exit 1\)/)
  assert.match(report, /Latest failure output:\n```text\n[\s\S]*3 !== 2[\s\S]*test\/cart\.test\.js:14:10\n# pass 17\n# fail 3\n```$/)
})

test('an early report lists missing files; a later change marks older results as stale and drops old failures', () => {
  assert.match(builderV2ProgressReport(objective, ['package.json'], [write('package.json')]),
    /Required files: 1 of 4 written\. Missing: index\.js, src\/cart\.js, test\/cart\.test\.js/)
  const steps = [write('package.json'), write('src/cart.js'), write('test/cart.test.js'), write('index.js'),
    run('npm test', 1, 'boom'), { tool: 'edit_file', ok: true, changed: true, output: { path: 'src/cart.js' } } as BuilderV2Receipt]
  const report = builderV2ProgressReport(objective, ['package.json', 'src/cart.js', 'test/cart.test.js', 'index.js'], steps)
  assert.match(report, /`npm test` failed \(exit 1\) before the latest change/)
  assert.doesNotMatch(report, /Latest failure output/)
})

test('the paused and final V2 replies both carry the report', () => {
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.match(runner, /const progress = builderV2ProgressReport\(job\.objective, files, cycle\.result\?\.steps \?\? \[\],\s+\{ current: job\.claimGeneration, max: MAX_WORK_SLICES \}\)/)
  assert.match(runner, /assistanceCopy\(BUILDER_RESULT_CONTINUING, job\.metadata\.responseLanguage\)\}\\n\\n\$\{progress\}\$\{budgetReport\}`/)
  assert.match(runner, /assistanceCopy\(BUILDER_RESULT_NOT_FINISHED, job\.metadata\.responseLanguage\)\}\\n\\n\$\{progress\}\$\{publicationReport\}\$\{budgetReport\}`/)
  // The exact failure code is diagnosis data: it stays in the job's error column, not the person's message.
  assert.match(runner, /status: success \? 'succeeded' : 'failed', reply, error: success \? null : \(publicationError \|\| acceptance\.failureCode \|\| finalProof\.failureCode \|\| reason\)/)
})
