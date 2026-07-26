import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { createAndroidBuildPlan } from '../portable-mobile/android-build-plan.ts'
import { createUnsignedAndroidScaffold } from '../portable-mobile/android-scaffold.ts'
import { providerHubAndroidPackaging } from '../portable-mobile/provider-hub.android.ts'

test('creates a deterministic non-executing Provider Hub Android build plan', () => {
  const scaffold = createUnsignedAndroidScaffold(providerHubAndroidPackaging)
  const plan = createAndroidBuildPlan(scaffold)

  assert.equal(plan.portableId, 'provider-hub')
  assert.equal(plan.packageName, 'com.signalboost.providerhub')
  assert.equal(plan.state, 'build_plan_ready')
  assert.equal(plan.commandsExecuted, false)
  assert.equal(plan.filesystemMutated, false)
  assert.equal(plan.appBundleGenerated, false)
  assert.equal(plan.signingEnabled, false)
  assert.equal(plan.storeSubmissionEnabled, false)
  assert.deepEqual(plan.plannedTasks, [
    'materialize the reviewed scaffold files in an isolated workspace',
    'run Gradle configuration validation',
    'run Android lint and unit tests',
    'assemble an unsigned release bundle',
    'record hashes and build logs as evidence',
  ])
  assert.ok(Object.isFrozen(plan))
  assert.ok(Object.isFrozen(plan.plannedTasks))
})

test('fails closed for incomplete or unsafe scaffold state', () => {
  const scaffold = createUnsignedAndroidScaffold(providerHubAndroidPackaging)
  assert.throws(() => createAndroidBuildPlan({ ...scaffold, files: { ...scaffold.files, 'README.md': '' } }), /requires scaffold file/)
  assert.throws(() => createAndroidBuildPlan({ ...scaffold, signingEnabled: true }), /rejects generated, signed/)
  assert.throws(() => createAndroidBuildPlan({ ...scaffold, appBundleGenerated: true }), /rejects generated, signed/)
})

test('build-plan source has no execution or mutation capability', async () => {
  const source = await readFile(new URL('../portable-mobile/android-build-plan.ts', import.meta.url), 'utf8')
  for (const forbidden of ["from 'node:child_process'", "from 'node:fs'", 'exec(', 'spawn(', 'fetch(', 'writeFile(', 'signingConfigs', 'playConsole']) {
    assert.equal(source.includes(forbidden), false, `build plan must not contain ${forbidden}`)
  }
})
