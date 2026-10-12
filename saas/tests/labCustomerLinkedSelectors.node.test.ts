import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LAB_CUSTOMER_TRAINING_COPY } from '../lib/i18n/labCustomerTrainingCopy.ts'

const ui = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url), 'utf8')

test('teacher provider, account and model selection are dependent dropdowns', () => {
  assert.match(ui, /value=\{teacherProviderKind\}/)
  assert.match(ui, /selectedTeacherCredentials\.map/)
  assert.match(ui, /value=\{teacherModelChoice\}/)
  assert.match(ui, /disabled=\{!teacherProviderKind \|\| !teacherId\}/)
  assert.match(ui, /teacherModelChoice === 'custom'/)
  assert.match(ui, /copy\.chooseTeacherAccount/)
})
test('training controls filter accounts and base model by compute provider', () => {
  assert.match(ui, /selectedComputeCredentials\.map/)
  assert.match(ui, /modelSuggestions\.map/)
  assert.match(ui, /copy\.connectTrainingFirst/)
  assert.match(ui, /copy\.connectTeacherFirst/)
})
test('translated separate account prompts exist for eleven languages', () => {
  assert.equal(Object.keys(LAB_CUSTOMER_TRAINING_COPY).length,11)
  for(const copy of Object.values(LAB_CUSTOMER_TRAINING_COPY)) {
    assert.ok(copy.chooseTeacherAccount)
    assert.ok(copy.connectTeacherFirst)
    assert.ok(copy.connectTrainingFirst)
    assert.notEqual(copy.chooseTeacherAccount,copy.chooseTrainingAccount)
  }
})
