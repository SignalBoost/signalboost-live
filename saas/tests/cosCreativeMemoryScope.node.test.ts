import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const route = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')

test('travel Creative Memory retrieval respects authenticated scope', () => {
  const start = route.indexOf('async function runTravelPlanAssumptionRescue')
  const end = route.indexOf('function buildTravelPlanEvidenceBackstop', start)
  const block = route.slice(start, end)
  assert.match(block, /privileged=false/)
  assert.match(block, /retrieveCreativeMemory\(input,\{privileged,limit:2\}\)/)
  assert.doesNotMatch(block, /retrieveCreativeMemory\(input,\{privileged:true/)
  assert.match(route, /runTravelPlanAssumptionRescue\(lookupInput,language,freshSources,travelDeclines,isPrivileged\)/)
})
