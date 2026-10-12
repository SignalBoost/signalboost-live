import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LAB_CUSTOMER_TRAINING_COPY } from '../lib/i18n/labCustomerTrainingCopy.ts'

const form = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url), 'utf8')
test('total spending cap has 10, 25 and 100 USD choices plus custom', () => {
  for (const amount of ['10','25','100']) assert.match(form, new RegExp('<option value="'+amount+'">\\$'+amount+'</option>'))
  assert.match(form, /<option value="custom">\{copy.customAmount\}<\/option>/)
  assert.match(form, /max="1000"/)
})
test('teacher and compute presets remain separately bounded and do not imply purchased credits', () => {
  assert.match(form, /value < Number\(budget\)/)
  assert.match(form, /value="0.25"/)
  assert.match(form, /value="0.5"/)
  assert.match(form, /value="1"/)
  assert.match(form, /Number\(hourly\) >= 0.05 && Number\(hourly\) <= 1/)
  assert.match(form, /setBudgetAuthorized\(false\)/)
  assert.match(form, /setTeacherBudget\(''\)/)
})
test('custom amount labels are translated in all eleven locales', () => {
  assert.equal(Object.keys(LAB_CUSTOMER_TRAINING_COPY).length,11)
  for (const copy of Object.values(LAB_CUSTOMER_TRAINING_COPY)) assert.ok(copy.customAmount)
})
