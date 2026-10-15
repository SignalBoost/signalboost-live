import assert from 'node:assert/strict'
import test from 'node:test'
import { observeLabRequest } from '../lib/lab/observability.ts'

async function withCapturedLog<T>(fn: () => Promise<T>) {
 const original = console.log
 const logs: string[] = []
 console.log = (value: unknown) => { logs.push(String(value)) }
 try { return { result: await fn(), logs: logs.map(s => JSON.parse(s) as Record<string,unknown>) } }
 finally { console.log = original }
}

test('a known safe error code is correlated without logging response content', async () => {
 const {result,logs} = await withCapturedLog(() => observeLabRequest('training.action', async () =>
  Response.json({error:'lab_provider_billing_not_confirmed',privatePrompt:'secret prompt'}, {status:403})))
 assert.match(result.headers.get('x-lab-observation-id') ?? '', /^[a-f0-9-]{36}$/)
 assert.equal(logs[0].observationId, result.headers.get('x-lab-observation-id'))
 assert.equal(logs[0].failureCode, 'lab_provider_billing_not_confirmed')
 assert.equal(logs[0].status,403)
 assert.doesNotMatch(JSON.stringify(logs), /secret prompt/)
})
test('arbitrary response error messages are not logged', async () => {
 const {logs} = await withCapturedLog(() => observeLabRequest('training.list', async () =>
  Response.json({error:'Customer token abcd123'}, {status:500})))
 assert.equal(logs[0].failureCode, null)
 assert.doesNotMatch(JSON.stringify(logs), /abcd123/)
})
test('exceptions are recorded without their private messages', async () => {
 const logs: string[] = []
 const original = console.log
 console.log = (value: unknown) => { logs.push(String(value)) }
 try {
  await assert.rejects(observeLabRequest('training.action',async () => {throw new Error('sensitive private error')}),/sensitive private error/)
 } finally {console.log = original}
 assert.equal(JSON.parse(logs[0]).outcome,'exception')
 assert.doesNotMatch(logs.join(' '),/sensitive private error/)
})
