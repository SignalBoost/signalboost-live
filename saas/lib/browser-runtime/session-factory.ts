import type {
  BrowserPagePort,
  BrowserSessionFactory,
  BrowserSessionPort,
  BrowserTask,
} from './contracts.ts'
import type { BrowserLaunchProfile, BrowserLaunchProfileProvider } from './launch-profile.ts'

export interface BrowserEnginePage {
  url(): string
  goto(url: string, options?: { timeoutMs?: number }): Promise<void>
  click(selector: string, options?: { timeoutMs?: number }): Promise<void>
  fill(selector: string, value: string, options?: { timeoutMs?: number }): Promise<void>
  waitForSelector(selector: string, options?: { timeoutMs?: number }): Promise<void>
}

export interface BrowserEngineContext {
  newPage(): Promise<BrowserEnginePage>
  close(): Promise<void>
}

export interface BrowserEngineBrowser {
  newContext(options: BrowserEngineContextOptions): Promise<BrowserEngineContext>
  close(): Promise<void>
}

export interface BrowserEngineLauncher {
  launch(options: BrowserEngineLaunchOptions): Promise<BrowserEngineBrowser>
}

export interface BrowserEngineLaunchOptions {
  headless: boolean
  timeoutMs: number
  executablePath?: string
  args: string[]
}

export interface BrowserEngineContextOptions {
  acceptDownloads: false
  ignoreHTTPSErrors: false
  javaScriptEnabled: true
  serviceWorkers: 'block'
  viewport: { width: number; height: number }
}

export interface BrowserSessionFactoryOptions {
  launcher: BrowserEngineLauncher
  profileProvider?: BrowserLaunchProfileProvider
  headless?: boolean
  launchTimeoutMs?: number
  actionTimeoutMs?: number
  executablePath?: string
  launchArgs?: string[]
  viewport?: { width: number; height: number }
}

interface ResolvedBrowserSessionOptions {
  headless: boolean
  launchTimeoutMs: number
  actionTimeoutMs: number
  executablePath?: string
  launchArgs: string[]
  viewport: { width: number; height: number }
}

const DEFAULT_LAUNCH_TIMEOUT_MS = 30_000
const DEFAULT_ACTION_TIMEOUT_MS = 15_000
const DEFAULT_VIEWPORT = { width: 1440, height: 900 }

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
}

function validateViewport(viewport: { width: number; height: number }): void {
  assertPositiveInteger(viewport.width, 'Browser viewport width')
  assertPositiveInteger(viewport.height, 'Browser viewport height')
}

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
  onLateResolve?: (value: T) => Promise<void> | void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  const timeoutError = new Error(`${label} timed out after ${timeoutMs}ms`)

  const guardedOperation = operation.then(async value => {
    if (!timedOut) return value

    try {
      await onLateResolve?.(value)
    } catch {
      // Timeout cleanup is best-effort and must not replace the deterministic timeout error.
    }

    throw timeoutError
  })

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      reject(timeoutError)
    }, timeoutMs)
  })

  return Promise.race([guardedOperation, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

function createPagePort(page: BrowserEnginePage, actionTimeoutMs: number): BrowserPagePort {
  return {
    url: () => page.url(),
    goto: url => withTimeout(page.goto(url, { timeoutMs: actionTimeoutMs }), actionTimeoutMs, 'Browser navigation'),
    click: selector => withTimeout(page.click(selector, { timeoutMs: actionTimeoutMs }), actionTimeoutMs, 'Browser click'),
    fill: (selector, value) =>
      withTimeout(page.fill(selector, value, { timeoutMs: actionTimeoutMs }), actionTimeoutMs, 'Browser fill'),
    waitForSelector: (selector, timeoutMs = actionTimeoutMs) => {
      assertPositiveInteger(timeoutMs, 'Browser selector timeout')
      return withTimeout(page.waitForSelector(selector, { timeoutMs }), timeoutMs, 'Browser selector wait')
    },
  }
}

function resolveOptions(
  defaults: ResolvedBrowserSessionOptions,
  profile?: BrowserLaunchProfile,
): ResolvedBrowserSessionOptions {
  const options: ResolvedBrowserSessionOptions = {
    headless: profile?.headless ?? defaults.headless,
    launchTimeoutMs: profile?.launchTimeoutMs ?? defaults.launchTimeoutMs,
    actionTimeoutMs: profile?.actionTimeoutMs ?? defaults.actionTimeoutMs,
    executablePath: profile?.executablePath ?? defaults.executablePath,
    launchArgs: [...(profile?.launchArgs ?? defaults.launchArgs)],
    viewport: { ...(profile?.viewport ?? defaults.viewport) },
  }

  assertPositiveInteger(options.launchTimeoutMs, 'Browser launch timeout')
  assertPositiveInteger(options.actionTimeoutMs, 'Browser action timeout')
  validateViewport(options.viewport)
  return options
}

export class DefaultBrowserSessionFactory implements BrowserSessionFactory {
  private readonly launcher: BrowserEngineLauncher
  private readonly profileProvider?: BrowserLaunchProfileProvider
  private readonly defaults: ResolvedBrowserSessionOptions

  constructor(options: BrowserSessionFactoryOptions) {
    if (!options?.launcher) throw new Error('A browser engine launcher is required')

    const viewport = { ...(options.viewport ?? DEFAULT_VIEWPORT) }
    const launchTimeoutMs = options.launchTimeoutMs ?? DEFAULT_LAUNCH_TIMEOUT_MS
    const actionTimeoutMs = options.actionTimeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS

    assertPositiveInteger(launchTimeoutMs, 'Browser launch timeout')
    assertPositiveInteger(actionTimeoutMs, 'Browser action timeout')
    validateViewport(viewport)

    this.launcher = options.launcher
    this.profileProvider = options.profileProvider
    this.defaults = {
      headless: options.headless ?? true,
      launchTimeoutMs,
      actionTimeoutMs,
      executablePath: options.executablePath,
      launchArgs: [...(options.launchArgs ?? [])],
      viewport,
    }
  }

  async open(task: BrowserTask): Promise<BrowserSessionPort> {
    const profile = this.profileProvider?.resolve(task)
    const options = resolveOptions(this.defaults, profile)
    const browser = await withTimeout(
      this.launcher.launch({
        headless: options.headless,
        timeoutMs: options.launchTimeoutMs,
        executablePath: options.executablePath,
        args: [...options.launchArgs],
      }),
      options.launchTimeoutMs,
      'Browser launch',
      lateBrowser => lateBrowser.close(),
    )

    let context: BrowserEngineContext | null = null
    let cleanupPromise: Promise<void> | null = null

    const cleanup = (): Promise<void> => {
      if (!cleanupPromise) {
        cleanupPromise = (async () => {
          const currentContext = context
          context = null
          await currentContext?.close().catch(() => undefined)
          await browser.close().catch(() => undefined)
        })()
      }
      return cleanupPromise
    }

    try {
      context = await withTimeout(
        browser.newContext({
          acceptDownloads: false,
          ignoreHTTPSErrors: false,
          javaScriptEnabled: true,
          serviceWorkers: 'block',
          viewport: { ...options.viewport },
        }),
        options.launchTimeoutMs,
        'Browser context creation',
        lateContext => lateContext.close(),
      )

      const page = await withTimeout(
        context.newPage(),
        options.launchTimeoutMs,
        'Browser page creation',
        cleanup,
      )

      return {
        page: createPagePort(page, options.actionTimeoutMs),
        close: cleanup,
      }
    } catch (error) {
      await cleanup()
      throw error
    }
  }
}
