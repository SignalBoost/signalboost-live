import assert from 'node:assert/strict'
import test from 'node:test'
import { builderAcceptanceReport } from '../lib/builder/acceptance-report.ts'
import type { BuilderV2Receipt } from '../lib/builder/agent-v2-dispatcher.ts'
import type { BuilderAcceptanceLedger } from '../lib/builder/acceptance-ledger.ts'
import type { BuilderFinalProof } from '../lib/builder/final-proof.ts'

const receipts: BuilderV2Receipt[] = [
 { tool: 'write_file', changed: true, ok: true, output: { path: 'src/calculator.js' } },
 { tool: 'run_tests', changed: false, ok: false, output: { exitCode: 1, stdout: 'ℹ pass 5\nℹ fail 8\n' } },
 { tool: 'edit_file', changed: true, ok: true, output: { path: 'src/calculator.js' } },
 { tool: 'run_tests', changed: false, ok: true, output: { exitCode: 0, requestedCommand: 'npm test', stdout: 'ℹ pass 14\nℹ fail 0\n' } },
 { tool: 'run_tests', changed: false, ok: true, output: { exitCode: 0, requestedCommand: 'node --test test/*.test.js', stdout: 'ℹ pass 14\nℹ fail 0\n' } },
]
const ledger: BuilderAcceptanceLedger = { applicable: true, passed: true, failureCode: null,
  latestSourceChangeIndex: 2, initialFailureReproduced: true, commands: [
    { command: 'npm test', passed: true, receiptIndex: 3, exitCode: 0 },
    { command: 'node --test test/*.test.js', passed: true, receiptIndex: 4, exitCode: 0 },
  ],
}
const proof: BuilderFinalProof = { passed: true, failureCode: null,
  criteria: { workspace: true, hostTests: true, publication: true, endpoint: true, budget: true, deadline: true, newPrivateRepository: true },
}
const input = {
 jobId: 'job-001',
 files: ['package.json', 'index.js', 'src/calculator.js', 'test/calculator.test.js'],
 receipts, ledger, proof,
 publication: { repository: 'SignalBoost/calculator-test', pullRequestUrl: 'https://github.com/SignalBoost/calculator-test/pull/1',
   previewUrl: 'https://calculator.vercel.app', endpointUrl: 'https://calculator.vercel.app/sum?a=2&b=3',
   status: 'verified', httpStatus: 200, responseBody: { total: 5 } },
 inferenceBudget: { accountedInferenceUsd: 0.011869, pendingReservationUsd: 0 },
 totalElapsedMs: 60506, failure: null,
}
test('acceptance report contains all eleven required fields with real recorded values', () => {
 const lines = builderAcceptanceReport(input).split('\n')
 assert.equal(lines.length, 11)
 assert.match(lines[2], /reproduced/)
 assert.match(lines[3], /14 passed, 0 failed.*npm test: PASS.*node --test/)
 assert.match(lines[7], /HTTP 200; \{"total":5\}/)
 assert.match(lines[8], /\$0.011869/)
 assert.match(lines[9], /60.5 seconds/)
 assert.equal(lines[10], 'Final result: PASS')
})
test('missing GitHub and endpoint proof are never fabricated', () => {
 const text = builderAcceptanceReport({ ...input, proof: { ...proof, passed: false, criteria: { ...proof.criteria, endpoint: false } },
   publication: null, failure: 'builder_final_endpoint_unverified' })
 assert.match(text, /Pull request URL: Not created/)
 assert.match(text, /Actual endpoint response: Not verified/)
 assert.match(text, /Final result: FAIL/)
})
