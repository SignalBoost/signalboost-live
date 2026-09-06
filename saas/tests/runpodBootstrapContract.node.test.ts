import assert from 'node:assert/strict'
import test from 'node:test'

import { desiredRunpodStartupContract } from '../lib/hub/runpodTelemetry.ts'

test('RunPod startup restores the repository-owned COS bootstrap when workspace is empty', () => {
  const previousReasoner = process.env.LOCAL_AI_MODEL
  const previousEmbedding = process.env.LOCAL_AI_EMBEDDING_MODEL
  const previousBootstrapUrl = process.env.COS_RUNPOD_BOOTSTRAP_URL

  process.env.LOCAL_AI_MODEL = 'qwen2.5-coder:32b'
  process.env.LOCAL_AI_EMBEDDING_MODEL = 'nomic-embed-text'
  delete process.env.COS_RUNPOD_BOOTSTRAP_URL

  try {
    const contract = desiredRunpodStartupContract()
    assert.deepEqual(contract.dockerEntrypoint, ['bash', '-lc'])
    assert.equal(contract.dockerStartCmd.length, 1)
    const command = contract.dockerStartCmd[0]
    assert.match(command, /raw\.githubusercontent\.com\/SignalBoost\/signalboost-live\/main\/saas\/scripts\/runpod\/run-cos-reasoner\.sh/)
    assert.match(command, /curl -fsSL/)
    assert.match(command, /chmod 0755 \/workspace\/run-cos-reasoner\.sh/)
    assert.match(command, /COS_REASONER_MODEL='qwen2\.5-coder:32b'/)
    assert.match(command, /COS_EMBEDDING_MODEL='nomic-embed-text'/)
  } finally {
    if (previousReasoner === undefined) delete process.env.LOCAL_AI_MODEL
    else process.env.LOCAL_AI_MODEL = previousReasoner
    if (previousEmbedding === undefined) delete process.env.LOCAL_AI_EMBEDDING_MODEL
    else process.env.LOCAL_AI_EMBEDDING_MODEL = previousEmbedding
    if (previousBootstrapUrl === undefined) delete process.env.COS_RUNPOD_BOOTSTRAP_URL
    else process.env.COS_RUNPOD_BOOTSTRAP_URL = previousBootstrapUrl
  }
})

test('RunPod bootstrap override must be HTTPS and credential-free', () => {
  const previousBootstrapUrl = process.env.COS_RUNPOD_BOOTSTRAP_URL
  try {
    process.env.COS_RUNPOD_BOOTSTRAP_URL = 'http://example.com/bootstrap.sh'
    assert.throws(() => desiredRunpodStartupContract(), /must be an HTTPS URL/)

    process.env.COS_RUNPOD_BOOTSTRAP_URL = 'https://user:secret@example.com/bootstrap.sh'
    assert.throws(() => desiredRunpodStartupContract(), /without embedded credentials/)
  } finally {
    if (previousBootstrapUrl === undefined) delete process.env.COS_RUNPOD_BOOTSTRAP_URL
    else process.env.COS_RUNPOD_BOOTSTRAP_URL = previousBootstrapUrl
  }
})
