import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { labCustomerTrainingCopy } from '../lib/i18n/labCustomerTrainingCopy.ts'

const panel = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url), 'utf8')
const chrome = readFileSync(new URL('../components/layout/ShareRouteChrome.tsx', import.meta.url), 'utf8')
const start = readFileSync(new URL('../app/university/start/page.tsx', import.meta.url), 'utf8')
test('single workspace is not shown as a redundant dropdown', () => {
  assert.match(panel, /orgs\.length > 1/)
  assert.match(panel, /item\.organizationName === item\.projectName/)
  assert.match(panel, /copy\.defaultWorkspaceName/)
})
test('section two separates teacher provider/account and compute provider/account', () => {
  assert.match(panel, /aria-label=\{copy.teacherProviderLabel\}/)
  assert.match(panel, /selectedTeacherCredentials\.map/)
  assert.match(panel, /catalog\.filter\(item => item\.supports\['training.execute'\] && connectedKinds\.has\(item\.kind\)\)/)
  assert.match(panel, /trainingProviders\.map/)
  assert.match(panel, /teacherProviders\.map/)
  assert.match(panel, /selectedComputeCredentials\.map/)
  assert.match(panel, /modelSuggestions\.map/)
  assert.doesNotMatch(panel, /useState\('Qwen\//)
})
test('start requires explicit budget acknowledgement and entered spending limits', () => {
  assert.match(panel, /checked=\{budgetAuthorized\}/)
  assert.match(panel, /!budgetAuthorized/)
  assert.match(panel, /\[budget, setBudget\] = useState\(''\)/)
  assert.match(panel, /\[hourly, setHourly\] = useState\(''\)/)
})
test('LAB has no unrelated marketing nav or footer', () => {
  assert.match(chrome, /'\/university'/)
  assert.match(start, /AI University navigation/)
  assert.match(start, /Credits & pricing/)
})
test('all 11 translations include the workflow fields', () => {
  for (const l of ['en','es','pt','pl','ru','de','fr','it','ja','ko','ar']) {
    const c = labCustomerTrainingCopy(l)
    for (const key of ['teacherProviderLabel','chooseTeacherProvider','workspaceSelectorLabel','defaultWorkspaceName','budgetConfirmation']) {
      assert.ok(c[key as keyof typeof c])
    }
  }
})
