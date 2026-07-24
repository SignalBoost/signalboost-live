import type {
  BrowserSessionFactory,
  BrowserSessionLaunchRequest,
  BrowserSessionPort,
} from '../../browser-runtime/contracts.ts'
import { sanitizeBrowserRuntimeError } from '../../browser-runtime/error-sanitizer.ts'

const PLAYWRIGHT_ADAPTER_ID = 'playwright'
const SANDBOX_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const SUPPORTED_ENGINES = new Set(['chromium', 'firefox', 'webkit'])

export type PlaywrightBrowserEngine = 'chromium' | 'firefox' | 'webkit'

export interface PlaywrightLocalLaunchOptions {
  readonly engine: PlaywrightBrowserEngine
  readonly headless: boolean
  readonly executablePath?: string
  readonly args?: readonly string[]
}

export interface PlaywrightLocalLauncherPort {
  launch(options: PlaywrightLocalLaunchOptions): Promise<BrowserSessionPort>
}

export interface PlaywrightLocalAdapterConfiguration {
  readonly approvedOrigins: readonly string[]
  readonly engine: PlaywrightBrowserEngine
  readonly headless?: boolean
  readonly executablePath?: string
  readonly args?: readonly string[]
  readonly launcher: PlaywrightLocalLauncherPort
}

export interface PlaywrightLocalAdapterFactory {
  create(configuration: PlaywrightLocalAdapterConfiguration): BrowserSessionFactory
}

function requireNonEmptyString(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(errorCode)
  return value
}

function normalizeSandboxOrigin(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('playwright_invalid_origin')
  }
  if (parsed.origin !== value || !/^https?:$/.test(parsed.protocol)) throw new Error('playwright_invalid_origin')
  if (!SANDBOX_HOSTS.has(parsed.hostname)) throw new Error('playwright_external_origin_rejected')
  return parsed.origin
}

function normalizeEngine(value: unknown): PlaywrightBrowserEngine {
  const engine = requireNonEmptyString(value, 'playwright_engine_required').toLowerCase()
  if (!SUPPORTED_ENGINES.has(engine)) throw new Error('playwright_engine_rejected')
  return engine as PlaywrightBrowserEngine
}

function normalizeExecutablePath(value: unknown): string | undefined {
  if (value === undefined) return undefined
  const executablePath = requireNonEmptyString(value, 'playwright_executable_path_invalid')
  if (executablePath.includes('\0')) throw new Error('playwright_executable_path_invalid')
  return executablePath
}

function normalizeArgs(value: unknown): readonly string[] {
  if (value === undefined) return Object.freeze([])
  if (!Array.isArray(value)) throw new Error('playwright_args_invalid')
  const args = value.map(argument => requireNonEmptyString(argument, 'playwright_args_invalid'))
  return Object.freeze(args)
}

function assertApprovedRequest(request: BrowserSessionLaunchRequest, approvedOrigins: ReadonlySet<string>): void {
  if (request.adapterId !== PLAYWRIGHT_ADAPTER_ID || request.provider.toLowerCase() !== PLAYWRIGHT_ADAPTER_ID) {
    throw new Error('playwright_launch_scope_rejected')
  }
  if (request.mode === 'execute_change') throw new Error('playwright_execute_change_rejected')
  if (request.allowedOrigins.length === 0) throw new Error('playwright_origin_required')
  for (const value of request.allowedOrigins) {
    const origin = normalizeSandboxOrigin(value)
    if (!approvedOrigins.has(origin)) throw new Error('playwright_origin_rejected')
  }
}

export class PlaywrightLocalSessionFactory implements BrowserSessionFactory {
  private readonly approvedOrigins: ReadonlySet<string>
  private readonly launchOptions: PlaywrightLocalLaunchOptions
  private readonly launcher: PlaywrightLocalLauncherPort

  constructor(configuration: PlaywrightLocalAdapterConfiguration) {
    if (!configuration || typeof configuration !== 'object') throw new Error('playwright_configuration_required')
    if (!Array.isArray(configuration.approvedOrigins)) throw new Error('playwright_origin_required')
    if (!configuration.launcher || typeof configuration.launcher.launch !== 'function') {
      throw new Error('playwright_launcher_required')
    }

    this.approvedOrigins = new Set(configuration.approvedOrigins.map(normalizeSandboxOrigin))
    if (this.approvedOrigins.size === 0) throw new Error('playwright_origin_required')

    this.launchOptions = Object.freeze({
      engine: normalizeEngine(configuration.engine),
      headless: configuration.headless !== false,
      executablePath: normalizeExecutablePath(configuration.executablePath),
      args: normalizeArgs(configuration.args),
    })
    this.launcher = configuration.launcher
  }

  async open(request: BrowserSessionLaunchRequest): Promise<BrowserSessionPort> {
    assertApprovedRequest(request, this.approvedOrigins)
    try {
      return await this.launcher.launch(this.launchOptions)
    } catch (error) {
      throw new Error(sanitizeBrowserRuntimeError(error))
    }
  }
}

export const playwrightLocalAdapterStatus = Object.freeze({
  status: 'available' as const,
  notImplemented: false,
  requiredPorts: Object.freeze(['playwright_local_launcher']),
  productionEnabled: false,
  executionBoundary: 'sandbox_loopback_only' as const,
})

export const playwrightLocalAdapterFactory: PlaywrightLocalAdapterFactory = Object.freeze({
  create: configuration => new PlaywrightLocalSessionFactory(configuration),
})

export function validatePlaywrightLocalAdapterConfiguration(value: unknown): value is PlaywrightLocalAdapterConfiguration {
  if (!value || typeof value !== 'object') return false
  const configuration = value as Partial<PlaywrightLocalAdapterConfiguration>
  if (!Array.isArray(configuration.approvedOrigins)
    || !configuration.launcher
    || typeof configuration.launcher.launch !== 'function') return false
  try {
    normalizeEngine(configuration.engine)
    normalizeExecutablePath(configuration.executablePath)
    normalizeArgs(configuration.args)
    return configuration.approvedOrigins.length > 0
      && configuration.approvedOrigins.every(origin => typeof origin === 'string' && normalizeSandboxOrigin(origin) === origin)
      && (configuration.headless === undefined || typeof configuration.headless === 'boolean')
  } catch {
    return false
  }
}
