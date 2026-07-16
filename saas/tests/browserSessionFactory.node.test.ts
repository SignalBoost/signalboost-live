import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DefaultBrowserSessionFactory,
  type BrowserEngineBrowser,
  type BrowserEngineContext,
  type BrowserEngineLauncher,
  type BrowserEnginePage,
} from '../lib/browser-runtime/session-factory.ts'
import type { BrowserTask } from '../lib/browser-runtime/contracts.ts'

const task: BrowserTask = {
  taskId: 'task-1',
  incidentId: 'incident-1',
  provider: 'sandbox',
  adapterId: 'sandbox.v1',
  mode: 'observe',
  issuedAt: '2026-07-15T00:00:00.000Z',
  expiresAt: '2026-07-16T00:00:00.000Z',
  allowedOrigins: ['https://sandbox.example'],
  steps: [],
  approvalToken: 'test-token',
}

interface FixtureOptions {
  failContext?: boolean
  failPage?: boolean
  delayLaunchMs?: number
  delayContextMs?: number
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function fixture(options: FixtureOptions = {}) {
  const calls: string[] = []
  let currentUrl = 'about:blank'

  const page: BrowserEnginePage = {
    url: () => currentUrl,
    goto: async url => { calls.push(`goto:${url}`); currentUrl = url },
    click: async selector => { calls.push(`click:${selector}`) },
    fill: async (selector, value) => { calls.push(`fill:${selector}:${value}`) },
    waitForSelector: async selector => { calls.push(`wait:${selector}`) },
  }

  const context: BrowserEngineContext = {
    newPage: async () => {
      calls.push('newPage')
      if (options.failPage) throw new Error('page failed')
      return page
    },
    close: async () => { calls.push('context.close') },
  }

  const browser: BrowserEngineBrowser = {
    newContext: async config => {
      calls.push([
        'newContext',
        config.serviceWorkers,
        config.acceptDownloads,
        config.ignoreHTTPSErrors,
        config.javaScriptEnabled,
        `${config.viewport.width}x${config.viewport.height}`,
      ].join(':'))
      if (options.delayContextMs) await sleep(options.delayContextMs)
      if (options.failContext) throw new Error('context failed')
      return context
    },
    close: async () => { calls.push('browser.close') },
  }

  const launcher: BrowserEngineLauncher = {
    launch: async config => {
      calls.push(`launch:${config.headless}:${config.timeoutMs}`)
      if (options.delayLaunchMs) await sleep(options.delayLaunchMs)
      return browser
    },
  }

  return { calls, launcher }
}

test('opens an isolated session, delegates page actions, and closes once', async () => {
  const { calls, launcher } = fixture()
  const factory = new DefaultBrowserSessionFactory({ launcher })
  const session = await factory.open(task)

  await session.page.goto('https://sandbox.example/dashboard')
  await session.page.click('#settings')
  await session.page.fill('#name', 'SignalBoost')
  await session.page.waitForSelector('#saved')
  await session.close()
  await session.close()

  assert.deepEqual(calls, [
    'launch:true:30000',
    'newContext:block:false:false:true:1440x900',
    'newPage',
    'goto:https://sandbox.example/dashboard',
    'click:#settings',
    'fill:#name:SignalBoost',
    'wait:#saved',
    'context.close',
    'browser.close',
  ])
})

test('uses explicitly configured launch and viewport values', async () => {
  const { calls, launcher } = fixture()
  const factory = new DefaultBrowserSessionFactory({
    launcher,
    headless: false,
    launchTimeoutMs: 8_000,
    actionTimeoutMs: 4_000,
    launchArgs: ['--disable-gpu'],
    viewport: { width: 1280, height: 720 },
  })

  const session = await factory.open(task)
  assert.equal(calls[0], 'launch:false:8000')
  assert.equal(calls[1], 'newContext:block:false:false:true:1280x720')
  await session.close()
})

test('closes the browser when context creation fails', async () => {
  const { calls, launcher } = fixture({ failContext: true })
  const factory = new DefaultBrowserSessionFactory({ launcher })
  await assert.rejects(() => factory.open(task), /context failed/)
  assert.equal(calls.at(-1), 'browser.close')
})

test('closes the context and browser when page creation fails', async () => {
  const { calls, launcher } = fixture({ failPage: true })
  const factory = new DefaultBrowserSessionFactory({ launcher })
  await assert.rejects(() => factory.open(task), /page failed/)
  assert.deepEqual(calls.slice(-2), ['context.close', 'browser.close'])
})

test('fails closed when browser launch exceeds its deadline', async () => {
  const { launcher } = fixture({ delayLaunchMs: 30 })
  const factory = new DefaultBrowserSessionFactory({ launcher, launchTimeoutMs: 5 })
  await assert.rejects(() => factory.open(task), /Browser launch timed out after 5ms/)
})

test('fails closed when context creation exceeds its deadline', async () => {
  const { calls, launcher } = fixture({ delayContextMs: 30 })
  const factory = new DefaultBrowserSessionFactory({ launcher, launchTimeoutMs: 5 })
  await assert.rejects(() => factory.open(task), /Browser context creation timed out after 5ms/)
  assert.equal(calls.at(-1), 'browser.close')
})

test('rejects invalid timeout configuration', () => {
  const { launcher } = fixture()
  assert.throws(
    () => new DefaultBrowserSessionFactory({ launcher, launchTimeoutMs: 0 }),
    /Browser launch timeout must be a positive integer/,
  )
  assert.throws(
    () => new DefaultBrowserSessionFactory({ launcher, actionTimeoutMs: -1 }),
    /Browser action timeout must be a positive integer/,
  )
})
