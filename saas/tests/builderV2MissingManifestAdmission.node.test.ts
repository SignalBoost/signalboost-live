import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('Builder V2 blocks npm execution when workspace package.json is missing', () => {
  const source = readFileSync(new URL('../lib/builder/agent-v2.ts', import.meta.url), 'utf8')
  assert.match(source, /const missingNpmManifest = /)
  assert.match(source, /!knownFiles\.includes\('package\.json'\)/)
  assert.match(source, /hostVerificationDue = \(\) => !checklist\.commands\.some\(missingNpmManifest\)/)
  assert.match(source, /if \(missingNpmManifest\(command\)\) return null/)
  assert.match(source, /action\.tool === 'run_tests' && missingNpmManifest\(action\.command\)/)
  assert.match(source, /builder_v2_missing_project_manifest/)
})
