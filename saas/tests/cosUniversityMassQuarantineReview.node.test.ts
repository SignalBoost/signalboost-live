// saas/tests/cosUniversityMassQuarantineReview.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

test('quarantine review is narrowly bound to exhausted mass-evaluation disposition',()=>{
  const source=read('lib/ai/cos/cosUniversityMassQuarantineReview.ts')
  assert.match(source,/evidence->>profile',PROFILE/)
  assert.match(source,/evidence->>claim',EXHAUSTED/)
  assert.match(source,/\.eq\('status','quarantined'\)/)
  assert.match(source,/\.update\(\{status:'evaluation_pending'/)
  assert.match(source,/productionTrafficAuthorized:false/)
  assert.match(source,/authorityExpanded:false/)
})

test('backlog compact cron imports the delivered quarantine review module',()=>{
  const route=read('app/api/cron/cos-university-mass-backlog-compact/route.ts')
  assert.match(route,/cosUniversityMassQuarantineReview/)
  assert.match(route,/await reviewMassQuarantine\(\)/)
})
