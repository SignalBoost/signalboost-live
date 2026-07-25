import assert from 'node:assert/strict'
import test from 'node:test'

import { buildProviderActionPreviewFromRequest } from '../lib/hub/provider-action-preview-request.ts'

test('builds a direct preview for a valid legacy provider template', () => {
  const result = buildProviderActionPreviewFromRequest({
    templateId: 'aws.create_s3_bucket',
    payload: { bucketName: 'signalboost-preview-test' },
  })

  assert.equal(result.preview.templateId, 'aws.create_s3_bucket')
  assert.equal(result.preview.mode, 'direct')
  assert.equal(result.preview.modeLabel, 'Direct API')
  assert.equal(result.preview.executesProviderMutation, true)
  assert.deepEqual(
    result.policy.capabilities.filter(capability => capability.available).map(capability => capability.mode),
    ['direct', 'manual'],
  )
})

test('presents the non-executing fallback as direct configuration', () => {
  const result = buildProviderActionPreviewFromRequest({
    templateId: 'aws.create_s3_bucket',
    payload: { bucketName: 'signalboost-preview-test' },
    mode: 'manual',
  })

  assert.equal(result.preview.modeLabel, 'Direct configuration')
  assert.equal(result.preview.executesProviderMutation, false)
})

test('rejects hidden or unsupported execution modes', () => {
  assert.throws(() => buildProviderActionPreviewFromRequest({
    templateId: 'aws.create_s3_bucket',
    payload: { bucketName: 'signalboost-preview-test' },
    mode: 'browser_agent',
  }), /provider_execution_mode_unsupported/)
})

test('rejects unknown templates and invalid template payloads', () => {
  assert.throws(() => buildProviderActionPreviewFromRequest({
    templateId: 'unknown.action',
    payload: {},
  }), /provider_template_not_found/)

  assert.throws(() => buildProviderActionPreviewFromRequest({
    templateId: 'aws.create_s3_bucket',
    payload: {},
  }), /provider_payload_invalid/)
})

test('redacts secret-shaped values before returning preview data', () => {
  const result = buildProviderActionPreviewFromRequest({
    templateId: 'aws.create_s3_bucket',
    payload: {
      bucketName: 'signalboost-preview-test',
      metadata: { apiToken: 'must-not-leak' },
    },
  })

  assert.deepEqual(result.preview.payload, {
    bucketName: 'signalboost-preview-test',
    metadata: { apiToken: '[REDACTED]' },
  })
})
