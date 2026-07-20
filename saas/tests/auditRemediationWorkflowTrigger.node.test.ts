import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync(
  new URL('../../.github/workflows/audit-remediation-regression.yml', import.meta.url),
  'utf8',
)

test('audit remediation ruleset supports pull requests and merge queues', () => {
  assert.match(workflow, /^\s{2}pull_request:\s*$/m)
  assert.match(workflow, /^\s{2}merge_group:\s*$/m)
  assert.doesNotMatch(workflow, /^\s+paths:\s*$/m)
  assert.doesNotMatch(workflow, /^\s+branches:\s*/m)
})

test('the required ruleset job is explicitly enabled', () => {
  assert.match(workflow, /audit-remediation:\s*\n(?:\s*#.*\n)*\s+if: true/)
  assert.match(
    workflow,
    /Run focused audit tests[\s\S]*node --test tests\/auditRemediationWorkflowTrigger\.node\.test\.ts/,
  )
})
