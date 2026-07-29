import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'

test('Supervisor integration guide uses the packaged licensed factory and required boundaries', async () => {
  const guide = await readFile(new URL('../../docs/portables/self-healing-integration-guide.md', import.meta.url), 'utf8').then(hydrateLocalizedSource)
  const factory = await readFile(new URL('../lib/supervisor/portable/licensed-supervisor.ts', import.meta.url), 'utf8').then(hydrateLocalizedSource)

  assert.match(factory, /createLicensedSelfHealingSupervisor/)
  assert.match(factory, /dispatchStore:\s*DispatchStore/)
  assert.match(factory, /apiCapabilities:\s*ApiCapabilityRegistry/)
  assert.match(factory, /approvalVerifier:\s*ApprovalContinuationVerifier/)
  assert.match(guide, /createLicensedSelfHealingSupervisor\(\{/)
  assert.match(guide, /dispatchStore,/)
  assert.match(guide, /apiCapabilities,/)
  assert.match(guide, /approvalVerifier,/)
  assert.doesNotMatch(guide, /createSupervisorDispatcher\(\{/)
})
