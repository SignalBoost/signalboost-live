import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LAB_CUSTOMER_TRAINING_COPY } from '../lib/i18n/labCustomerTrainingCopy.ts'
const panel=readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx',import.meta.url),'utf8')
test('customer budget has $10, $25, $100 and custom without initial preselection',()=>{
  for(const n of ['10','25','100'])assert.ok(panel.includes(`<option value="${n}">$${n}</option>`))
  assert.match(panel, /<option value="custom">\{copy.customAmount\}<\/option>/)
  assert.match(panel, /const \[budget, setBudget\] = useState\(''\)/)
  assert.match(panel, /setBudgetAuthorized\(false\); setBudget\(event\.target\.value === 'custom'/)
  assert.match(panel, /setTeacherBudget\(''\)/)
})
test('GPU hourly cap remains customer entered and is not assigned provider rates',()=>{
  assert.match(panel, /type="number" min="0\.01" max="1000" step="0\.01" value=\{hourly\}/)
  assert.doesNotMatch(panel, /<option value="0\.25">\$0\.25/)
})
test('custom budget label exists in eleven languages',()=>{
  assert.equal(Object.keys(LAB_CUSTOMER_TRAINING_COPY).length,11)
  for(const c of Object.values(LAB_CUSTOMER_TRAINING_COPY))assert.ok(c.customAmount)
})
