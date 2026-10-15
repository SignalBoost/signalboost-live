import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const panel = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url), 'utf8')
const cmp = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerResponseComparison.tsx', import.meta.url), 'utf8')
test('comparison only appears for completed recorded model runs', () => {
 assert.match(panel, /run\.stage === 'completed' && \(run\.tunedModelId \|\| run\.artifactRevision\)/)
 assert.match(panel, /LabCustomerResponseComparison/)
})
test('comparison uses same prompt, no automated inference or persisted unverified score', () => {
 assert.match(cmp, /Manual comparison/)
 assert.match(cmp, /Independent|independent/)
 assert.doesNotMatch(cmp, /fetch\(|localStorage|sessionStorage|useEffect\(|score:|api\/lab/)
 assert.match(cmp, /disabled=\{!valid\}/)
 for (const locale of ['en','es','pt','pl','ru','de','fr','it','ja','ko','ar'])
  assert.match(cmp, new RegExp('^ '+locale+':', 'm'))
})
