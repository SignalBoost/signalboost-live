import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveYouTubeTranscriptRuntime } from '../lib/cos-core/layers/learning/liveSources'

test('explicit transcript runtime wins and can reuse LOCAL_AI_API_KEY when token is omitted', () => {
  const resolved = resolveYouTubeTranscriptRuntime({
    YOUTUBE_TRANSCRIPT_API_URL: 'https://transcripts.example.com/transcript',
    LOCAL_AI_API_KEY: 'shared-secret',
  })
  assert.equal(resolved.url, 'https://transcripts.example.com/transcript')
  assert.equal(resolved.token, 'shared-secret')
  assert.equal(resolved.derived, false)
})

test('RunPod transcript endpoint is derived through the existing reasoner gateway', () => {
  const resolved = resolveYouTubeTranscriptRuntime({
    LOCAL_AI_BASE_URL: 'https://funde3nh1mp5mq-11434.proxy.runpod.net/v1',
    LOCAL_AI_API_KEY: 'shared-secret',
  })
  assert.equal(resolved.url, 'https://funde3nh1mp5mq-11434.proxy.runpod.net/transcript')
  assert.equal(resolved.token, 'shared-secret')
  assert.equal(resolved.derived, true)
})

test('transcript endpoint is never inferred from arbitrary or insecure local AI hosts', () => {
  assert.equal(resolveYouTubeTranscriptRuntime({ LOCAL_AI_BASE_URL: 'https://ai.example.com/v1', LOCAL_AI_API_KEY: 'x' }).url, '')
  assert.equal(resolveYouTubeTranscriptRuntime({ LOCAL_AI_BASE_URL: 'http://funde3nh1mp5mq-11434.proxy.runpod.net/v1', LOCAL_AI_API_KEY: 'x' }).url, '')
})

test('explicit transcript token overrides the shared local inference token', () => {
  const resolved = resolveYouTubeTranscriptRuntime({
    LOCAL_AI_BASE_URL: 'https://funde3nh1mp5mq-11434.proxy.runpod.net/v1',
    LOCAL_AI_API_KEY: 'shared-secret',
    YOUTUBE_TRANSCRIPT_API_TOKEN: 'transcript-secret',
  })
  assert.equal(resolved.token, 'transcript-secret')
})
