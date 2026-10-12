import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const training = readFileSync(new URL('../app/api/lab/training/route.ts', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url), 'utf8')
test('the API blocks paid training before any run is created without explicit per-run authorization', () => {
  const consent = training.indexOf("body.approvedBudgetConfirmed !== true")
  const create = training.indexOf("itmounts_lab_customer_create_training_run")
  assert.ok(consent > 0 && create > consent)
  assert.match(training, /return fail\('lab_training_budget_not_authorized', 403\)/)
})
test('customer confirmation is passed to API and revoked on any training data or source change', () => {
  assert.match(panel, /approvedBudgetConfirmed: budgetAuthorized/)
  assert.match(panel, /setSource\('teacher'\); setBudgetAuthorized\(false\)/)
  assert.match(panel, /setSource\('examples'\); setBudgetAuthorized\(false\)/)
  assert.match(panel, /setPrompts\(event.target.value\); setBudgetAuthorized\(false\)/)
  assert.match(panel, /setExamples\(event.target.value\); setBudgetAuthorized\(false\)/)
})
