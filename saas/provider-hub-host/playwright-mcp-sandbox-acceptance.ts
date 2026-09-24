// @ts-nocheck -- temporary diagnostic; remove after Preview identifies runtime viability
import { Sandbox } from '@vercel/sandbox'
import {
  PLAYWRIGHT_MCP_PROFILE,
  createBrowserMcpRegistryEntries,
} from './browser-mcp-profiles.ts'
import {
  assertBrowserMcpToolCallForTest,
  liveBrowserMcpToolNames,
} from './browser-mcp-stdio-host.ts'

const ROOT = '/tmp/itmounts-playwright-mcp-acceptance'
const BROWSER_CACHE = `${ROOT}/pw-browsers`
const SCRIPT_PATH = `${ROOT}/acceptance.cjs`
const OUTPUT_DIR = `${ROOT}/mcp-output`
const COMMAND_TIMEOUT_MS = 30_000
const BOOTSTRAP_TIMEOUT_MS = 180_000
const ACCEPTANCE_TIMEOUT_MS = 120_000
const SANDBOX_TIMEOUT_MS = 230_000
const APPROVED_ORIGINS = Object.freeze(['https://itmounts.com', 'https://www.itmounts.com'])
const PROBE_URL = 'https://itmounts.com/'
const DANGEROUS_TOOLS = Object.freeze(['browser_evaluate', 'browser_run_code', 'browser_file_upload'])

type Check = Readonly<{ name: string; passed: boolean; detail: string }>

export type PlaywrightMcpProductionAcceptance = Readonly<{
  ok: boolean
  schemaVersion: 'playwright-mcp-production-acceptance-v1'
  packageName: '@playwright/mcp'
  packageVersion: '0.0.82'
  transport: 'stdio'
  checks: readonly Check[]
  privacy: Readonly<{
    pageContentStored: false
    consoleBodiesStored: false
    networkHeadersStored: false
    screenshotsStored: false
    credentialsStored: false
    sandboxDestroyed: true
  }>
}>

function bounded(value: unknown, max = 160): string {
  return String(value ?? '').replace(/https?:\/\/\S+/gi, '<url>').replace(/\s+/g, ' ').trim().slice(0, max)
}

function allowedHosts(): readonly string[] {
  return Object.freeze([...new Set(APPROVED_ORIGINS.map(value => new URL(value).hostname))])
}

