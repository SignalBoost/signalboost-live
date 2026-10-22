import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const helper = readFileSync(new URL('../lib/builder/playwright-cli-live-acceptance.ts', import.meta.url), 'utf8')
const cron = readFileSync(new URL('../app/api/cron/builder-playwright-cli-live-acceptance/route.ts', import.meta.url), 'utf8')
const preview = readFileSync(new URL('../app/api/internal/builder-playwright-cli-live-acceptance/route.ts', import.meta.url), 'utf8')
const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')

test('Playwright live acceptance exercises the complete deterministic diagnostic sequence', () => {
  for (const action of ['open', 'snapshot', 'console', 'requests', 'close']) {
    assert.match(helper, new RegExp(`action: ['"]${action}['"]`))
  }
  assert.match(helper, /browserEvidenceStored: false/)
  assert.doesNotMatch(helper, /stdout:|stderr:/)
})

test('Production Playwright acceptance is production-only and CRON_SECRET gated', () => {
  assert.match(cron, /VERCEL_ENV !== 'production'/)
  assert.match(cron, /CRON_SECRET/)
  assert.match(cron, /authorization/)
  assert.match(cron, /Bearer/)
  assert.match(cron, /builder_playwright_cli_production_acceptance/)
})

test('Preview Playwright acceptance is authenticated before creating a billable sandbox', () => {
  assert.match(preview, /VERCEL_ENV !== 'preview'/)
  assert.match(preview, /CRON_SECRET/)
  assert.match(preview, /request\.headers\.get\('authorization'\)/)
  assert.match(preview, /status: 401/)
  assert.ok(preview.indexOf("status: 401") < preview.indexOf("runBuilderPlaywrightCliLiveAcceptance()"))
})

test('Preview and Production use the same live acceptance implementation', () => {
  assert.match(preview, /runBuilderPlaywrightCliLiveAcceptance/)
  assert.match(cron, /runBuilderPlaywrightCliLiveAcceptance/)
  assert.match(vercel, /\/api\/cron\/builder-playwright-cli-live-acceptance/)
})
