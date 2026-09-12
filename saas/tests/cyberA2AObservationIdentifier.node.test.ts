import test from 'node:test'
import assert from 'node:assert/strict'
import { A2A_RUNTIME_OBSERVATION_VERSION } from '../a2a-host/a2a-runtime-observability.ts'
import { cyberProductText } from '../lib/cyber/cyberReportPresentation.ts'

test('current A2A runtime observation schema identifier stays byte-stable in cyber presentation', () => {
  assert.equal(A2A_RUNTIME_OBSERVATION_VERSION, 'signalboost-a2a-runtime-observation-v2')
  assert.equal(cyberProductText(A2A_RUNTIME_OBSERVATION_VERSION), A2A_RUNTIME_OBSERVATION_VERSION)
  assert.equal(
    cyberProductText(`SignalBoost recorded ${A2A_RUNTIME_OBSERVATION_VERSION} as technical evidence.`),
    `iTMounts recorded ${A2A_RUNTIME_OBSERVATION_VERSION} as technical evidence.`,
  )
})
