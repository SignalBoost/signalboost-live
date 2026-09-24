import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const host = readFileSync(new URL('../provider-hub-host/playwright-mcp-sandbox-acceptance.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/cron/playwright-mcp-live-acceptance/route.ts', import.meta.url), 'utf8')
const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')

test('Production Playwright MCP acceptance uses the exact pinned package and real Chromium', () => {
  assert.match(host, /@playwright\/mcp@0\.0\.82/)
  assert.doesNotMatch(host, /@playwright\/test@/)
  assert.match(host, /require\('\$\{ROOT\}\/node_modules\/playwright'\)/)
  assert.match(host, /--no-webmcp/)
  assert.match(host, /install-deps.*chromium/s)
  assert.match(host, /install.*chromium/s)
  assert.match(host, /chromiumRuntime|chromium_runtime_probe|--version/)
  assert.match(host, /browser_navigate/)
  assert.match(host, /browser_snapshot/)
  assert.match(host, /browser_console_messages/)
  assert.match(host, /browser_network_requests/)
  assert.match(host, /browser_take_screenshot/)
})

test('Production MCP canary preserves Provider Hub and origin policy evidence', () => {
  assert.match(host, /createBrowserMcpRegistryEntries/)
  assert.match(host, /assertBrowserMcpToolCallForTest/)
  assert.match(host, /browser_mcp_navigation_origin_rejected/)
  assert.match(host, /networkPolicy: 'deny-all'/)
  assert.match(host, /updateNetworkPolicy\(\{ allow:/)
  assert.match(host, /sandboxDestroyed: true/)
})

test('Production Playwright MCP route is production-only and CRON_SECRET gated', () => {
  assert.match(route, /VERCEL_ENV !== 'production'/)
  assert.match(route, /CRON_SECRET/)
  assert.match(route, /authorization/)
  assert.match(route, /Bearer/)
  assert.match(route, /playwright_mcp_production_acceptance/)
  assert.match(vercel, /\/api\/cron\/playwright-mcp-live-acceptance/)
  assert.match(gate, /playwrightMcpProductionAcceptance\.node\.test\.ts/)
})
