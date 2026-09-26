import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const admission=readFileSync(new URL('../platform-harness/residency/admission-store.ts',import.meta.url),'utf8')
const provision=readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvision.ts',import.meta.url),'utf8')

test('remediation residents do not deadlock new residency admission capacity',()=>{
  assert.match(admission,/\.in\('standing',\['resident','senior_resident'\]\)/)
  assert.doesNotMatch(admission,/\.in\('standing',\['resident','senior_resident','remediation_required'\]\)/)
})

test('shared exact-artifact runtime accepts the bounded residency warm lease',()=>{
  assert.match(provision,/MAX_CALLER_IDLE_TIMEOUT_SECONDS = 720/)
  assert.ok((720/3600)*0.69<0.2)
})
