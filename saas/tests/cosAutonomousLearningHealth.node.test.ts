import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const health = readFileSync(new URL('../lib/ai/cos/autonomousLearningHealth.ts', import.meta.url), 'utf8')
const currentWorld = readFileSync(new URL('../app/api/cron/cos-current-world-learning/route.ts', import.meta.url), 'utf8')
const mining = readFileSync(new URL('../app/api/cron/cos-mining/route.ts', import.meta.url), 'utf8')
const liveState = readFileSync(new URL('../lib/ai/cos/cosLiveSystemState.ts', import.meta.url), 'utf8')
const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')

test('hourly and daily automatic learning schedules are both deployed', () => {
  assert.match(vercel, /\/api\/cron\/cos-current-world-learning/)
  assert.match(vercel, /"schedule":\s*"14 \* \* \* \*"/)
  assert.match(vercel, /\/api\/cron\/cos-mining/)
  assert.match(vercel, /"schedule":\s*"30 6 \* \* \*"/)
  assert.match(vercel, /"COS_AUTONOMOUS_LEARNING_ENABLED":\s*"true"/)
  assert.match(vercel, /"COS_LIVE_SOURCES_ENABLED":\s*"true"/)
})

test('current-world cron records autonomous health, rejection reasons, and indexes newly accepted evidence', () => {
  assert.match(currentWorld, /recordAutonomousLearningRun/)
  assert.match(currentWorld, /mode:\s*'current_world'/)
  assert.match(currentWorld, /documentsAcquired:\s*learning\.documentsAcquired/)
  assert.match(currentWorld, /accepted:\s*learning\.accepted/)
  assert.match(currentWorld, /rejected:\s*learning\.rejected/)
  assert.match(currentWorld, /sourceErrors:\s*learning\.sourceErrors/)
  assert.match(currentWorld, /no_new_knowledge/)
  assert.match(currentWorld, /indexRecentUnembeddedLearnedCorpus/)
  assert.match(currentWorld, /indexed:\s*indexing\?\.embedded\s*\?\?\s*0/)
  assert.match(currentWorld, /indexingFailed:\s*indexing\?\.failed\s*\?\?\s*0/)
})

test('daily mining cron records the broad autonomous-learning cycle separately from manual ingestion', () => {
  assert.match(mining, /recordAutonomousLearningRun/)
  assert.match(mining, /mode:\s*'daily'/)
  assert.match(mining, /documentsAcquired:\s*learning\.documentsAcquired/)
  assert.match(mining, /accepted:\s*learning\.accepted/)
  assert.match(mining, /sourceErrors:\s*learning\.sourceErrors/)
  assert.match(mining, /mining_prerequisite_failed/)
})

test('autonomous health is persisted independently of corpus-size growth and explains zero-yield runs', () => {
  assert.match(health, /cos-autonomous-learning-health/)
  assert.match(health, /cos_learning_observations/)
  assert.match(health, /capability:\s*input\.mode/)
  assert.match(health, /rejected/)
  assert.match(health, /sourceErrors/)
  assert.doesNotMatch(health, /cos_continuous_learning.*count/i)
})

test('live state exposes readiness and durable run health rather than inferring health from manual corpus growth', () => {
  assert.match(liveState, /autonomousLearningReadiness/)
  assert.match(liveState, /readAutonomousLearningHealth/)
  assert.match(liveState, /Automatic Learning/)
  assert.match(liveState, /Auto Current-World/)
  assert.match(liveState, /Auto Daily Learning/)
  assert.match(liveState, /DEGRADED/)
  assert.match(liveState, /FAILED/)
  assert.match(liveState, /STALE/)
  assert.match(liveState, /source errors/)
})

test('run freshness is bounded independently for hourly and daily learning', () => {
  assert.match(health, /mode === 'current_world' \? 2 \* 60 \* 60 \* 1000 : 30 \* 60 \* 60 \* 1000/)
})
