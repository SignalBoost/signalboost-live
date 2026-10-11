// saas/tests/cosFreshMissNeverMemory.node.test.ts
//
// 2026-10-10: "which political party will be the majority in the US?" came back "as of 2023 … the 118th
// Congress" with no sources. The freshness policy flags it as current, but when live search returned
// zero sources the route handed it to ordinary COS (model memory) through a search-miss detour. A
// question marked current is never answered from memory: one plain-question retry, then fail closed.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'

const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
const at = (token: string) => { const index = route.indexOf(token); assert.ok(index >= 0, `route must contain ${token}`); return index }

test('questions about who will hold power are current-world questions', () => {
  for (const question of [
    'which political party will be the majority in the US?',
    'who is going to be the next Brazilian president?',
    'who will win the world cup?',
    'what is the latest iPhone?',
  ]) assert.equal(requiresFreshExternalEvidence(question), true, question)
})

test('a zero-source live search retries once with the plain question, before the authority gate', () => {
  const firstSearch = at("timeCosStage('primary:web_search'")
  const retry = at("timeCosStage('primary:web_search_retry',()=>getExternalInfo(plainQuery,8,{bypassCache:true}))")
  const gate = at('const authoritySatisfied=freshEvidenceMeetsQuestionAuthority(lookupInput, sources)')
  assert.ok(firstSearch < retry && retry < gate)
  assert.match(route, /if\(!freshSources\.length\)\{\n\s+const plainQuery=lookupInput\.replace\(\/\\s\+\/g,' '\)\.trim\(\)\.slice\(0,220\)/)
  assert.match(route, /event:'fresh_zero_source_retry'/)
})

test('a current-world question never reaches ordinary COS: the search-miss detour is gone and the gate fails closed', () => {
  assert.doesNotMatch(route, /freshMissUseLocal|mustFailClosedWithoutAuthoritativeLiveEvidence/)
  assert.match(route, /if\(!authoritySatisfied\)\{\n\s+const detail=freshError\|\|'Live search did not return authoritative evidence required for this current fact\.'/)
  assert.match(route, /if\(!requestedAction&&!requiresFreshEvidence\)\{\n\s+try\{recordCosLatencyStage\('primary:before_cos_first'/)
  assert.equal(route.split('!requestedAction&&!requiresFreshEvidence').length - 1, 4, 'every ordinary-COS entry (first answer, best-effort, semantic rescue, completion rescue) is closed to fresh questions')
  assert.match(route, /const freshHardFail=requiresFreshEvidence\n/)
})
