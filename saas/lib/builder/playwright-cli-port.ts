import { Sandbox } from '@vercel/sandbox'
import type {
  BuilderBrowserCliAction,
  BuilderBrowserCliCapability,
  BuilderBrowserCliFailureCode,
  BuilderBrowserCliPort,
} from './contracts.ts'

export const BUILDER_PLAYWRIGHT_CLI_VERSION = '0.1.21' as const

const ROOT = '/tmp/cos-builder-playwright-cli'
const BROWSER_CACHE = `${ROOT}/pw-browsers`
const CLI_CONFIG = `${ROOT}/.playwright/cli.config.json`
const COMMAND_TIMEOUT_MS = 25_000
const BOOTSTRAP_TIMEOUT_MS = 180_000
const SANDBOX_TIMEOUT_MS = 220_000
const OUTPUT_LIMIT = 16_000
const DEFAULT_ORIGINS = Object.freeze(['https://itmounts.com', 'https://www.itmounts.com'])
const ACTIONS: readonly BuilderBrowserCliAction[] = Object.freeze([
  'open',
  'goto',
  'snapshot',
  'find',
  'console',
  'requests',
  'close',
])

type Environment = Readonly<Record<string, string | undefined>>
type SandboxInstance = Awaited<ReturnType<typeof Sandbox.create>>

function bounded(value: unknown): string {
  return String(value ?? '').slice(0, OUTPUT_LIMIT)
}

export function classifyBuilderPlaywrightCliFailure(value: unknown): BuilderBrowserCliFailureCode {
  const message = String(value ?? '').toLowerCase()
  if (/builder_browser_cli_browser_deps_failed|host system is missing dependencies|missing libraries|error while loading shared libraries|lib[a-z0-9_.+-]+\.so/.test(message)) {
    return 'browser_missing_dependencies'
  }
  if (/builder_browser_cli_browser_(?:install|probe)_failed|executable doesn.?t exist|browser.+not installed|could not find.+(?:chrom|browser)|please run.+install/.test(message)) {
    return 'browser_not_installed'
  }
  if (/failed to launch|browsertype\.launch|browser process|target page, context or browser has been closed/.test(message)) {
    return 'browser_launch_failed'
  }
  if (/net::err_|navigation failed|page\.goto/.test(message)) return 'navigation_failed'
  if (/origin.+(?:not allowed|rejected|blocked)|network.+(?:denied|blocked)|econnrefused|enotfound/.test(message)) {
    return 'network_policy_failed'
  }
  if (/unknown (?:command|option)|unexpected argument|config.+(?:invalid|parse|json)|json.+(?:parse|invalid)/.test(message)) {
    return 'config_invalid'
  }
  return 'cli_exit_nonzero'
}

function configuredOrigins(env: Environment): readonly string[] {
  const raw = String(env.BUILDER_PLAYWRIGHT_CLI_ALLOWED_ORIGINS || '').trim()
  const candidates = raw ? raw.split(',') : DEFAULT_ORIGINS
  const normalized = [...new Set(candidates.map(value => value.trim()).filter(Boolean).map(value => {
    const url = new URL(value)
    if (url.protocol !== 'https:') throw new Error('builder_browser_cli_https_origin_required')
    return url.origin
  }))]
  if (!normalized.length) throw new Error('builder_browser_cli_origin_required')
  return Object.freeze(normalized)
}

function allowedHosts(origins: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(origins.map(value => new URL(value).hostname))])
}

function exactAllowedUrl(value: unknown, origins: readonly string[]): string {
  const raw = String(value ?? '').trim()
  if (!raw || raw.length > 2_000) throw new Error('builder_browser_cli_invalid_url')
  const url = new URL(raw)
  if (url.protocol !== 'https:' || !origins.includes(url.origin)) throw new Error('builder_browser_cli_origin_rejected')
  url.username = ''
  url.password = ''
  return url.toString()
}

function shortText(value: unknown, max: number, code: string): string {
  const text = String(value ?? '').trim()
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) throw new Error(code)
  return text
}

function commandArgs(
  input: { action: BuilderBrowserCliAction; url?: string; query?: string; target?: string; level?: 'error' | 'warning' | 'info' | 'debug' },
  origins: readonly string[],
): readonly string[] {
  switch (input.action) {
    case 'open':
      return ['open', exactAllowedUrl(input.url, origins)]
    case 'goto':
      return ['goto', exactAllowedUrl(input.url, origins)]
    case 'snapshot':
      return input.target ? ['snapshot', shortText(input.target, 120, 'builder_browser_cli_invalid_target')] : ['snapshot']
    case 'find':
      return ['find', shortText(input.query, 500, 'builder_browser_cli_invalid_query')]
    case 'console': {
      const level = input.level || 'error'
      if (!['error', 'warning', 'info', 'debug'].includes(level)) throw new Error('builder_browser_cli_invalid_console_level')
      return ['console', level]
    }
    case 'requests':
      return input.query ? ['requests', `--filter=${shortText(input.query, 240, 'builder_browser_cli_invalid_filter')}`] : ['requests']
    case 'close':
      return ['close']
    default:
      throw new Error('builder_browser_cli_action_rejected')
  }
}

