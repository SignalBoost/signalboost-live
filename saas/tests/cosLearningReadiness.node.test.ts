import assert from 'node:assert/strict'
import test from 'node:test'
import { autonomousLearningReadiness } from '../lib/cos/dailyAutonomousLearning.ts'

test('learning readiness explains when autonomous learning is disabled',()=>{
  const status=autonomousLearningReadiness({COS_AUTONOMOUS_LEARNING_ENABLED:'false',COS_LIVE_SOURCES_ENABLED:'true'} as NodeJS.ProcessEnv)
  assert.equal(status.autonomousEnabled,false)
  assert.equal(status.ready,false)
  assert.ok(status.warnings.some(item=>item.includes('COS_AUTONOMOUS_LEARNING_ENABLED')))
})

test('live learning exposes configured source adapters',()=>{
  const status=autonomousLearningReadiness({COS_AUTONOMOUS_LEARNING_ENABLED:'true',COS_LIVE_SOURCES_ENABLED:'true'} as NodeJS.ProcessEnv)
  assert.equal(status.autonomousEnabled,true)
  assert.equal(status.liveSourcesEnabled,true)
  assert.ok(status.liveAdapters>=6)
  assert.equal(status.ready,true)
})
