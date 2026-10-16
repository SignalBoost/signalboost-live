import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const ui = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerExperimentTable.tsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url), 'utf8')
test('LAB experiment comparison is interactive, workspace-scoped, and uses real exported metadata', () => {
 assert.match(panel, /<LabCustomerExperimentTable runs=\{runs\} language=\{language\}/)
 assert.match(ui, /buildLabExperimentComparison\(runs\.slice\(0,100\)\)/)
 assert.match(ui, /setProvider\(e\.target\.value\)/)
 assert.match(ui, /setStatus\(e\.target\.value\)/)
 assert.match(ui, /setDescending\(x=>!x\)/)
 assert.doesNotMatch(ui, /fetch\(|localStorage|sessionStorage|apiKey|secret/)
})
test('comparison contains all 11 supported localizations', () => {
 for (const locale of ['en','es','pt','pl','ru','de','fr','it','ja','ko','ar']) {
  assert.ok(ui.includes(' '+locale+':['), locale)
 }
})