export class VercelSandboxPlaywrightCliPort implements BuilderBrowserCliPort {
  private sandbox: SandboxInstance | null = null
  private readonly createSandbox: typeof Sandbox.create
  private readonly origins: readonly string[]
  private readonly enabled: boolean

  constructor(options: {
    ownerAuthorized: boolean
    env?: Environment
    createSandbox?: typeof Sandbox.create
  }) {
    this.enabled = options.ownerAuthorized === true
    this.origins = configuredOrigins(options.env ?? process.env)
    this.createSandbox = options.createSandbox ?? Sandbox.create
  }

  async capabilities(): Promise<BuilderBrowserCliCapability | null> {
    if (!this.enabled) return null
    return Object.freeze({ actions: ACTIONS, allowedOrigins: this.origins })
  }

  private async ready(): Promise<SandboxInstance> {
    if (!this.enabled) throw new Error('builder_browser_cli_not_authorized')
    if (this.sandbox) return this.sandbox

    const sandbox = await this.createSandbox({
      runtime: 'node24',
      timeout: SANDBOX_TIMEOUT_MS,
      resources: { vcpus: 1 },
      networkPolicy: 'deny-all',
      persistent: false,
      env: {
        HOME: '/tmp',
        PLAYWRIGHT_CLI_SESSION: 'cos-builder',
        PLAYWRIGHT_MCP_WEBMCP: 'false',
        PLAYWRIGHT_MCP_ALLOWED_ORIGINS: this.origins.join(';'),
        PLAYWRIGHT_MCP_ISOLATED: 'true',
        PLAYWRIGHT_MCP_HEADLESS: 'true',
        PLAYWRIGHT_BROWSERS_PATH: BROWSER_CACHE,
      },
      tags: { surface: 'cos-builder-playwright-cli' },
    })
    try {
      await sandbox.updateNetworkPolicy('allow-all')
      const prepared = await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', '--', ROOT], timeoutMs: COMMAND_TIMEOUT_MS })
      if (prepared.exitCode !== 0) throw new Error('builder_browser_cli_root_failed')

      const install = await sandbox.runCommand({
        cmd: 'npm',
        args: ['install', '--prefix', ROOT, '--ignore-scripts', '--no-audit', '--no-fund', `@playwright/cli@${BUILDER_PLAYWRIGHT_CLI_VERSION}`],
        timeoutMs: BOOTSTRAP_TIMEOUT_MS,
      })
      if (install.exitCode !== 0) throw new Error(`builder_browser_cli_install_failed:${bounded(await install.stderr())}`)

      const browserDeps = await sandbox.runCommand({
        cmd: 'dnf',
        // Vercel Sandbox uses an Amazon-Linux/RPM-family image. Playwright's install-deps
        // path is apt-based on unsupported distros, so install the bounded Chromium runtime
        // libraries explicitly through the SDK-owned sudo boundary.
        args: [
          'install', '-y',
          'libXcomposite', 'libXdamage', 'libXrandr', 'libxkbcommon',
          'pango', 'alsa-lib', 'atk', 'at-spi2-atk', 'cups-libs',
          'libdrm', 'mesa-libgbm',
        ],
        timeoutMs: BOOTSTRAP_TIMEOUT_MS,
        sudo: true,
      })
      if (browserDeps.exitCode !== 0) {
        throw new Error(`builder_browser_cli_browser_deps_failed:${bounded(await browserDeps.stderr())}`)
      }

      const browser = await sandbox.runCommand({
        cmd: 'node',
        // Install the exact Chromium revision belonging to the Playwright build bundled by
        // @playwright/cli. This remains unprivileged and lands in the host-owned browser cache.
        args: [`${ROOT}/node_modules/playwright/cli.js`, 'install', 'chromium'],
        cwd: ROOT,
        timeoutMs: BOOTSTRAP_TIMEOUT_MS,
      })
      if (browser.exitCode !== 0) throw new Error(`builder_browser_cli_browser_install_failed:${bounded(await browser.stderr())}`)

      const executableProbe = await sandbox.runCommand({
        cmd: 'node',
        args: [
          '-e',
          `const fs=require('node:fs');const {chromium}=require('${ROOT}/node_modules/playwright');const p=chromium.executablePath();if(!p||!fs.existsSync(p)){process.stderr.write('browser executable missing');process.exit(2)}process.stdout.write(p)`,
        ],
        cwd: ROOT,
        timeoutMs: COMMAND_TIMEOUT_MS,
      })
      if (executableProbe.exitCode !== 0) {
        throw new Error(`builder_browser_cli_browser_probe_failed:${bounded(await executableProbe.stderr())}`)
      }
      const browserExecutable = (await executableProbe.stdout()).trim()
      if (!browserExecutable) throw new Error('builder_browser_cli_browser_probe_failed:empty')

      const runtimeProbe = await sandbox.runCommand({
        cmd: browserExecutable,
        args: ['--version'],
        cwd: ROOT,
        timeoutMs: COMMAND_TIMEOUT_MS,
      })
      if (runtimeProbe.exitCode !== 0) {
        throw new Error(`builder_browser_cli_browser_deps_failed:${bounded(await runtimeProbe.stderr())}`)
      }

      const config = JSON.stringify({
        browser: {
          browserName: 'chromium',
          isolated: true,
          launchOptions: {
            headless: true,
            chromiumSandbox: false,
            executablePath: browserExecutable,
          },
        },
        network: { allowedOrigins: this.origins },
        outputDir: `${ROOT}/artifacts`,
        console: { level: 'info' },
        timeouts: { action: 5000, navigation: 30000 },
      })
      await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', '--', `${ROOT}/.playwright`], timeoutMs: COMMAND_TIMEOUT_MS })
      await sandbox.writeFiles([{ path: CLI_CONFIG, content: Buffer.from(config) }])

      // No model-supplied browser action runs until bootstrap has fully succeeded and the
      // network is reduced to the exact approved hosts.
      await sandbox.updateNetworkPolicy({ allow: [...allowedHosts(this.origins)] })
      this.sandbox = sandbox
      return sandbox
    } catch (error) {
      // Never retain a half-initialized Sandbox. A later Builder round must start clean.
      this.sandbox = null
      await sandbox.stop().catch(() => undefined)
      throw error
    }
  }

