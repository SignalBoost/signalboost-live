import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync(
  new URL('../../.github/workflows/audit-remediation-regression.yml', import.meta.url),
  'utf8',
)

test('audit remediation required workflow supports its actual push event', () => {
  assert.match(workflow, /^\s{2}push:\s*$/m)
  assert.match(workflow, /^\s{2}pull_request:\s*$/m)
  assert.match(workflow, /^\s{2}merge_group:\s*$/m)
  assert.doesNotMatch(workflow, /^\s+paths:\s*$/m)
  assert.doesNotMatch(workflow, /^\s+branches:\s*/m)
})

test('the required job uses only contexts available before runner allocation', () => {
  assert.doesNotMatch(workflow, /audit-remediation:\s*\n\s+if:/)
  assert.doesNotMatch(workflow, /\$\{\{\s*runner\./)
  assert.match(workflow, /npm_config_cache: \/tmp\/signalboost-audit-npm-cache/)
  assert.match(
    workflow,
    /Run focused audit tests[\s\S]*node --test tests\/auditRemediationWorkflowTrigger\.node\.test\.ts/,
  )
})
