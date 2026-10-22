import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const source = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
const body = source.slice(source.indexOf('export function builderProgressSnapshot'), source.indexOf('function runningReply'))
test('finished successful and failed jobs have terminal phase, not model or stale verification', () => {
 assert.match(body, /phase: job\.status === 'succeeded' \? 'completed' : job\.status === 'failed' \? 'failed'/)
 assert.ok(body.indexOf("job.status === 'succeeded'") < body.indexOf("job.checkpoint?.verificationPending === true"))
})
