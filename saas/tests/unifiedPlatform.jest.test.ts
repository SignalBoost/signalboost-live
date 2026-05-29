import { ADMIN_SIDEBAR, CRM_STAGES, FORECASTS, getConciergeAnswer } from '../lib/platform/unifiedPlatform'

describe('Unified NASA-style SignalBoost platform', () => {
  test('Concierge handles Marketplace and SaaS queries', () => {
    expect(getConciergeAnswer('marketplace partner booking', 'en').reply).toMatch(/Marketplace|partner/i)
    expect(getConciergeAnswer('promote reviews calendar spreadsheets outreach', 'en').reply).toMatch(/Promote Business|Reviews|Calendar|Spreadsheets|Outreach/)
  })

  test('Admin Console exposes requested panels and CRM/forecasting primitives', () => {
    expect(ADMIN_SIDEBAR.map(item => item.label)).toEqual(['Overview', 'Logs', 'Outreach', 'Insights', 'Role Management', 'Marketplace Monitor', 'SaaS Monitor', 'Concierge Monitor'])
    expect(CRM_STAGES.map(stage => stage.stage)).toEqual(['Leads', 'Opportunities', 'Conversions'])
    expect(FORECASTS).toHaveLength(3)
  })
})
