import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(process.cwd())

test('Universal Provider Framework exports canonical supervised executor', () => {
  const index = fs.readFileSync(path.join(ROOT, 'lib/provider-framework/index.ts'), 'utf8')
  assert.match(index, /export \* from '\.\/supervised-executor\.ts'/)
})

test('supervised executor cannot execute before Supervisor preflight', () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib/provider-framework/supervised-executor.ts'), 'utf8')
  const preflight = source.indexOf('await assertProviderExecutionAllowed')
  const execute = source.indexOf('await input.execute()')
  assert.ok(preflight >= 0 && execute > preflight)
})

test('returned and thrown provider failures feed the same Supervisor classifier', () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib/provider-framework/supervised-executor.ts'), 'utf8')
  assert.ok((source.match(/recordProviderExecutionFailure/g) || []).length >= 3)
  assert.match(source, /isFailure/)
  assert.match(source, /thrown: true/)
})

test('canonical executor is provider-neutral', () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib/provider-framework/supervised-executor.ts'), 'utf8')
  assert.doesNotMatch(source, /huggingface|anthropic|openai|grok|runpod|deepinfra|stripe|vercel|supabase|github|cloudflare|aws|azure/i)
})
