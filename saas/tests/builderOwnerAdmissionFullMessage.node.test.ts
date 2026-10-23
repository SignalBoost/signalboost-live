import test from 'node:test'
import assert from 'node:assert/strict'
import { isOwnerRepairWithoutSource } from '../lib/builder/repository-repair-target.ts'

const message = 'This request does not contain an executable coding or design objective with concrete source evidence. No Builder job was created and no code was run.'
const request = (objective: string, isOwner = true) => ({ objective, isOwner, hasAttachedSource: false, hasRepositoryImport: false, workspaceHasFiles: false, hasProjectContext: false })

test('owner pasted full Builder rejection is actionable platform failure evidence', () => {
  assert.equal(isOwnerRepairWithoutSource(request(message)), true)
  assert.equal(isOwnerRepairWithoutSource(request(message.slice(0, -1))), true)
})

test('admission failure routing cannot bypass owner or project boundaries', () => {
  assert.equal(isOwnerRepairWithoutSource(request(message, false)), false)
  assert.equal(isOwnerRepairWithoutSource({ ...request(message), workspaceHasFiles: true }), false)
  assert.equal(isOwnerRepairWithoutSource(request('What is the weather?')), false)
  assert.equal(isOwnerRepairWithoutSource(request('Please draft an email.')), false)
})
