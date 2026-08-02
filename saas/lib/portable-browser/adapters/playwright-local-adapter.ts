// saas/lib/portable-browser/adapters/playwright-local-adapter.ts
import type {
  BrowserSessionFactory,
  BrowserSessionLaunchRequest,
  BrowserSessionPort,
} from '../browser-task-contracts.ts'
import { sanitizeBrowserRuntimeError } from '../browser-error-sanitizer.ts'

const PLAYWRIGHT_ADAPTER_ID = 'playwright'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

// A hostname a resolver could actually answer for. IPv6 in brackets, or DNS labels.
//
// THIS EXISTS BECAUSE THE ACCEPTANCE HARNESS CAUGHT IT. `new URL('https://*.example.com')`
// parses cleanly and its `.origin` round-trips, so a wildcard entry passed every check above
// and landed in the allowlist. Matching is exact, so it never widened access — it did the
// opposite and quietly matched NOTHING, which is worse in the way that matters: a buyer who
// writes a wildcard believes a whole domain is covered, and no request is ever approved
// against it. Refusing the entry tells them at configuration time instead.
const RESOLVABLE_HOST = /^(\[[0-9a-fA-F:.]+\]|[a-zA-Z0-9_](?:[a-zA-Z0-9_-]*[a-zA-Z0-9_])?(?:\.[a-zA-Z0-9_](?:[a-zA-Z0-9_-]*[a-zA-Z0-9_])?)*)$/
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

// ORIGIN POLICY. The buyer declares the origins this session may visit and NOTHING else is
// reachable. The allowlist must be non-empty, each entry must be an exact origin, and every
// origin on a launch request must already be in it. Plaintext http is confined to loopback.
// This adapter is meant to drive a buyer's real application, so the allowlist is the cage —
// not an artificial restriction to localhost.
function normalizeApprovedOrigin(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('playwright_invalid_origin')
  }
  // An exact origin only: no path, query, fragment, or embedded credentials.
  if (parsed.origin !== value || !/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('playwright_invalid_origin')
  }
  // Plaintext http is permitted ONLY for loopback, so a buyer can run locally without
  // weakening what a production origin has to be.
  if (!RESOLVABLE_HOST.test(parsed.hostname)) {
    throw new Error('playwright_invalid_origin')
  }
  if (parsed.protocol === 'http:' && !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error('playwright_insecure_origin_rejected')
  }
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
    const origin = normalizeApprovedOrigin(value)
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

    this.approvedOrigins = new Set(configuration.approvedOrigins.map(normalizeApprovedOrigin))
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
  // CORRECTED. This said 'sandbox_loopback_only', which stopped being true when the origin
  // posture changed to buyer-declared allowlists. A buyer reading the old value would have
  // concluded the adapter can only drive localhost — which would make the portable useless
  // to them — while the code has been accepting their production origins all along. Metadata
  // that outlives the behaviour it describes is the same defect as a hardcoded status field.
  executionBoundary: 'buyer_declared_origins' as const,
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
      && configuration.approvedOrigins.every(origin => typeof origin === 'string' && normalizeApprovedOrigin(origin) === origin)
      && (configuration.headless === undefined || typeof configuration.headless === 'boolean')
  } catch {
    return false
  }
}
