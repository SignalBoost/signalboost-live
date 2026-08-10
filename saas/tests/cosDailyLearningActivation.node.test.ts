import assert from 'node:assert/strict'
import test from 'node:test'
import { autonomousLearningIsExplicitlyEnabled, controlledLearningConfigFromEnvironment } from '../lib/cos-core/layers/learning/trigger'

test('autonomous learning is disabled unless explicitly enabled', () => {
  assert.equal(autonomousLearningIsExplicitlyEnabled({}), false)
  assert.equal(autonomousLearningIsExplicitlyEnabled({ COS_AUTONOMOUS_LEARNING_ENABLED: 'false' }), false)
  assert.equal(autonomousLearningIsExplicitlyEnabled({ COS_AUTONOMOUS_LEARNING_ENABLED: 'true' }), true)
})

test('controlled learning environment caps gaps at ten', () => {
  const config = controlledLearningConfigFromEnvironment({
    COS_AUTONOMOUS_LEARNING_ENABLED: 'true',
    COS_AUTONOMOUS_LEARNING_MAX_GAPS: '500',
  })
  assert.equal(config.enabled, true)
  assert.equal(config.maxGapsPerRun, 10)
})
