import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')

test('cos-primary resolves explicit direct-flight evidence before any local model synthesis', () => {
  const authorityGate = source.indexOf('if(!authoritySatisfied)')
  const deterministicResolver = source.indexOf('resolveDeterministicDirectFlight(lookupInput,freshSources)')
  const localSynthesis = source.indexOf('const localSynthesis=await synthesizeFreshEvidenceLocally')

  assert.ok(authorityGate >= 0, 'fresh authority gate must exist')
  assert.ok(deterministicResolver > authorityGate, 'deterministic resolver must run only after live authority succeeds')
  assert.ok(localSynthesis > deterministicResolver, 'deterministic direct-flight resolution must run before Qwen synthesis')
  assert.match(source, /fresh_deterministic_resolution_accepted/)
  assert.match(source, /source:'cos-fresh-deterministic-grounded'/)
  assert.match(source, /local_model_invoked:false/)
})
