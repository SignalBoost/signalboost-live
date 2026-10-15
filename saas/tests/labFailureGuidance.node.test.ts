import assert from 'node:assert/strict'
import test from 'node:test'
import { labFailureGuidance } from '../lib/lab/labFailureGuidance.ts'
test('ambiguous job submission cannot lead to automatic paid retry',()=>{const x=labFailureGuidance('lab_job_submission_unknown');assert.equal(x.category,'uncertain');assert.equal(x.retrySafe,false);assert.match(x.nextStep,/existing provider job/)})
test('sensitive inputs are never interpolated into guidance',()=>{const x=labFailureGuidance('secret-custom-key-12345');assert.equal(x.category,'other');assert.doesNotMatch(x.nextStep,/12345/)})
test('data and provider errors remain recoverable instructions, not actions',()=>{for(const code of ['lab_dataset_invalid','lab_provider_not_ready','lab_credential_unavailable'])assert.equal(labFailureGuidance(code).retrySafe,false)})
