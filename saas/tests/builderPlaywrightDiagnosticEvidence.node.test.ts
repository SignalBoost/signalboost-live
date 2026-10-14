import assert from 'node:assert/strict'
import test from 'node:test'
import { browserDiagnosticSummary } from '../lib/builder/playwright-cli-live-acceptance.ts'

test('console diagnostics detect errors without treating empty reports as failures', () => {
  assert.deepEqual(browserDiagnosticSummary('console', 'No console messages'), { clear: true, count: 0 })
  assert.deepEqual(browserDiagnosticSummary('console', '[error] Uncaught TypeError'), { clear: false, count: 1 })
})

test('network diagnostics detect HTTP and transport failures', () => {
  assert.deepEqual(browserDiagnosticSummary('requests', 'GET /assets/logo.svg 200'), { clear: true, count: 0 })
  assert.deepEqual(browserDiagnosticSummary('requests', 'GET /api/items HTTP 500'), { clear: false, count: 1 })
  assert.deepEqual(browserDiagnosticSummary('requests', 'GET /api/items net::ERR_FAILED'), { clear: false, count: 1 })
})
