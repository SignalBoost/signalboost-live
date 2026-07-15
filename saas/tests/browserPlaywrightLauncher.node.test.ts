import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PlaywrightBrowserEngineLauncher,
  type PlaywrightBrowserLike,
  type PlaywrightChromiumLike,
  type PlaywrightContextLike,
  type PlaywrightPageLike,
} from '../lib/browser-runtime/playwright-launcher'

function fixture() {
  const calls: Array<{ name: string; args?: unknown }> = []
  let currentUrl = 'about:blank'

  const page: PlaywrightPageLike = {
    url: () => currentUrl,
    goto: async (url, options) => {
      calls.push({ name: 'page.goto', args: { url, options } })
      currentUrl = url
    },
    click: async (selector, options) => {
      calls.push({ name: 'page.click', args: { selector, options } })
    },
    fill: async (selector, value, options) => {
      calls.push({ name: 'page.fill', args: { selector, value, options } })
    },
    waitForSelector: async (selector, options) => {
      calls.push({ name: 'page.waitForSelector', args: { selector, options } })
    },
  }

  const context: PlaywrightContextLike = {
    newPage: async () => {
      calls.push({ name: 'context.newPage' })
      return page
    },
    close: async () => {
      calls.push({ name: 'context.close' })
    },
  }

  const browser: PlaywrightBrowserLike = {
    newContext: async options => {
      calls.push({ name: 'browser.newContext', args: options })
      return context
    },
    close: async () => {
      calls.push({ name: 'browser.close' })
    },
  }

  const chromium: PlaywrightChromiumLike = {
    launch: async options => {
      calls.push({ name: 'chromium.launch', args: options })
      return browser
    },
  }

  return { calls, chromium }
}

test('maps portable launch, context, and page operations to Playwright', async () => {
  const { calls, chromium } = fixture()
  const launcher = new PlaywrightBrowserEngineLauncher(chromium)
  const browser = await launcher.launch({
    headless: true,
    timeoutMs: 20_000,
    executablePath: '/opt/chromium',
    args: ['--no-first-run'],
  })

  const context = await browser.newContext({
    acceptDownloads: false,
    ignoreHTTPSErrors: false,
    javaScriptEnabled: true,
    serviceWorkers: 'block',
    viewport: { width: 1280, height: 720 },
  })
  const page = await context.newPage()

  await page.goto('https://sandbox.example', { timeoutMs: 11_000 })
  await page.click('#settings', { timeoutMs: 12_000 })
  await page.fill('#name', 'SignalBoost', { timeoutMs: 13_000 })
  await page.waitForSelector('#saved', { timeoutMs: 14_000 })
  await context.close()
  await browser.close()

  assert.deepEqual(calls, [
    {
      name: 'chromium.launch',
      args: {
        headless: true,
        timeout: 20_000,
        executablePath: '/opt/chromium',
        args: ['--no-first-run'],
      },
    },
    {
      name: 'browser.newContext',
      args: {
        acceptDownloads: false,
        ignoreHTTPSErrors: false,
        javaScriptEnabled: true,
        serviceWorkers: 'block',
        viewport: { width: 1280, height: 720 },
      },
    },
    { name: 'context.newPage' },
    {
      name: 'page.goto',
      args: { url: 'https://sandbox.example', options: { timeout: 11_000 } },
    },
    {
      name: 'page.click',
      args: { selector: '#settings', options: { timeout: 12_000 } },
    },
    {
      name: 'page.fill',
      args: { selector: '#name', value: 'SignalBoost', options: { timeout: 13_000 } },
    },
    {
      name: 'page.waitForSelector',
      args: { selector: '#saved', options: { timeout: 14_000 } },
    },
    { name: 'context.close' },
    { name: 'browser.close' },
  ])
  assert.equal(page.url(), 'https://sandbox.example')
})

test('omits executablePath unless explicitly configured and validates chromium', async () => {
  const { calls, chromium } = fixture()
  const launcher = new PlaywrightBrowserEngineLauncher(chromium)

  await launcher.launch({
    headless: false,
    timeoutMs: 5_000,
    args: [],
  })

  const launchOptions = calls[0]?.args as Record<string, unknown>
  assert.equal(Object.hasOwn(launchOptions, 'executablePath'), false)
  assert.throws(
    () => new PlaywrightBrowserEngineLauncher(null as unknown as PlaywrightChromiumLike),
    /Playwright chromium launcher is required/,
  )
})
