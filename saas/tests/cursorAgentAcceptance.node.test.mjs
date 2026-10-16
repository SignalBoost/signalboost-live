import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REQUIRED, COMMANDS, cursorEvents, runCursorAcceptance, nextCursorRepairPrompt } from '../scripts/cursor-agent-acceptance.mjs'

test('Cursor event decoder preserves real session and machine event types', () => {
  const out = cursorEvents([
    JSON.stringify({type:'system',subtype:'init',session_id:'test-session'}),
    JSON.stringify({type:'tool_call',subtype:'started'}),
    JSON.stringify({type:'result',subtype:'success',duration_ms:1200,session_id:'test-session'}),
  ].join('\n'))
  assert.equal(out.sessionId,'test-session')
  assert.deepEqual(out.events.map(x=>x.type),['system','tool_call','result'])
  assert.equal(out.events[2].durationMs,1200)
})

test('Cursor OrderFlow contract enforces all 15 files and required commands', () => {
  assert.equal(REQUIRED.length,15)
  assert.equal(new Set(REQUIRED).size,15)
  assert.deepEqual(COMMANDS,['npm test','node --test test/*.test.js','node index.js'])
})

test('Missing Cursor API key fails closed without launching agent', async () => {
  const root = await mkdtemp(join(tmpdir(),'cursor-acceptance-'))
  try {
    await assert.rejects(runCursorAcceptance({root,objective:'test',env:{PATH:process.env.PATH,HOME:process.env.HOME}}),/cursor_api_key_required/)
  } finally { await rm(root,{recursive:true,force:true}) }
})

test('repair prompt includes host failure evidence rather than model assertions', () => {
  const prompt=nextCursorRepairPrompt({missing:['test/orders.test.js'],passed:12,receipts:[
    {command:'npm test',exitCode:1,timedOut:false,stdout:'assertion failed',stderr:'orders mismatch'},
    {command:'node index.js',exitCode:0,timedOut:false,stdout:'ok',stderr:''}
  ]})
  assert.match(prompt,/test\/orders\.test\.js/)
  assert.match(prompt,/orders mismatch/)
  assert.match(prompt,/npm test/)
  assert.doesNotMatch(prompt,/FAILED node index\.js/)
})
