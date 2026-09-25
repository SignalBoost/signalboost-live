// saas/provider-hub-host/chrome-devtools-mcp-sandbox-acceptance.ts
//
// Production certificate for the governed Chrome DevTools MCP runtime.
//
// GitHub Actions live acceptance (.github/workflows/chrome-devtools-mcp-live-acceptance.yml) proves the
// runtime on a CI host. This certificate proves the same pinned server on Production infrastructure: an
// ephemeral Vercel Sandbox launches exact chrome-devtools-mcp@1.9.0 with the exact governed launch
// arguments (CHROME_DEVTOOLS_MCP_PROFILE.recommendedArgs + isolatedBrowserMcpSandboxArgs), drives it over
// stdio, and records metadata-only evidence. Page text, console bodies, network headers, screenshots,
// prompts and credentials are never persisted.
//
// Chromium comes from the exact Playwright runtime pin the Playwright MCP certificate already proves on
// this Sandbox image; chrome-devtools-mcp receives it through --executable-path and downloads nothing.
// The Sandbox starts deny-all, opens only for bootstrap, narrows egress to the approved iTMounts hosts
// before the browser starts, and is always stopped afterwards.

import { Sandbox } from '@vercel/sandbox'
import {
  CHROME_DEVTOOLS_MCP_PROFILE,
  createBrowserMcpRegistryEntries,
} from './browser-mcp-profiles.ts'
import {
  assertBrowserMcpNavigationResultForTest,
  assertBrowserMcpToolCallForTest,
  isolatedBrowserMcpSandboxArgs,
  liveBrowserMcpToolNames,
} from './browser-mcp-stdio-host.ts'

const ROOT = '/tmp/itmounts-chrome-devtools-mcp-acceptance'
const BROWSER_CACHE = `${ROOT}/pw-browsers`
const SCRIPT_PATH = `${ROOT}/acceptance.cjs`
const COMMAND_TIMEOUT_MS = 30_000
const BOOTSTRAP_TIMEOUT_MS = 180_000
const ACCEPTANCE_TIMEOUT_MS = 120_000
const SANDBOX_TIMEOUT_MS = 230_000
const PACKAGE_NAME = 'chrome-devtools-mcp' as const
const PACKAGE_VERSION = '1.9.0' as const
// Browser runtime only. Same exact playwright-core build the Playwright MCP certificate installs through
// @playwright/mcp@0.0.82, so Chromium download + system dependency install are already proven on this image.
const BROWSER_RUNTIME_PACKAGE = 'playwright-core@1.64.0-alpha-1789764292000'
const APPROVED_ORIGINS = Object.freeze(['https://itmounts.com', 'https://www.itmounts.com'])
const PROBE_URL = 'https://itmounts.com/'
const DANGEROUS_TOOLS = Object.freeze(['evaluate_script', 'upload_file', 'emulate', 'resize_page', 'close_page'])
const MARKER = 'ITMOUNTS_CHROME_DEVTOOLS_MCP_ACCEPTANCE'
const LIVE_CHECK_COUNT = 10

type Check = Readonly<{ name: string; passed: boolean; detail: string }>

export type ChromeDevtoolsMcpProductionAcceptance = Readonly<{
  ok: boolean
  schemaVersion: 'chrome-devtools-mcp-production-acceptance-v1'
  packageName: 'chrome-devtools-mcp'
  packageVersion: '1.9.0'
  transport: 'stdio'
  checks: readonly Check[]
  privacy: Readonly<{
    pageContentStored: false
    consoleBodiesStored: false
    networkHeadersStored: false
    screenshotsStored: false
    credentialsStored: false
    sandboxDestroyed: boolean
  }>
}>

function bounded(value: unknown, max = 160): string {
  return String(value ?? '').replace(/https?:\/\/\S+/gi, '<url>').replace(/\s+/g, ' ').trim().slice(0, max)
}

function allowedHosts(): readonly string[] {
  return Object.freeze([...new Set(APPROVED_ORIGINS.map(value => new URL(value).hostname))])
}

/**
 * The CommonJS program executed inside the Sandbox. Exported so the exact same program can be exercised
 * against a local Chromium and loopback origin in tests; Production always uses the fixed constants above.
 */
