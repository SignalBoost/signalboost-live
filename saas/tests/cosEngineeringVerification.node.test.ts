import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('COS engineering missions cannot complete from aggregate commit status alone', async () => {
  const source = await readFile(new URL('../lib/ai/cos/engineeringMission.ts', import.meta.url), 'utf8')
  assert.match(source, /verifyEngineeringCommit/)
  assert.match(source, /typecheck_passed/)
  assert.match(source, /unit_tests_passed/)
  assert.match(source, /production_build_passed/)
  assert.match(source, /i18n_validation_passed/)
  assert.match(source, /deployment_check_passed/)
  assert.doesNotMatch(source, /combinedCommitStatus/)
})

test('failed verification feeds grounded evidence back into the same mission', async () => {
  const source = await readFile(new URL('../lib/ai/cos/engineeringMission.ts', import.meta.url), 'utf8')
  assert.match(source, /output: verified\.evidence/)
  assert.match(source, /verified\.state === 'failure'/)
  assert.match(source, /stage: 'DIAGNOSING'/)
  assert.match(source, /A commit or pull request is never proof that a fix works/)
})

test('verification inspects named GitHub check runs for the exact commit', async () => {
  const source = await readFile(new URL('../lib/ai/cos/engineeringVerification.ts', import.meta.url), 'utf8')
  assert.match(source, /check-runs\?per_page=100/)
  assert.match(source, /typecheck\|tsc --noemit/i)
  assert.match(source, /unit tests/)
  assert.match(source, /production build/)
  assert.match(source, /\^vercel\$/)
  assert.match(source, /Mission completion is forbidden/)
})