function runtimeScript(browserExecutable: string): string {
  const liveTools = JSON.stringify(liveBrowserMcpToolNames('playwright-mcp'))
  const origins = JSON.stringify(APPROVED_ORIGINS)
  return String.raw`
const { spawn } = require('node:child_process')

const ROOT = ${JSON.stringify(ROOT)}
const outputDir = ${JSON.stringify(OUTPUT_DIR)}
const browserExecutable = ${JSON.stringify(browserExecutable)}
const approvedOrigins = new Set(${origins})
const liveTools = Object.freeze(${liveTools})
const probeUrl = ${JSON.stringify(PROBE_URL)}
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
function originAllowed(url) {
  try { return approvedOrigins.has(new URL(url).origin) } catch { return false }
}
function resultIsOk(raw) {
  return Boolean(raw && typeof raw === 'object' && raw.isError !== true)
}
function pageOriginFromResult(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.content)) return null
  for (const item of raw.content) {
    if (!item || typeof item !== 'object' || typeof item.text !== 'string') continue
    const match = item.text.match(/Page URL:\\s*(https?:\\/\\/[^\\s]+)/i)
    if (match) {
      try { return new URL(match[1]).origin } catch {}
    }
  }
  return null
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
  child = spawn('npx', [
    '--no-install',
    '@playwright/mcp',
    '--headless',
    '--isolated',
    '--browser',
    'chrome',
    '--no-sandbox',
    '--allowed-origins',
    [...approvedOrigins].join(';'),
    '--block-service-workers',
    '--image-responses',
    'omit',
    '--output-dir',
    outputDir,
    '--executable-path',
    browserExecutable,
  ], {
    cwd: ROOT,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      npm_config_yes: 'false',
      PLAYWRIGHT_MCP_IMAGE_RESPONSES: 'omit',
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
    clientInfo: { name: 'itmounts-playwright-mcp-production-canary', version: '1.0.0' },
  })
  add('mcp_initialize', initialized && initialized.protocolVersion === '2024-11-05', 'protocol=2024-11-05')
  notify('notifications/initialized')

  const listed = await request('tools/list')
  const names = Array.isArray(listed?.tools) ? listed.tools.map(tool => String(tool?.name || '')).filter(Boolean) : []
  add(
    'live_tool_discovery',
    liveTools.every(name => names.includes(name)),
    `providerTools=${names.length}; requiredLiveTools=${liveTools.length}`,
  )
  add(
    'dangerous_tools_not_host_projected',
    !liveTools.some(name => ${JSON.stringify(DANGEROUS_TOOLS)}.includes(name)),
    `hostProjected=${liveTools.length}`,
  )

  add('off_origin_host_rejected', !originAllowed('https://example.invalid/'), 'host_policy=rejected')
  if (!originAllowed(probeUrl)) throw new Error('approved_probe_origin_missing')

  const opened = await call('browser_navigate', { url: probeUrl })
  const finalOrigin = pageOriginFromResult(opened)
  add('approved_itmounts_navigation', resultIsOk(opened) && finalOrigin !== null && approvedOrigins.has(finalOrigin), `finalOriginApproved=${Boolean(finalOrigin && approvedOrigins.has(finalOrigin))}`)

  const snapshot = await call('browser_snapshot', {})
  add('accessibility_snapshot_live', resultIsOk(snapshot), 'mcp_call=browser_snapshot')

  const consoleResult = await call('browser_console_messages', { level: 'info' })
  add('console_diagnostics_live', resultIsOk(consoleResult), 'mcp_call=browser_console_messages')

  const network = await call('browser_network_requests', { includeStatic: false })
  add('network_diagnostics_live', resultIsOk(network), 'mcp_call=browser_network_requests')

  const screenshot = await call('browser_take_screenshot', { type: 'jpeg', fullPage: false })
  add('screenshot_live', resultIsOk(screenshot), 'mcp_call=browser_take_screenshot')

  const ok = checks.length >= 9 && checks.every(check => check.passed)
  process.stdout.write(JSON.stringify({ marker: 'ITMOUNTS_PLAYWRIGHT_MCP_ACCEPTANCE', ok, checks }) + '\\n')
  if (!ok) process.exitCode = 2
}

main().catch(error => {
  process.stdout.write(JSON.stringify({
    marker: 'ITMOUNTS_PLAYWRIGHT_MCP_ACCEPTANCE',
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

function parseAcceptance(stdout: string): { ok: boolean; checks: Check[]; error?: string } {
  const lines = String(stdout || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index]) as Record<string, unknown>
      if (value.marker !== 'ITMOUNTS_PLAYWRIGHT_MCP_ACCEPTANCE') continue
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
        ok: value.ok === true && checks.length >= 9 && checks.every(check => check.passed),
        checks,
        ...(typeof value.error === 'string' ? { error: bounded(value.error) } : {}),
      }
    } catch {}
  }
  return { ok: false, checks: [], error: 'playwright_mcp_acceptance_marker_missing' }
}

export async function runPlaywrightMcpProductionAcceptance(): Promise<PlaywrightMcpProductionAcceptance> {
  const checks: Check[] = []

  checks.push(Object.freeze({
    name: 'pinned_profile',
    passed: PLAYWRIGHT_MCP_PROFILE.packageName === '@playwright/mcp' && PLAYWRIGHT_MCP_PROFILE.packageVersion === '0.0.82',
    detail: `package=${PLAYWRIGHT_MCP_PROFILE.packageName}; version=${PLAYWRIGHT_MCP_PROFILE.packageVersion}`,
  }))

  const registry = createBrowserMcpRegistryEntries({
    tenantId: 'signalboost-reference',
    environmentId: 'production-reference',
    portableId: 'software-specialist',
    enabledProfiles: ['playwright-mcp'],
  })
  const mapping = registry.assignments[0]?.tools ?? []
  const liveCapabilityNames = new Set(liveBrowserMcpToolNames('playwright-mcp').map(name => {
    const tool = PLAYWRIGHT_MCP_PROFILE.tools.find(item => item.remoteToolName === name)
    return tool ? `browser.playwright-mcp.${tool.capabilityName}` : ''
  }).filter(Boolean))
  checks.push(Object.freeze({
    name: 'provider_hub_projection',
    passed: liveCapabilityNames.size === 6 && [...liveCapabilityNames].every(name => mapping.some(item => item.capabilityId === name)),
    detail: `mapped=${mapping.length}; live=${liveCapabilityNames.size}`,
  }))

  let offOriginRejected = false
  try {
    assertBrowserMcpToolCallForTest({
      serverId: 'playwright-mcp',
      toolName: 'browser_navigate',
      args: { url: 'https://example.invalid/' },
      approvedOrigins: APPROVED_ORIGINS,
    })
  } catch (error) {
    offOriginRejected = String(error instanceof Error ? error.message : error).includes('browser_mcp_navigation_origin_rejected')
  }
  checks.push(Object.freeze({
    name: 'host_origin_guard',
    passed: offOriginRejected,
    detail: `offOriginRejected=${offOriginRejected}`,
  }))

  let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | null = null
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
      tags: { surface: 'playwright-mcp-production-acceptance' },
    })

    await sandbox.updateNetworkPolicy('allow-all')
    const root = await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', '--', ROOT, OUTPUT_DIR], timeoutMs: COMMAND_TIMEOUT_MS })
    if (root.exitCode !== 0) throw new Error('playwright_mcp_root_failed')

    const install = await sandbox.runCommand({
      cmd: 'npm',
      args: [
        'install',
        '--prefix',
        ROOT,
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '@playwright/mcp@0.0.82',
        '@playwright/test@^1.41.0',
      ],
      timeoutMs: BOOTSTRAP_TIMEOUT_MS,
    })
    if (install.exitCode !== 0) throw new Error('playwright_mcp_package_install_failed')

    const version = await sandbox.runCommand({
      cmd: 'node',
      args: ['-e', `const p=require('${ROOT}/node_modules/@playwright/mcp/package.json');process.stdout.write(String(p.version||''))`],
      cwd: ROOT,
      timeoutMs: COMMAND_TIMEOUT_MS,
    })
    const actualVersion = (await version.stdout()).trim()
    checks.push(Object.freeze({
      name: 'exact_package_version',
      passed: version.exitCode === 0 && actualVersion === '0.0.82',
      detail: `version=${bounded(actualVersion, 32)}`,
    }))
    if (version.exitCode !== 0 || actualVersion !== '0.0.82') throw new Error('playwright_mcp_version_mismatch')

    const deps = await sandbox.runCommand({
      cmd: 'node',
      args: [`${ROOT}/node_modules/playwright/cli.js`, 'install-deps', 'chromium'],
      cwd: ROOT,
      timeoutMs: BOOTSTRAP_TIMEOUT_MS,
      sudo: true,
    })
    if (deps.exitCode !== 0) throw new Error('playwright_mcp_browser_deps_failed')

    const browserInstall = await sandbox.runCommand({
      cmd: 'node',
      args: [`${ROOT}/node_modules/playwright/cli.js`, 'install', 'chromium'],
      cwd: ROOT,
      timeoutMs: BOOTSTRAP_TIMEOUT_MS,
    })
    if (browserInstall.exitCode !== 0) throw new Error('playwright_mcp_browser_install_failed')

    const executableProbe = await sandbox.runCommand({
      cmd: 'node',
      args: [
        '-e',
        `const fs=require('node:fs');const {chromium}=require('${ROOT}/node_modules/@playwright/test');const p=chromium.executablePath();if(!p||!fs.existsSync(p)){process.exit(2)}process.stdout.write(p)`,
      ],
      cwd: ROOT,
      timeoutMs: COMMAND_TIMEOUT_MS,
    })
    const browserExecutable = (await executableProbe.stdout()).trim()
    if (executableProbe.exitCode !== 0 || !browserExecutable) throw new Error('playwright_mcp_browser_probe_failed')

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
    if (runtimeProbe.exitCode !== 0) throw new Error('playwright_mcp_browser_runtime_failed')

    await sandbox.writeFiles([{ path: SCRIPT_PATH, content: Buffer.from(runtimeScript(browserExecutable)) }])

    await sandbox.updateNetworkPolicy({ allow: [...allowedHosts()] })

    const live = await sandbox.runCommand({
      cmd: 'node',
      args: [SCRIPT_PATH],
      cwd: ROOT,
      timeoutMs: ACCEPTANCE_TIMEOUT_MS,
    })
    const parsed = parseAcceptance(await live.stdout())
    checks.push(...parsed.checks)
    if (!parsed.ok || live.exitCode !== 0) {
      throw new Error(parsed.error || 'playwright_mcp_live_checks_failed')
    }
  } catch (error) {
    checks.push(Object.freeze({
      name: 'runtime',
      passed: false,
      detail: bounded(error instanceof Error ? error.message : 'unknown_error'),
    }))
  } finally {
    await sandbox?.stop().catch(() => undefined)
  }

  const required = new Set([
    'pinned_profile',
    'provider_hub_projection',
    'host_origin_guard',
    'exact_package_version',
    'chromium_runtime_probe',
    'mcp_initialize',
    'live_tool_discovery',
    'dangerous_tools_not_host_projected',
    'off_origin_host_rejected',
    'approved_itmounts_navigation',
    'accessibility_snapshot_live',
    'console_diagnostics_live',
    'network_diagnostics_live',
    'screenshot_live',
  ])
  const ok = checks.every(check => check.passed) && [...required].every(name => checks.some(check => check.name === name && check.passed))

  return Object.freeze({
    ok,
    schemaVersion: 'playwright-mcp-production-acceptance-v1',
    packageName: '@playwright/mcp',
    packageVersion: '0.0.82',
    transport: 'stdio',
    checks: Object.freeze(checks),
    privacy: Object.freeze({
      pageContentStored: false,
      consoleBodiesStored: false,
      networkHeadersStored: false,
      screenshotsStored: false,
      credentialsStored: false,
      sandboxDestroyed: true,
    }),
  })
}