export function chromeDevtoolsMcpAcceptanceRuntimeScript(input: {
  runtimeRoot: string
  browserExecutable: string
  probeUrl: string
  approvedOrigins: readonly string[]
}): string {
  const launchArgs = JSON.stringify([
    '--no-install',
    PACKAGE_NAME,
    ...CHROME_DEVTOOLS_MCP_PROFILE.recommendedArgs,
    ...isolatedBrowserMcpSandboxArgs('chrome-devtools-mcp'),
    `--executable-path=${input.browserExecutable}`,
  ])
  const liveTools = JSON.stringify(liveBrowserMcpToolNames('chrome-devtools-mcp'))
  return `
const { spawn } = require('node:child_process')

const RUNTIME_ROOT = ${JSON.stringify(input.runtimeRoot)}
const launchArgs = ${launchArgs}
const approvedOrigins = new Set(${JSON.stringify(input.approvedOrigins)})
const liveTools = Object.freeze(${liveTools})
const dangerousTools = Object.freeze(${JSON.stringify(DANGEROUS_TOOLS)})
const probeUrl = ${JSON.stringify(input.probeUrl)}
const liveCheckCount = ${LIVE_CHECK_COUNT}
const checks = []
let nextId = 0
let buffer = ''
let child = null
const pending = new Map()

function safe(value, max = 160) {
  return String(value ?? '').replace(/https?:\\/\\/\\S+/gi, '<url>').replace(/\\s+/g, ' ').trim().slice(0, max)
}
function add(name, passed, detail) {
  checks.push({ name, passed: Boolean(passed), detail: safe(detail) })
}
function originOf(url) {
  try { return new URL(url).origin } catch { return null }
}
function originAllowed(url) {
  const origin = originOf(url)
  return Boolean(origin && approvedOrigins.has(origin))
}
function resultIsOk(raw) {
  return Boolean(raw && typeof raw === 'object' && raw.isError !== true)
}
function structuredPages(raw) {
  const pages = raw && raw.structuredContent && Array.isArray(raw.structuredContent.pages) ? raw.structuredContent.pages : []
  return pages.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const id = typeof item.id === 'number' ? item.id : typeof item.pageId === 'number' ? item.pageId : NaN
    const url = typeof item.url === 'string' ? item.url : ''
    return Number.isInteger(id) && url ? [{ id, url, selected: item.selected === true }] : []
  })
}
function httpPage(page) {
  return /^https?:/i.test(page.url)
}
function settleLine(line) {
  let parsed
  try { parsed = JSON.parse(line) } catch { return }
  if (parsed.id === undefined || parsed.id === null) return
  const slot = pending.get(parsed.id)
  if (!slot) return
  pending.delete(parsed.id)
  clearTimeout(slot.timer)
  if (parsed.error) slot.reject(new Error('mcp_remote_error'))
  else slot.resolve(parsed.result)
}
function request(method, params) {
  const id = ++nextId
  const payload = { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('mcp_request_timeout'))
    }, 45_000)
    pending.set(id, { resolve, reject, timer })
    child.stdin.write(JSON.stringify(payload) + '\\n')
  })
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }) + '\\n')
}
async function call(name, args = {}) {
  return request('tools/call', { name, arguments: args })
}

async function main() {
  child = spawn('npx', launchArgs, {
    cwd: RUNTIME_ROOT,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      npm_config_yes: 'false',
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1',
      NO_COLOR: '1',
    },
  })
  child.stdout.setEncoding('utf8')
  child.stderr.on('data', () => {})
  child.stdout.on('data', chunk => {
    buffer += String(chunk)
    if (Buffer.byteLength(buffer, 'utf8') > 8 * 1024 * 1024) {
      child.kill('SIGTERM')
      return
    }
    for (;;) {
      const i = buffer.indexOf('\\n')
      if (i < 0) break
      const line = buffer.slice(0, i).trim()
      buffer = buffer.slice(i + 1)
      if (line) settleLine(line)
    }
  })

  const initialized = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'itmounts-chrome-devtools-mcp-production-canary', version: '1.0.0' },
  })
  add('mcp_initialize', initialized && typeof initialized.protocolVersion === 'string', 'protocol=' + safe(initialized && initialized.protocolVersion, 32))
  notify('notifications/initialized')

  const listed = await request('tools/list')
  const names = Array.isArray(listed && listed.tools) ? listed.tools.map(tool => String((tool && tool.name) || '')).filter(Boolean) : []
  const missing = liveTools.filter(name => !names.includes(name))
  add('live_tool_discovery', missing.length === 0, 'providerTools=' + names.length + '; requiredLiveTools=' + liveTools.length + '; missing=' + (missing.join(',') || 'none'))
  add('dangerous_tools_not_host_projected', !liveTools.some(name => dangerousTools.includes(name)), 'hostProjected=' + liveTools.length)

  add('off_origin_host_rejected', !originAllowed('https://example.invalid/'), 'host_policy=rejected')
  if (!originAllowed(probeUrl)) throw new Error('approved_probe_origin_missing')

  const opened = await call('new_page', { url: probeUrl })
  const openedPages = structuredPages(opened)
  const selected = openedPages.find(page => page.selected) || null
  const target = selected || (openedPages.length ? openedPages.reduce((a, b) => (b.id > a.id ? b : a)) : null)
  const escaped = openedPages.filter(httpPage).some(page => !originAllowed(page.url))
  add(
    'approved_itmounts_navigation',
    resultIsOk(opened) && Boolean(target) && originAllowed(target.url) && !escaped,
    'structuredPages=' + openedPages.length + '; targetApproved=' + Boolean(target && originAllowed(target.url)) + '; offOriginPage=' + escaped,
  )
  if (!target || !originAllowed(target.url)) throw new Error('approved_page_missing')

  const pagesResult = await call('list_pages', {})
  const listedPages = structuredPages(pagesResult)
  add(
    'structured_page_evidence',
    resultIsOk(pagesResult) && listedPages.some(page => page.id === target.id && originAllowed(page.url)),
    'pages=' + listedPages.length,
  )

  const snapshot = await call('take_snapshot', { pageId: target.id, verbose: false })
  add('accessibility_snapshot_live', resultIsOk(snapshot), 'mcp_call=take_snapshot')

  const consoleResult = await call('list_console_messages', { pageId: target.id, pageSize: 20 })
  add('console_diagnostics_live', resultIsOk(consoleResult), 'mcp_call=list_console_messages')

  const network = await call('list_network_requests', { pageId: target.id, pageSize: 20 })
  add('network_diagnostics_live', resultIsOk(network), 'mcp_call=list_network_requests')

  const screenshot = await call('take_screenshot', { pageId: target.id, format: 'jpeg', quality: 70 })
  add('screenshot_live', resultIsOk(screenshot), 'mcp_call=take_screenshot')

  const ok = checks.length >= liveCheckCount && checks.every(check => check.passed)
  process.stdout.write(JSON.stringify({ marker: '${MARKER}', ok, checks }) + '\\n')
  if (!ok) process.exitCode = 2
}

main().catch(error => {
  process.stdout.write(JSON.stringify({
    marker: '${MARKER}',
    ok: false,
    checks,
    error: safe(error && error.message ? error.message : 'unknown_error'),
  }) + '\\n')
  process.exitCode = 1
}).finally(() => {
  for (const slot of pending.values()) clearTimeout(slot.timer)
  pending.clear()
  if (child && !child.killed) child.kill('SIGTERM')
})
`
}

