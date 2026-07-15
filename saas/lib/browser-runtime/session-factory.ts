import type {
  BrowserPagePort,
  BrowserSessionFactory,
  BrowserSessionPort,
  BrowserTask,
} from './contracts'
import type { BrowserLaunchProfile, BrowserLaunchProfileProvider } from './launch-profile'

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

const DEFAULT_LAUNCH_TIMEOUT_MS = 30_000
const DEFAULT_ACTION_TIMEOUT_MS = 15_000
const DEFAULT_VIEWPORT = { width: 1440, height: 900 }

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
  })

  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

function createPagePort(page: BrowserEnginePage, actionTimeoutMs: number): BrowserPagePort {
  return {
    url: () => page.url(),
    goto: url => withTimeout(page.goto(url, { timeoutMs: actionTimeoutMs }), actionTimeoutMs, 'Browser navigation'),
    click: selector => withTimeout(page.click(selector, { timeoutMs: actionTimeoutMs }), actionTimeoutMs, 'Browser click'),
    fill: (selector, value) => withTimeout(page.fill(selector, value, { timeoutMs: actionTimeoutMs }), actionTimeoutMs, 'Browser fill'),
    waitForSelector: (selector, timeoutMs = actionTimeoutMs) =>
      withTimeout(page.waitForSelector(selector, { timeoutMs }), timeoutMs, 'Browser selector wait'),
  }
}

function mergeProfile(
  defaults: Required<Pick<BrowserSessionFactoryOptions, 'headless' | 'launchTimeoutMs' | 'actionTimeoutMs' | 'launchArgs' | 'viewport'>> &
    Pick<BrowserSessionFactoryOptions, 'executablePath'>,
  profile?: BrowserLaunchProfile,
) {
  return {
    headless: profile?.headless ?? defaults.headless,
    launchTimeoutMs: profile?.launchTimeoutMs ?? defaults.launchTimeoutMs,
    actionTimeoutMs: profile?.actionTimeoutMs ?? defaults.actionTimeoutMs,
    executablePath: profile?.executablePath ?? defaults.executablePath,
    launchArgs: [...(profile?.launchArgs ?? defaults.launchArgs)],
    viewport: { ...(profile?.viewport ?? defaults.viewport) },
  }
}

export class DefaultBrowserSessionFactory implements BrowserSessionFactory {
  private readonly launcher: BrowserEngineLauncher
  private readonly profileProvider?: BrowserLaunchProfileProvider
  private readonly defaults: Required<
    Pick<BrowserSessionFactoryOptions, 'headless' | 'launchTimeoutMs' | 'actionTimeoutMs' | 'launchArgs' | 'viewport'>
  > & Pick<BrowserSessionFactoryOptions, 'executablePath'>

  constructor(options: BrowserSessionFactoryOptions) {
    this.launcher = options.launcher
    this.profileProvider = options.profileProvider
    this.defaults = {
      headless: options.headless ?? true,
      launchTimeoutMs: options.launchTimeoutMs ?? DEFAULT_LAUNCH_TIMEOUT_MS,
      actionTimeoutMs: options.actionTimeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS,
      executablePath: options.executablePath,
      launchArgs: [...(options.launchArgs ?? [])],
      viewport: options.viewport ?? DEFAULT_VIEWPORT,
    }
  }

  async open(task: BrowserTask): Promise<BrowserSessionPort> {
    const profile = this.profileProvider?.resolve(task)
    const options = mergeProfile(this.defaults, profile)
    const browser = await withTimeout(
      this.launcher.launch({
        headless: options.headless,
        timeoutMs: options.launchTimeoutMs,
        executablePath: options.executablePath,
        args: [...options.launchArgs],
      }),
      options.launchTimeoutMs,
      'Browser launch',
    )

    let context: BrowserEngineContext | null = null
    let closed = false

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
      )

      const page = await withTimeout(
        context.newPage(),
        options.launchTimeoutMs,
        'Browser page creation',
      )

      return {
        page: createPagePort(page, options.actionTimeoutMs),
        close: async () => {
          if (closed) return
          closed = true
          await context?.close().catch(() => undefined)
          await browser.close().catch(() => undefined)
        },
      }
    } catch (error) {
      await context?.close().catch(() => undefined)
      await browser.close().catch(() => undefined)
      throw error
    }
  }
}
