import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync(
  new URL('../../.github/workflows/audit-remediation-regression.yml', import.meta.url),
  'utf8',
)

test('audit remediation checks run for generated source-fix pull requests', () => {
  assert.match(workflow, /pull_request:\s*\n\s+branches: \[main, master\]/)
  assert.doesNotMatch(workflow, /^\s+paths:\s*$/m)
  assert.doesNotMatch(workflow, /audit-remediation:\s*\n\s+if:/)
})

test('the workflow executes its trigger regression guard', () => {
  assert.match(
    workflow,
    /Run focused audit tests[\s\S]*node --test tests\/auditRemediationWorkflowTrigger\.node\.test\.ts/,
  )
})
