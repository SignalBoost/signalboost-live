import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const host=readFileSync('agent-gateway-host/signalboost-host.ts','utf8')
test('Supervisor host excludes generic customer provider and browser execution',()=>{
 assert.doesNotMatch(host,/runUniversalProvider|createUniversalChainExecutor|createBrowserChainExecutor/)
 assert.match(host,/createUniversityDistillationRecoveryExecutor/)
 assert.match(host,/createBuilderResidencyRuntimeRecoveryExecutor/)
 assert.match(host,/createObservationPolicyRecoveryExecutor/)
 assert.match(host,/createRetryDeploymentExecutor/)
 assert.match(host,/export const API_ACTIONS: readonly ExecutableAction\[\] = \[\]/)
})
