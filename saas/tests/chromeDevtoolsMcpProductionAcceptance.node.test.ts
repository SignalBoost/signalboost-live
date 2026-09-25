// saas/tests/chromeDevtoolsMcpProductionAcceptance.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const host = readFileSync(new URL('../provider-hub-host/chrome-devtools-mcp-sandbox-acceptance.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/cron/chrome-devtools-mcp-live-acceptance/route.ts', import.meta.url), 'utf8')
const profiles = readFileSync(new URL('../provider-hub-host/browser-mcp-profiles.ts', import.meta.url), 'utf8')
const stdioHost = readFileSync(new URL('../provider-hub-host/browser-mcp-stdio-host.ts', import.meta.url), 'utf8')
const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')

test('Production Chrome DevTools MCP certificate launches the exact pinned server with the governed args', () => {
  assert.match(host, /const PACKAGE_NAME = 'chrome-devtools-mcp' as const/)
  assert.match(host, /const PACKAGE_VERSION = '1\.9\.0' as const/)
  assert.match(host, /CHROME_DEVTOOLS_MCP_PROFILE\.recommendedArgs/)
  assert.match(host, /isolatedBrowserMcpSandboxArgs\('chrome-devtools-mcp'\)/)
  assert.match(host, /--executable-path=/)
  assert.match(host, /CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS/)
  assert.match(host, /install-deps', 'chromium'/)
  assert.match(host, /'install', 'chromium'/)
  assert.match(host, /chromium_runtime_probe/)
  for (const tool of ['new_page', 'list_pages', 'take_snapshot', 'list_console_messages', 'list_network_requests', 'take_screenshot']) {
    assert.match(host, new RegExp(`call\\('${tool}'`))
  }
  assert.match(host, /structuredContent/)
  assert.match(host, /return `/)
})

test('Production Chrome DevTools MCP certificate preserves Provider Hub, origin and redirect-escape evidence', () => {
  assert.match(host, /createBrowserMcpRegistryEntries/)
  assert.match(host, /assertBrowserMcpToolCallForTest/)
  assert.match(host, /assertBrowserMcpNavigationResultForTest/)
  assert.match(host, /browser_mcp_navigation_origin_rejected/)
  assert.match(host, /host_redirect_escape_guard/)
  assert.match(host, /networkPolicy: 'deny-all'/)
  assert.match(host, /updateNetworkPolicy\(\{ allow:/)
  assert.match(host, /sandbox_destroyed/)
  assert.match(host, /await sandbox\.stop\(\)/)
})

test('generated runtime keeps the certificate root separate from the host constant', () => {
  assert.match(host, /const RUNTIME_ROOT = \$\{JSON\.stringify\(input\.runtimeRoot\)\}/)
  assert.match(host, /cwd: RUNTIME_ROOT/)
})

test('host live allowlist only projects tools that chrome-devtools-mcp@1.9.0 actually ships', () => {
  // 1.9.0 has no get_css_styles tool; projecting it advertised a capability that could never execute.
  assert.doesNotMatch(profiles, /get_css_styles/)
  assert.doesNotMatch(stdioHost, /get_css_styles/)
})

test('Production Chrome DevTools MCP route is production-only, CRON_SECRET gated and idempotent per deployment', () => {
  assert.match(route, /VERCEL_ENV !== 'production'/)
  assert.match(route, /CRON_SECRET/)
  assert.match(route, /Bearer/)
  assert.match(route, /VERCEL_DEPLOYMENT_ID/)
  assert.match(route, /chrome_devtools_mcp_production_acceptance_completed/)
  assert.match(route, /deployment_already_accepted/)
  assert.match(route, /supervisor_audit_events/)
  assert.match(route, /upsert\(/)
  assert.doesNotMatch(route, /playwright/i)
  const config = JSON.parse(vercel) as { crons?: Array<{ path?: string; schedule?: string }> }
  const cron = config.crons?.find(item => item.path === '/api/cron/chrome-devtools-mcp-live-acceptance')
  assert.ok(cron)
  assert.equal(cron.schedule, '*/5 * * * *')
  assert.match(gate, /chromeDevtoolsMcpProductionAcceptance\.node\.test\.ts/)
})