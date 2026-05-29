import assert from 'node:assert/strict'
import test from 'node:test'
import { ADMIN_SIDEBAR, COCKPIT_PANELS, CRM_STAGES, DESIGN_TOKENS, FINANCIAL_LEDGER, FORECASTS, KPI_DASHBOARD, SUPPORTED_LOCALES, UNIFIED_NAV, getConciergeAnswer, inferAudienceRole } from '../lib/platform/unifiedPlatform.ts'

test('design tokens cover typography, spacing, colors, shadows, and glassmorphism', () => {
  assert.ok(DESIGN_TOKENS.typography.display)
  assert.ok(DESIGN_TOKENS.spacing.xxl)
  assert.equal(DESIGN_TOKENS.colors.cyan, '#1af0ff')
  assert.ok(DESIGN_TOKENS.shadows.cyanGlow.includes('rgba'))
  assert.ok(DESIGN_TOKENS.glass.surface.includes('linear-gradient'))
})

test('unified nav and admin sidebar include Marketplace, SaaS, Concierge, and role sections', () => {
  assert.ok(UNIFIED_NAV.some(item => item.label === 'Marketplace'))
  assert.ok(UNIFIED_NAV.some(item => item.label === 'Outreach'))
  assert.deepEqual(ADMIN_SIDEBAR.map(item => item.label), ['Overview', 'Logs', 'Outreach', 'Insights', 'Role Management', 'Marketplace Monitor', 'SaaS Monitor', 'Concierge Monitor'])
})

test('concierge routes marketplace and SaaS queries with telemetry role inference', () => {
  const marketplace = getConciergeAnswer('I need a partner category booking', 'es', '/')
  assert.equal(marketplace.role, 'partner')
  assert.equal(marketplace.language, 'es')
  assert.match(marketplace.reply, /Marketplace|partner/i)

  const saas = getConciergeAnswer('Help my business with reviews calendar spreadsheets and outreach', 'pt', '/dashboard')
  assert.equal(saas.role, 'customer')
  assert.match(saas.reply, /Promote Business|Reviews|Calendar|Spreadsheets|Outreach/)
})

test('outreach engine, CRM, forecasting, financial, and KPI datasets are telemetry-ready', () => {
  assert.deepEqual(CRM_STAGES.map(stage => stage.stage), ['Leads', 'Opportunities', 'Conversions'])
  assert.deepEqual(FORECASTS.map(item => item.horizon), ['7 days', '30 days', '90 days'])
  assert.equal(FINANCIAL_LEDGER.unifiedRevenue, '$96.7K')
  assert.equal(KPI_DASHBOARD.unifiedEngagementIndex, '87/100')
  assert.equal(COCKPIT_PANELS.length, 6)
})

test('i18n locales are supported for concierge fallback responses', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const answer = getConciergeAnswer('hello', locale)
    assert.equal(answer.language, locale)
    assert.ok(answer.reply.length > 50)
  }
})

test('intent inference remains under a 2s performance budget', () => {
  const start = performance.now()
  for (let i = 0; i < 1000; i += 1) inferAudienceRole('executive forecast kpi outreach marketplace booking')
  assert.ok(performance.now() - start < 2000)
})
