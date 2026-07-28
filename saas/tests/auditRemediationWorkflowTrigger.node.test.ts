import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const workflow = hydrateLocalizedSource(readFileSync(
  new URL('../../.github/workflows/audit-remediation-regression.yml', import.meta.url),
  'utf8',
))

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
  assert.match(workflow, /Verify autonomous remediation boundary[\s\S]*npm run test:audit-remediation/)
  assert.match(workflow, /Verify truthful global approval lifecycle[\s\S]*npm run test:audit-global-approval/)
  assert.match(workflow, /Verify end-to-end remediation recovery[\s\S]*node --test tests\/auditRemediationSystem\.node\.test\.ts/)
  assert.match(workflow, /Verify required workflow trigger[\s\S]*node --test tests\/auditRemediationWorkflowTrigger\.node\.test\.ts/)
  assert.doesNotMatch(workflow, /test:audit-consent|Verify audit consent boundaries/)
})
