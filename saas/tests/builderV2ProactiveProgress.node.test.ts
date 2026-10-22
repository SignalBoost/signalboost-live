import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
test('V2 GET progress uses persisted receipt evidence instead of V1-only trace fields', () => {
 assert.match(source, /progress: builderProgressSnapshot\(job\)/)
 assert.match(source, /checkpoint\?\.version === 2/)
 assert.match(source, /steps\.filter\(step => step\.changed/)
 assert.match(source, /step\.tool === 'run_tests'/)
 assert.match(source, /modelCalls: v2/)
 assert.match(source, /requestedCommand/)
})
test('V2 progress does not return receipt contents, file paths or source code', () => {
 const body = source.slice(source.indexOf('export function builderProgressSnapshot'), source.indexOf('function runningReply'))
 assert.doesNotMatch(body, /return\s+steps\b|return\s+checkpoint\b|sourceContent|fileContent/)
})
