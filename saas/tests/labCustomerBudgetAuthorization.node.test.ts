// saas/tests/labCustomerBudgetAuthorization.node.test.ts
// Every run needs the customer's explicit confirmation that their own providers bill them for it. The platform does
// not price, budget or reserve provider spend, but it never starts provider work without that per-run confirmation.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const training = readFileSync(new URL('../app/api/lab/training/route.ts', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url), 'utf8')
test('the API refuses to create a run without the per-run provider billing confirmation', () => {
  const consent = training.indexOf("body.providerBillingConfirmed !== true")
  const create = training.indexOf("itmounts_lab_customer_create_training_run")
  assert.ok(consent > 0 && create > consent)
  assert.match(training, /return fail\('lab_provider_billing_not_confirmed', 403\)/)
})
test('the confirmation is sent to the API and withdrawn on any training data or source change', () => {
  assert.match(panel, /providerBillingConfirmed: billingConfirmed/)
  assert.match(panel, /setSource\('teacher'\); setBillingConfirmed\(false\)/)
  assert.match(panel, /setSource\('examples'\); setBillingConfirmed\(false\)/)
  assert.match(panel, /setSource\('open_sources'\); setBillingConfirmed\(false\)/)
  assert.match(panel, /setPrompts\(event.target.value\); setBillingConfirmed\(false\)/)
  assert.match(panel, /setExamples\(event.target.value\); setBillingConfirmed\(false\)/)
})
test('no provider price, budget or hourly cap remains in the LAB request or form', () => {
  for (const removed of ['approvedBudgetUsd', 'maxHourlyUsd', 'teacherBudgetUsd', 'approvedBudgetConfirmed']) {
    assert.equal(training.includes(removed), false, `route: ${removed}`)
    assert.equal(panel.includes(removed), false, `panel: ${removed}`)
  }
  for (const removed of ['copy.budget', 'copy.hourly', 'copy.teacherBudget', 'copy.pricedModels', 'copy.budgetLine']) {
    assert.equal(panel.includes(removed), false, `panel: ${removed}`)
  }
})
