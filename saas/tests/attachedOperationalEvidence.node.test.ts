import assert from 'node:assert/strict'
import test from 'node:test'
import { readAttachedOperationalEvidence } from '../lib/ai/cos/attachedOperationalEvidence.ts'

function textAttachment(name: string, text: string) {
  return { name, type: 'text/plain', dataUrl: `data:text/plain;base64,${Buffer.from(text).toString('base64')}` }
}

test('reads a bounded attached Vercel log as operational evidence', () => {
  const log = [
    '22:56:02.374 Running build in Cleveland, USA',
    'Cloning github.com/SignalBoost/signalboost-live (Branch: fix/example, Commit: abc1234)',
    'Error: Command "npm run build" exited with 1',
  ].join('\n')
  assert.equal(readAttachedOperationalEvidence([textAttachment('vercel.log.txt', log)]), log)
})

test('ordinary text attachments do not manufacture operational or repository authority', () => {
  assert.equal(readAttachedOperationalEvidence([textAttachment('notes.txt', 'Please fix my account.')]), '')
  assert.equal(readAttachedOperationalEvidence([{ name: 'log.txt', dataUrl: 'data:text/plain;base64,not valid base64!' }]), '')
})
