import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read=(file:string)=>readFileSync(new URL(file,import.meta.url),'utf8')
test('customer LAB no longer forces one-dollar provider hourly limit',()=>{
  const api=read('../app/api/lab/training/route.ts')
  const ui=read('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx')
  const sql=read('../supabase/migrations/20261012040000_lab_customer_hourly_cap.sql')
  assert.match(api,/maxHourlyUsd <= 1000/)
  assert.doesNotMatch(api,/maxHourlyUsd <= 1\)/)
  assert.match(ui,/type="number" min="0.01" max="1000" step="0.01" value=\{hourly\}/)
  assert.match(sql,/customer_training_runs_max_hourly_usd_check/)
  assert.match(sql,/max_hourly_usd > 0 and max_hourly_usd <= 1000/)
})
test('customer cap is used only in LAB and compared with live provider rate and total budget',()=>{
  const lab=read('../lib/ai/cos/labCustomerTraining.ts')
  const jobs=read('../lib/ai/cos/cosUniversityHuggingFaceJobs.ts')
  assert.match(lab,/COS_UNIVERSITY_HF_MAX_HOURLY_COST_USD: String\(input\.maxHourlyUsd\)/)
  assert.match(lab,/resolveHourlyUsd\(spec\.flavor, input\.customerHfToken\)/)
  assert.match(lab,/if \(!\(hourlyUsd <= hourlyCap\)\)/)
  assert.match(lab,/if \(!\(maxCostUsd <= input\.remainingBudgetUsd\)\)/)
  assert.match(jobs,/positiveFloat\(env\.COS_UNIVERSITY_HF_MAX_HOURLY_COST_USD, 1, 0\.01, 1000\)/)
})
