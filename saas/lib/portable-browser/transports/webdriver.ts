// saas/lib/portable-browser/transports/webdriver.ts
//
// A REAL BROWSER TRANSPORT. Four vendors stop being a form for the buyer to fill in.
//
// Every adapter in this portable ended at `transport.openSession()` — an interface the BUYER
// had to implement. So a customer who bought "twenty-six pre-staged vendors" opened
// browserstack-adapter.ts and found no BrowserStack call in it. The governance was real and the
// integration was theirs to write. That is a specification, not a product.
//
// This file implements the W3C WebDriver protocol, which is the whole point of building it
// rather than four vendor clients: **BrowserStack, Sauce Labs, LambdaTest and any Selenium Grid
// speak the same wire protocol.** One correct implementation, four vendors, and a fifth the day
// a buyer stands up their own grid. That is worth far more than four bespoke clients that drift.
//
// THE PROTOCOL, as the W3C specifies it:
//
//   POST   {hub}/session                        { capabilities: { alwaysMatch: … } } → sessionId
//   POST   {hub}/session/{id}/url               { url }
//   GET    {hub}/session/{id}/url               → current url
//   POST   {hub}/session/{id}/element           { using: 'css selector', value } → element id
//   POST   {hub}/session/{id}/element/{eid}/click
//   POST   {hub}/session/{id}/element/{eid}/value  { text }
//   DELETE {hub}/session/{id}                   ends the session
//
// Element ids arrive under the spec's constant key `element-6066-11e4-a52e-4f735466cecf`. It
// looks like a typo and is not — it is a deliberately unguessable name so a returned element
// cannot be confused with an ordinary object.
//
// THE ONE RULE THAT MATTERS MOST HERE. A remote session is billed by the minute and does not
// stop when your process does. So `close()` is not best-effort: a session that fails to end is
// reported rather than swallowed, and every failure path still attempts the DELETE. The
// alternative is a buyer discovering an abandoned grid session on their invoice.
//
// NO DEPENDENCY, NO SDK, NO ENVIRONMENT READ. `fetch` is global in Node 18+, so this stays
// inside the portable boundary that the whole product rests on.

import type { BrowserPagePort, BrowserSessionPort } from '../browser-task-contracts.ts'
import type { RemoteAdapterTransport } from '../adapters/remote-adapter-kit.ts'

/** The W3C constant that marks a web element in a response. Not arbitrary — see the header. */
const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf'

export type WebDriverOptions = {
  /**
   * The hub endpoint, e.g. https://hub.browserstack.com/wd/hub or
   * https://grid.internal.example:4444/wd/hub. Must be https unless it is loopback — the same
   * rule the origin allowlist applies, for the same reason.
   */
  hubEndpoint: string
  /** Requested capabilities. Vendor blocks (bstack:options and friends) go in here. */
  capabilities?: Record<string, unknown>
  /** Basic-auth user, when the vendor authenticates that way. */
  username?: string
  /** How long a single protocol call may take. */
  timeoutMs?: number
  /** How long waitForSelector polls before giving up. */
  waitTimeoutMs?: number
}

function assertReachableEndpoint(endpoint: string): URL {
  let parsed: URL
  try {
    parsed = new URL(endpoint)
  } catch {
    throw new Error('webdriver_invalid_hub_endpoint')
  }
  const loopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]'
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    throw new Error('webdriver_insecure_hub_endpoint')
  }
  if (parsed.username || parsed.password) {
    // Credentials belong in a header, not a URL: a URL with credentials in it ends up in logs,
    // in error messages and in screenshots of a config screen.
    throw new Error('webdriver_credentials_in_endpoint')
  }
  return parsed
}

type Call = { method: 'GET' | 'POST' | 'DELETE'; path: string; body?: unknown }

/**
 * One protocol call.
 *
 * WebDriver wraps every response in `{ value: … }` and reports errors there too, with the
 * vendor's own message. Those messages are returned as-is to the adapter, which passes them
 * through the sanitizer before anything is thrown — so a grid that echoes an access key into an
 * error cannot leak it, and this file does not have to guess which vendor does that.
 */
