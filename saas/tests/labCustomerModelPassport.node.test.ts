import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const passport = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerModelPassport.tsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url), 'utf8')
test('customer passport displays only authorized run-list fields without a new remote lookup', () => {
  assert.match(panel, /<LabCustomerModelPassport run=\{run\} language=\{language\}/)
  assert.match(passport, /artifactHash/)
  assert.match(passport, /artifactRevision/)
  assert.match(passport, /tunedModelId/)
  assert.doesNotMatch(passport, /fetch\(|useEffect|createClient|rpc\(/)
})
test('passport never mislabels completed training as independently evaluated', () => {
  assert.match(passport, /No independently verified baseline comparison available/)
  assert.doesNotMatch(passport, /certified|graduated|passed.*evaluation/i)
  for (const locale of ['en','es','pt','pl','ru','de','fr','it','ja','ko','ar'])
    assert.match(passport, new RegExp('^  '+locale+':', 'm'))
})