  async invoke(input: {
    action: BuilderBrowserCliAction
    url?: string
    query?: string
    target?: string
    level?: 'error' | 'warning' | 'info' | 'debug'
  }) {
    if (!ACTIONS.includes(input.action)) throw new Error('builder_browser_cli_action_rejected')
    const args = commandArgs(input, this.origins)
    try {
      const sandbox = await this.ready()
      const result = await sandbox.runCommand({
        cmd: `${ROOT}/node_modules/.bin/playwright-cli`,
        args: ['--config', CLI_CONFIG, ...args],
        cwd: ROOT,
        timeoutMs: COMMAND_TIMEOUT_MS,
      })
      const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()])
      const failureCode = result.exitCode === 0
        ? undefined
        : classifyBuilderPlaywrightCliFailure(`${stderr}\n${stdout}`)
      const observed = {
        ok: result.exitCode === 0,
        action: input.action,
        exitCode: result.exitCode,
        stdout: bounded(stdout),
        stderr: bounded(stderr),
        timedOut: false,
        ...(failureCode ? { failureCode } : {}),
      } as const
      console.info('[builder_browser_cli_action]', {
        action: observed.action,
        ok: observed.ok,
        exitCode: observed.exitCode,
        timedOut: observed.timedOut,
        ...(failureCode ? { failureCode } : {}),
      })
      return Object.freeze(observed)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'builder_browser_cli_execution_failed'
      const timedOut = /timeout|timed out|SIGKILL/i.test(message)
      const classified = classifyBuilderPlaywrightCliFailure(message)
      const failureCode: BuilderBrowserCliFailureCode = timedOut
        ? 'sandbox_execution_failed'
        : classified === 'cli_exit_nonzero' ? 'sandbox_execution_failed' : classified
      const observed = {
        ok: false,
        action: input.action,
        exitCode: 124,
        stdout: '',
        stderr: bounded(message),
        timedOut,
        failureCode,
      } as const
      console.info('[builder_browser_cli_action]', {
        action: observed.action,
        ok: observed.ok,
        exitCode: observed.exitCode,
        timedOut: observed.timedOut,
        failureCode: observed.failureCode,
      })
      return Object.freeze(observed)
    }
  }

  async close(): Promise<void> {
    const sandbox = this.sandbox
    this.sandbox = null
    if (!sandbox) return
    await sandbox.stop().catch(() => undefined)
  }
}

export function createBuilderPlaywrightCliPort(options: {
  ownerAuthorized: boolean
  env?: Environment
  createSandbox?: typeof Sandbox.create
}): BuilderBrowserCliPort {
  return new VercelSandboxPlaywrightCliPort(options)
}
