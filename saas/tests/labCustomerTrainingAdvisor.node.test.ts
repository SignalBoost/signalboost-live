import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingAdvisor.tsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url), 'utf8')
test('advisor only enumerates current executable LAB connectors, without initiating paid jobs', () => {
 assert.match(source, /huggingface/)
 assert.match(source, /together/)
 assert.match(source, /fireworks/)
 assert.match(source, /p\.supports\['training\.execute'\]/)
 assert.doesNotMatch(source, /fetch\(|api\/lab\/training|startRun\(|providerBillingConfirmed/)
 assert.match(panel, /<LabCustomerTrainingAdvisor language=\{language\} catalog=\{catalog\}/)
})
test('recipe descriptions match fixed executor configuration and never claim tunable controls', () => {
 assert.match(source, /1 epoch; provider-managed LoRA configuration/)
 assert.match(source, /1 epoch; LoRA rank 16/)
 assert.match(source, /parameters fixed by the deployed worker/)
 assert.doesNotMatch(source, /onClick=\{.*startRun|n_epochs:|lora_rank:/)
})
test('guidance is available for all supported LAB locales', () => {
 for(const locale of ['en','es','pt','pl','ru','de','fr','it','ja','ko','ar'])
   assert.match(source,new RegExp('^ '+locale+':','m'))
})
