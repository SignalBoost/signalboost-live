import type {
  BrowserEngineBrowser,
  BrowserEngineContext,
  BrowserEngineContextOptions,
  BrowserEngineLaunchOptions,
  BrowserEngineLauncher,
  BrowserEnginePage,
} from './session-factory.ts'

// Structural Playwright contracts keep the portable runtime independent from a
// specific Playwright package version. Hosts may supply chromium from either
// `playwright` or `playwright-core` without coupling the runtime to that SDK.
export interface PlaywrightPageLike {
  url(): string
  goto(url: string, options?: { timeout?: number }): Promise<unknown>
  click(selector: string, options?: { timeout?: number }): Promise<unknown>
  fill(selector: string, value: string, options?: { timeout?: number }): Promise<unknown>
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>
  textContent?(selector: string): Promise<string | null>
}

export interface PlaywrightContextLike {
  newPage(): Promise<PlaywrightPageLike>
  close(): Promise<void>
}

export interface PlaywrightBrowserLike {
  newContext(options: {
    acceptDownloads: false
    ignoreHTTPSErrors: false
    javaScriptEnabled: true
    serviceWorkers: 'block'
    viewport: { width: number; height: number }
  }): Promise<PlaywrightContextLike>
  close(): Promise<void>
}

export interface PlaywrightChromiumLike {
  launch(options: {
    headless: boolean
    timeout: number
    executablePath?: string
    args: string[]
  }): Promise<PlaywrightBrowserLike>
}

function adaptPage(page: PlaywrightPageLike): BrowserEnginePage {
  return {
    url: () => page.url(),
    goto: async (url, options) => {
      await page.goto(url, { timeout: options?.timeoutMs })
    },
    click: async (selector, options) => {
      await page.click(selector, { timeout: options?.timeoutMs })
    },
    fill: async (selector, value, options) => {
      await page.fill(selector, value, { timeout: options?.timeoutMs })
    },
    waitForSelector: async (selector, options) => {
      await page.waitForSelector(selector, { timeout: options?.timeoutMs })
    },
    textContent: page.textContent ? selector => page.textContent?.(selector) ?? Promise.resolve(null) : undefined,
  }
}

function adaptContext(context: PlaywrightContextLike): BrowserEngineContext {
  return {
    newPage: async () => adaptPage(await context.newPage()),
    close: () => context.close(),
  }
}

function adaptBrowser(browser: PlaywrightBrowserLike): BrowserEngineBrowser {
  return {
    newContext: async (options: BrowserEngineContextOptions) => {
      const context = await browser.newContext({
        acceptDownloads: options.acceptDownloads,
        ignoreHTTPSErrors: options.ignoreHTTPSErrors,
        javaScriptEnabled: options.javaScriptEnabled,
        serviceWorkers: options.serviceWorkers,
        viewport: { ...options.viewport },
      })
      return adaptContext(context)
    },
    close: () => browser.close(),
  }
}

export class PlaywrightBrowserEngineLauncher implements BrowserEngineLauncher {
  private readonly chromium: PlaywrightChromiumLike

  constructor(chromium: PlaywrightChromiumLike) {
    if (!chromium || typeof chromium.launch !== 'function') {
      throw new Error('A Playwright chromium launcher is required')
    }
    this.chromium = chromium
  }

  async launch(options: BrowserEngineLaunchOptions): Promise<BrowserEngineBrowser> {
    const launchOptions: Parameters<PlaywrightChromiumLike['launch']>[0] = {
      headless: options.headless,
      timeout: options.timeoutMs,
      args: [...options.args],
    }

    if (options.executablePath) launchOptions.executablePath = options.executablePath

    return adaptBrowser(await this.chromium.launch(launchOptions))
  }
}

export function createPlaywrightBrowserEngineLauncher(
  chromium: PlaywrightChromiumLike,
): BrowserEngineLauncher {
  return new PlaywrightBrowserEngineLauncher(chromium)
}