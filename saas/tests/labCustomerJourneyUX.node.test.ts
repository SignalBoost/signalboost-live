import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LAB_CUSTOMER_TRAINING_COPY } from '../lib/i18n/labCustomerTrainingCopy.ts'

const source = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url), 'utf8')

test('customer lab has meaningful workspace selection, only when multiple workspaces exist', () => {
  assert.match(source, /orgs\.length > 1/)
  assert.match(source, /item\.organizationName === item\.projectName/)
  assert.match(source, /copy\.workspaceSelectorLabel/)
})
test('teacher, compute and model choices are explicit, dependent and legible', () => {
  assert.match(source, /value=\{teacherProviderKind\}/)
  assert.match(source, /selectedTeacherCredentials\.map/)
  assert.match(source, /value=\{computeProviderKind\}/)
  assert.match(source, /selectedComputeCredentials\.map/)
  assert.match(source, /value=\{modelSelection\}/)
  assert.match(source, /setTeacherProviderKind\(event.target.value\); setBudgetAuthorized\(false\); setTeacherId\(''\)/)
  assert.match(source, /setComputeProviderKind\(event.target.value\); setBudgetAuthorized\(false\)/)
  assert.doesNotMatch(source, /useState\('Qwen\//)
})
test('paid work requires a distinct authorization and never preselects a provider or budget', () => {
  assert.match(source, /const \[keyKind, setKeyKind\] = useState\(''\)/)
  assert.match(source, /const \[budget, setBudget\] = useState\(''\)/)
  assert.match(source, /!budgetAuthorized/)
  assert.match(source, /setBudgetAuthorized\(false\)/)
})
test('all 11 language copies have guided selection and budget authorization', () => {
  assert.equal(Object.keys(LAB_CUSTOMER_TRAINING_COPY).length, 11)
  for (const entry of Object.values(LAB_CUSTOMER_TRAINING_COPY)) {
    for (const name of ['workspaceSelectorLabel','defaultWorkspaceName','teacherProviderLabel','chooseTeacherProvider','budgetConfirmation','trainingProviderLabel']) {
      assert.ok(entry[name as keyof typeof entry], name)
    }
  }
})
