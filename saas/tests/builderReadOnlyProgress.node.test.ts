import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const source = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
const get = source.slice(source.indexOf('export async function GET'), source.indexOf('export async function POST'))
test('owner-scoped observeOnly cannot resume a paused Builder run', () => {
 assert.match(get, /getBuilderJobForUser\(jobId, access\.userId\)/)
 assert.match(get, /const observeOnly = url\.searchParams\.get\('observeOnly'\) === 'true'/)
 assert.match(get, /if \(!observeOnly && builderPollMayResume\(job\)/)
 assert.match(get, /readOnly: true/)
})
test('completed-job progress is reconstructed from saved receipts and not new model calls', () => {
 const branch = get.slice(get.indexOf('if (observeOnly) {', get.indexOf('const observeOnly')), get.indexOf('// Read-only historical acceptance presentation.'))
 assert.match(branch, /job\.result\?\.receipts/)
 assert.match(branch, /builderProgressSnapshot/)
 assert.doesNotMatch(branch, /runBuilderJob\(|enqueueBuilderJob\(/)
})
