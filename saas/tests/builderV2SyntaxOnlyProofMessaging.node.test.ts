import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('Builder V2 terminal history distinguishes syntax checks from behavioral verification', () => {
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.match(runner, /const syntaxOnly = commandsProven\.length > 0/)
  assert.match(runner, /commandsProven\.every\(command => \/\^node/)
  assert.match(runner, /JavaScript syntax check only; runtime behavior and defect repair were not verified/)
  assert.match(runner, /syntaxOnly \? '' : \(cycle\.result\?\.summary \|\| ''\)/)
})