export function parseChromeDevtoolsMcpAcceptance(stdout: string): { ok: boolean; checks: Check[]; error?: string } {
  const lines = String(stdout || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index]) as Record<string, unknown>
      if (value.marker !== MARKER) continue
      const checks = Array.isArray(value.checks)
        ? value.checks.map(raw => {
            const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
            return Object.freeze({
              name: bounded(item.name, 80),
              passed: item.passed === true,
              detail: bounded(item.detail),
            })
          })
        : []
      return {
        ok: value.ok === true && checks.length >= LIVE_CHECK_COUNT && checks.every(check => check.passed),
        checks,
        ...(typeof value.error === 'string' ? { error: bounded(value.error) } : {}),
      }
    } catch {}
  }
  return { ok: false, checks: [], error: 'chrome_devtools_mcp_acceptance_marker_missing' }
}

function throwsOriginRejection(fn: () => void): boolean {
  try {
    fn()
    return false
  } catch (error) {
    return String(error instanceof Error ? error.message : error).includes('browser_mcp_navigation_origin_rejected')
  }
}

export async function runChromeDevtoolsMcpProductionAcceptance(): Promise<ChromeDevtoolsMcpProductionAcceptance> {
  const checks: Check[] = []

  checks.push(Object.freeze({
    name: 'pinned_profile',
    passed: CHROME_DEVTOOLS_MCP_PROFILE.packageName === PACKAGE_NAME && CHROME_DEVTOOLS_MCP_PROFILE.packageVersion === PACKAGE_VERSION,
    detail: `package=${CHROME_DEVTOOLS_MCP_PROFILE.packageName}; version=${CHROME_DEVTOOLS_MCP_PROFILE.packageVersion}`,
  }))

  const registry = createBrowserMcpRegistryEntries({
    tenantId: 'signalboost-reference',
    environmentId: 'production-reference',
    portableId: 'software-specialist',
    enabledProfiles: ['chrome-devtools-mcp'],
  })
  const mapping = registry.assignments[0]?.tools ?? []
  const liveNames = liveBrowserMcpToolNames('chrome-devtools-mcp')
  const liveCapabilityNames = new Set(liveNames.map(name => {
    const tool = CHROME_DEVTOOLS_MCP_PROFILE.tools.find(item => item.remoteToolName === name)
    return tool ? `browser.chrome-devtools-mcp.${tool.capabilityName}` : ''
  }).filter(Boolean))
  checks.push(Object.freeze({
    name: 'provider_hub_projection',
    passed: liveCapabilityNames.size === liveNames.length
      && liveNames.length > 0
      && [...liveCapabilityNames].every(name => mapping.some(item => item.capabilityId === name)),
    detail: `mapped=${mapping.length}; live=${liveCapabilityNames.size}`,
  }))

  const offOriginRejected = throwsOriginRejection(() => assertBrowserMcpToolCallForTest({
    serverId: 'chrome-devtools-mcp',
    toolName: 'new_page',
    args: { url: 'https://example.invalid/' },
    approvedOrigins: APPROVED_ORIGINS,
  }))
  checks.push(Object.freeze({
    name: 'host_origin_guard',
    passed: offOriginRejected,
    detail: `offOriginRejected=${offOriginRejected}`,
  }))

  const redirectEscapeRejected = throwsOriginRejection(() => assertBrowserMcpNavigationResultForTest({
    serverId: 'chrome-devtools-mcp',
    toolName: 'new_page',
    args: { url: PROBE_URL },
    approvedOrigins: APPROVED_ORIGINS,
    pages: [{ id: 1, url: 'https://example.invalid/', selected: true }],
  }))
  checks.push(Object.freeze({
    name: 'host_redirect_escape_guard',
    passed: redirectEscapeRejected,
    detail: `redirectEscapeRejected=${redirectEscapeRejected}`,
  }))

  let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | null = null
  let sandboxDestroyed = false
  try {
    sandbox = await Sandbox.create({
      image: 'vercel/sandbox/node:24',
      timeout: SANDBOX_TIMEOUT_MS,
      resources: { vcpus: 1 },
      networkPolicy: 'deny-all',
      persistent: false,
      env: {
        HOME: '/tmp',
        PLAYWRIGHT_BROWSERS_PATH: BROWSER_CACHE,
        CI: '1',
        NO_COLOR: '1',
      },
      tags: { surface: 'chrome-devtools-mcp-production-acceptance' },
    })

    await sandbox.updateNetworkPolicy('allow-all')
    const root = await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', '--', ROOT], timeoutMs: COMMAND_TIMEOUT_MS })
    if (root.exitCode !== 0) throw new Error('chrome_devtools_mcp_root_failed')

    const install = await sandbox.runCommand({
      cmd: 'npm',
      args: [
        'install',
        '--prefix',
        ROOT,
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        `${PACKAGE_NAME}@${PACKAGE_VERSION}`,
        BROWSER_RUNTIME_PACKAGE,
      ],
      timeoutMs: BOOTSTRAP_TIMEOUT_MS,
    })
    if (install.exitCode !== 0) throw new Error('chrome_devtools_mcp_package_install_failed')

    const version = await sandbox.runCommand({
      cmd: 'node',
      args: ['-e', `const p=require('${ROOT}/node_modules/${PACKAGE_NAME}/package.json');process.stdout.write(String(p.version||''))`],
      cwd: ROOT,
      timeoutMs: COMMAND_TIMEOUT_MS,
    })
    const actualVersion = (await version.stdout()).trim()
    checks.push(Object.freeze({
      name: 'exact_package_version',
      passed: version.exitCode === 0 && actualVersion === PACKAGE_VERSION,
      detail: `version=${bounded(actualVersion, 32)}`,
    }))
    if (version.exitCode !== 0 || actualVersion !== PACKAGE_VERSION) throw new Error('chrome_devtools_mcp_version_mismatch')

    const deps = await sandbox.runCommand({
      cmd: 'node',
      args: [`${ROOT}/node_modules/playwright-core/cli.js`, 'install-deps', 'chromium'],
      cwd: ROOT,
      timeoutMs: BOOTSTRAP_TIMEOUT_MS,
      sudo: true,
    })
    if (deps.exitCode !== 0) throw new Error('chrome_devtools_mcp_browser_deps_failed')

    const browserInstall = await sandbox.runCommand({
      cmd: 'node',
      args: [`${ROOT}/node_modules/playwright-core/cli.js`, 'install', 'chromium'],
      cwd: ROOT,
      timeoutMs: BOOTSTRAP_TIMEOUT_MS,
    })
    if (browserInstall.exitCode !== 0) throw new Error('chrome_devtools_mcp_browser_install_failed')

    const executableProbe = await sandbox.runCommand({
      cmd: 'node',
      args: [
        '-e',
        `const fs=require('node:fs');const {chromium}=require('${ROOT}/node_modules/playwright-core');const p=chromium.executablePath();if(!p||!fs.existsSync(p)){process.exit(2)}process.stdout.write(p)`,
      ],
      cwd: ROOT,
      timeoutMs: COMMAND_TIMEOUT_MS,
    })
    const browserExecutable = (await executableProbe.stdout()).trim()
    if (executableProbe.exitCode !== 0 || !browserExecutable) throw new Error('chrome_devtools_mcp_browser_probe_failed')

    const runtimeProbe = await sandbox.runCommand({
      cmd: browserExecutable,
      args: ['--version'],
      cwd: ROOT,
      timeoutMs: COMMAND_TIMEOUT_MS,
    })
    checks.push(Object.freeze({
      name: 'chromium_runtime_probe',
      passed: runtimeProbe.exitCode === 0,
      detail: `exit=${runtimeProbe.exitCode}`,
    }))
    if (runtimeProbe.exitCode !== 0) throw new Error('chrome_devtools_mcp_browser_runtime_failed')

    await sandbox.writeFiles([{
      path: SCRIPT_PATH,
      content: Buffer.from(chromeDevtoolsMcpAcceptanceRuntimeScript({
        runtimeRoot: ROOT,
        browserExecutable,
        probeUrl: PROBE_URL,
        approvedOrigins: APPROVED_ORIGINS,
      })),
    }])

    await sandbox.updateNetworkPolicy({ allow: [...allowedHosts()] })

    const live = await sandbox.runCommand({
      cmd: 'node',
      args: [SCRIPT_PATH],
      cwd: ROOT,
      timeoutMs: ACCEPTANCE_TIMEOUT_MS,
    })
    const liveStdout = await live.stdout()
    const parsed = parseChromeDevtoolsMcpAcceptance(liveStdout)
    checks.push(...parsed.checks)
    if (!parsed.ok || live.exitCode !== 0) {
      const stderr = bounded(await live.stderr(), 120)
      const detail = parsed.error === 'chrome_devtools_mcp_acceptance_marker_missing'
        ? `chrome_devtools_mcp_acceptance_marker_missing:exit=${live.exitCode};stderr=${stderr || 'empty'}`
        : parsed.error
      throw new Error(detail || 'chrome_devtools_mcp_live_checks_failed')
    }
  } catch (error) {
    checks.push(Object.freeze({
      name: 'runtime',
      passed: false,
      detail: bounded(error instanceof Error ? error.message : 'unknown_error'),
    }))
  } finally {
    if (!sandbox) {
      sandboxDestroyed = true
    } else {
      try {
        await sandbox.stop()
        sandboxDestroyed = true
      } catch {
        sandboxDestroyed = false
      }
    }
    checks.push(Object.freeze({
      name: 'sandbox_destroyed',
      passed: sandboxDestroyed,
      detail: `destroyed=${sandboxDestroyed}`,
    }))
  }

  const required = new Set([
    'pinned_profile',
    'provider_hub_projection',
    'host_origin_guard',
    'host_redirect_escape_guard',
    'exact_package_version',
    'chromium_runtime_probe',
    'mcp_initialize',
    'live_tool_discovery',
    'dangerous_tools_not_host_projected',
    'off_origin_host_rejected',
    'approved_itmounts_navigation',
    'structured_page_evidence',
    'accessibility_snapshot_live',
    'console_diagnostics_live',
    'network_diagnostics_live',
    'screenshot_live',
    'sandbox_destroyed',
  ])
  const ok = checks.every(check => check.passed) && [...required].every(name => checks.some(check => check.name === name && check.passed))

  return Object.freeze({
    ok,
    schemaVersion: 'chrome-devtools-mcp-production-acceptance-v1',
    packageName: PACKAGE_NAME,
    packageVersion: PACKAGE_VERSION,
    transport: 'stdio',
    checks: Object.freeze(checks),
    privacy: Object.freeze({
      pageContentStored: false,
      consoleBodiesStored: false,
      networkHeadersStored: false,
      screenshotsStored: false,
      credentialsStored: false,
      sandboxDestroyed,
    }),
  })
}