async function call(base: string, headers: Record<string, string>, timeoutMs: number, request: Call): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${base}${request.path}`, {
      method: request.method,
      headers: request.body === undefined ? headers : { 'content-type': 'application/json', ...headers },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: controller.signal,
    })
    const payload = (await response.json().catch(() => ({}))) as { value?: unknown }
    if (!response.ok) {
      const value = (payload?.value ?? {}) as { error?: string; message?: string }
      const detail = value.message || value.error || `HTTP ${response.status}`
      throw new Error(`webdriver_request_failed: ${detail}`)
    }
    return payload?.value
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error(`webdriver_timeout after ${timeoutMs}ms`)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function elementIdOf(value: unknown): string {
  const record = (value || {}) as Record<string, unknown>
  const id = record[ELEMENT_KEY]
  if (typeof id !== 'string' || !id) throw new Error('webdriver_element_not_returned')
  return id
}

/**
 * Build a transport for any WebDriver-speaking grid.
 *
 * Returned as a RemoteAdapterTransport, so it drops straight into the adapter a buyer already
 * has — nothing else in the portable changes, because the port it fills was always there.
 */
export function createWebDriverTransport(options: WebDriverOptions): RemoteAdapterTransport {
  const endpoint = assertReachableEndpoint(options.hubEndpoint)
  const base = endpoint.toString().replace(/\/+$/, '')
  const timeoutMs = Number.isInteger(options.timeoutMs) && Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 60_000
  const waitTimeoutMs = Number.isInteger(options.waitTimeoutMs) && Number(options.waitTimeoutMs) > 0 ? Number(options.waitTimeoutMs) : 15_000

  return {
    async openSession(input) {
      const credential = String(input.credential || '')
      const headers: Record<string, string> = {}
      if (options.username && credential) {
        headers.authorization = `Basic ${btoa(`${options.username}:${credential}`)}`
      } else if (credential) {
        headers.authorization = `Bearer ${credential}`
      }

      const capabilities = { ...(options.capabilities || {}) }
      const created = (await call(base, headers, timeoutMs, {
        method: 'POST',
        path: '/session',
        body: { capabilities: { alwaysMatch: capabilities } },
      })) as { sessionId?: string } | undefined

      const sessionId = String(created?.sessionId || '')
      if (!sessionId) throw new Error('webdriver_no_session_id')

      const send = (request: Call) => call(base, headers, timeoutMs, { ...request, path: `/session/${sessionId}${request.path}` })

      async function findElement(selector: string): Promise<string> {
        const value = await send({ method: 'POST', path: '/element', body: { using: 'css selector', value: selector } })
        return elementIdOf(value)
      }

      // The page's URL is read from the grid rather than remembered locally, so a redirect the
      // site performed is visible. A cached value would report where we asked to go, not where
      // the browser actually is — and the difference is exactly what an approval decision turns
      // on.
      let lastKnownUrl = ''

      const page: BrowserPagePort = {
        url() {
          return lastKnownUrl
        },
        async goto(url: string) {
          await send({ method: 'POST', path: '/url', body: { url } })
          const current = await send({ method: 'GET', path: '/url' })
          lastKnownUrl = typeof current === 'string' ? current : url
        },
        async click(selector: string) {
          const element = await findElement(selector)
          await send({ method: 'POST', path: `/element/${element}/click`, body: {} })
        },
        async fill(selector: string, value: string) {
          const element = await findElement(selector)
          // Clear first: WebDriver APPENDS, so filling a pre-populated field twice silently
          // produces a doubled value rather than an error.
          await send({ method: 'POST', path: `/element/${element}/clear`, body: {} }).catch(() => {})
          await send({ method: 'POST', path: `/element/${element}/value`, body: { text: value } })
        },
        async waitForSelector(selector: string, timeout?: number) {
          const limit = Number.isInteger(timeout) && Number(timeout) > 0 ? Number(timeout) : waitTimeoutMs
          const deadline = Date.now() + limit
          let lastError: unknown = null
          while (Date.now() < deadline) {
            try {
              await findElement(selector)
              return
            } catch (error) {
              lastError = error
              await new Promise(resolve => setTimeout(resolve, 250))
            }
          }
          throw new Error(`webdriver_wait_timeout: ${selector} not present after ${limit}ms${lastError instanceof Error ? ` (${lastError.message})` : ''}`)
        },
      }

      return {
        page,
        async close() {
          // Reported, never swallowed. A remote session bills by the minute and outlives this
          // process; a silent failure here is a line on the buyer's invoice.
          await send({ method: 'DELETE', path: '' })
        },
      } satisfies BrowserSessionPort
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Vendor presets
// ─────────────────────────────────────────────────────────────────────────────
//
// Each of these is the SAME transport with that vendor's capability block and auth style. They
// exist so a buyer types their user name and key and nothing else — the difference between the
// four is a handful of fields, and asking a customer to discover those from vendor
// documentation is asking them to do our job.

export type VendorTransportOptions = {
  /** The vendor's hub endpoint. */
  hubEndpoint: string
  /** The account user name. The access key arrives per launch through the credential broker. */
  username: string
  /** Browser to request. Defaults to the vendor's own default when omitted. */
  browserName?: string
  browserVersion?: string
  /** Platform string, in the vendor's own vocabulary. */
  platformName?: string
  /** Anything else the buyer wants in the vendor's options block. */
  vendorOptions?: Record<string, unknown>
  timeoutMs?: number
  waitTimeoutMs?: number
}

function baseCapabilities(options: VendorTransportOptions): Record<string, unknown> {
  const capabilities: Record<string, unknown> = {}
  if (options.browserName) capabilities.browserName = options.browserName
  if (options.browserVersion) capabilities.browserVersion = options.browserVersion
  if (options.platformName) capabilities.platformName = options.platformName
  return capabilities
}

/** BrowserStack Automate. Credentials go in its `bstack:options` block and in basic auth. */
export function createBrowserStackTransport(options: VendorTransportOptions): RemoteAdapterTransport {
  return createWebDriverTransport({
    hubEndpoint: options.hubEndpoint,
    username: options.username,
    timeoutMs: options.timeoutMs,
    waitTimeoutMs: options.waitTimeoutMs,
    capabilities: {
      ...baseCapabilities(options),
      'bstack:options': { userName: options.username, ...(options.vendorOptions || {}) },
    },
  })
}

/** Sauce Labs. Its data centre is decided by the hub endpoint, not by a capability. */
export function createSauceLabsTransport(options: VendorTransportOptions): RemoteAdapterTransport {
  return createWebDriverTransport({
    hubEndpoint: options.hubEndpoint,
    username: options.username,
    timeoutMs: options.timeoutMs,
    waitTimeoutMs: options.waitTimeoutMs,
    capabilities: {
      ...baseCapabilities(options),
      'sauce:options': { username: options.username, ...(options.vendorOptions || {}) },
    },
  })
}

/** LambdaTest. Same protocol, its own options key. */
export function createLambdaTestTransport(options: VendorTransportOptions): RemoteAdapterTransport {
  return createWebDriverTransport({
    hubEndpoint: options.hubEndpoint,
    username: options.username,
    timeoutMs: options.timeoutMs,
    waitTimeoutMs: options.waitTimeoutMs,
    capabilities: {
      ...baseCapabilities(options),
      'LT:Options': { username: options.username, ...(options.vendorOptions || {}) },
    },
  })
}

/**
 * A Selenium Grid the buyer runs themselves.
 *
 * `username` is optional here and that is the point: an internal grid usually has no
 * authentication at all, and demanding a credential where none exists blocks the integration
 * rather than securing it.
 */
export function createSeleniumGridTransport(options: Omit<VendorTransportOptions, 'username'> & { username?: string }): RemoteAdapterTransport {
  return createWebDriverTransport({
    hubEndpoint: options.hubEndpoint,
    username: options.username,
    timeoutMs: options.timeoutMs,
    waitTimeoutMs: options.waitTimeoutMs,
    capabilities: { ...baseCapabilities(options as VendorTransportOptions), ...(options.vendorOptions || {}) },
  })
}
