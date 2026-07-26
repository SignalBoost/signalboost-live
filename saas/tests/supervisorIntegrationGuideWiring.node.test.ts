import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Supervisor integration guide uses the canonical dispatcher option names', async () => {
  const guide = await readFile(new URL('../../docs/portables/self-healing-integration-guide.md', import.meta.url), 'utf8')
  const dispatcher = await readFile(new URL('../lib/supervisor/executors/create-supervisor-dispatcher.ts', import.meta.url), 'utf8')

  assert.match(dispatcher, /audit:\s*DispatchAuditSink/)
  assert.match(dispatcher, /dispatchStore\?:\s*DispatchStore/)
  assert.match(guide, /createSupervisorDispatcher\(\{ host, dispatchStore, audit \}\)/)
  assert.doesNotMatch(guide, /createSupervisorDispatcher\(\{ host, store, auditSink \}\)/)
})
