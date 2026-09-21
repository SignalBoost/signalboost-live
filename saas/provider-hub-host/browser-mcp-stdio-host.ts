// saas/provider-hub-host/browser-mcp-stdio-host.ts
//
// SignalBoost's concrete host boundary for stdio browser MCP servers.
//
// Provider Hub already denies every remote tool not explicitly mapped. This host adds a second,
// runtime-specific narrowing layer before bytes reach the MCP child process:
//   - only a bounded live diagnostic tool set is advertised;
//   - direct calls to tools outside that set are rejected even if a caller bypasses discovery;
//   - top-level navigation URLs must remain on an exact host-approved origin;
//   - file-writing arguments and init scripts are rejected;
//   - packages are launched only through exact logical transportRef -> pinned profile mappings.
//
// The upstream Playwright --allowed-origins flag is passed as defense in depth, but it is NOT the
// security boundary; its own documentation says so. This file is the security boundary.

import type {
  McpOutboundScope,
  McpOutboundTransport,
  McpOutboundTransportInput,
} from './mcp-outbound-client.ts'
import {
  createNodeMcpStdioTransportFactory,
  type McpStdioCommand,
  type McpStdioTransportFactory,
} from './mcp-stdio-transport.ts'
import {
  BROWSER_MCP_PROFILES,
  CHROME_DEVTOOLS_MCP_PROFILE,
  PLAYWRIGHT_MCP_PROFILE,
  type BrowserMcpProfileId,
  type BrowserMcpServerProfile,
} from './browser-mcp-profiles.ts'

export const BROWSER_MCP_STDIO_HOST_VERSION = 'browser-mcp-stdio-host-v1' as const

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

const LIVE_TOOL_ALLOWLIST: Readonly<Record<BrowserMcpProfileId, ReadonlySet<string>>> = Object.freeze({
  'chrome-devtools-mcp': new Set([
    'list_pages',
    'take_snapshot',
    'take_screenshot',
    'list_console_messages',
    'get_console_message',
    'list_network_requests',
    'get_network_request',
    'get_css_styles',
    'lighthouse_audit',
    'performance_start_trace',
    'performance_stop_trace',
    'performance_analyze_insight',
    // Bounded navigation is allowed only because assertToolCall() validates the explicit URL
    // against the host's exact origin set before the request reaches Chrome.
    'navigate_page',
    'new_page',
    'select_page',
  ]),
  'playwright-mcp': new Set([
    'browser_snapshot',
    'browser_find',
    'browser_take_screenshot',
    'browser_console_messages',
    'browser_network_requests',
    'browser_navigate',
  ]),
})

const FILE_OR_SCRIPT_KEY = /^(?:filePath|filePaths|requestFilePath|responseFilePath|outputDirPath|initScript|script|workspace|workspaceRoot)$/i

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`browser_mcp_${name}_required`)
  return normalized
}

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function profileFor(serverId: string, transportRef: string): BrowserMcpServerProfile {
  const profile = BROWSER_MCP_PROFILES.find(item => item.serverId === serverId && item.transportRef === transportRef)
  if (!profile) throw new Error('browser_mcp_unregistered_transport')
  return profile
}

function normalizeApprovedOrigin(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('browser_mcp_invalid_origin')
  }
  if (parsed.origin !== value || parsed.username || parsed.password || !/^https?:$/.test(parsed.protocol)) {
    throw new Error('browser_mcp_invalid_origin')
  }
  if (parsed.protocol === 'http:' && !LOOPBACK.has(parsed.hostname)) {
    throw new Error('browser_mcp_insecure_origin')
  }
  return parsed.origin
}

function assertUrlAllowed(value: unknown, approvedOrigins: ReadonlySet<string>): void {
  const raw = required(value, 'navigation_url')
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('browser_mcp_navigation_url_invalid')
  }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('browser_mcp_navigation_scheme_rejected')
  }
  if (!approvedOrigins.has(parsed.origin)) {
    throw new Error(`browser_mcp_navigation_origin_rejected:${parsed.origin}`)
  }
}

function assertNoHostWriteArguments(value: unknown, path = 'arguments'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoHostWriteArguments(item, `${path}[${index}]`))
    return
  }
  if (!plain(value)) return
  for (const [key, item] of Object.entries(value)) {
    if (FILE_OR_SCRIPT_KEY.test(key)) throw new Error(`browser_mcp_host_write_argument_rejected:${path}.${key}`)
    assertNoHostWriteArguments(item, `${path}.${key}`)
  }
}

function callShape(request: Readonly<Record<string, unknown>>): {
  name: string
  args: Readonly<Record<string, unknown>>
} | null {
  if (request.method !== 'tools/call') return null
  const params = plain(request.params) ? request.params : {}
  const name = required(params.name, 'tool_name')
  const args = plain(params.arguments) ? params.arguments : {}
  return { name, args }
}

function assertToolCall(
  profile: BrowserMcpServerProfile,
  request: Readonly<Record<string, unknown>>,
  approvedOrigins: ReadonlySet<string>,
): void {
  const call = callShape(request)
  if (!call) return
  const allowed = LIVE_TOOL_ALLOWLIST[profile.profileId]
  if (!allowed.has(call.name)) throw new Error(`browser_mcp_tool_not_live_enabled:${call.name}`)

  assertNoHostWriteArguments(call.args)

  if (profile.profileId === 'chrome-devtools-mcp') {
    if (call.name === 'navigate_page') {
      const type = typeof call.args.type === 'string' ? call.args.type : 'url'
      if (type !== 'url') throw new Error(`browser_mcp_navigation_type_rejected:${type}`)
      assertUrlAllowed(call.args.url, approvedOrigins)
    } else if (call.name === 'new_page') {
      assertUrlAllowed(call.args.url, approvedOrigins)
    }
  } else if (profile.profileId === 'playwright-mcp' && call.name === 'browser_navigate') {
    assertUrlAllowed(call.args.url, approvedOrigins)
  }
}

type ChromeStructuredPage = {
  id: number
  url: string
  selected: boolean
}

function toolResult(raw: unknown): Record<string, unknown> | null {
  return plain(raw) && plain(raw.result) ? raw.result : null
}

function toolTextLines(raw: unknown): readonly string[] {
  const result = toolResult(raw)
  if (!result || !Array.isArray(result.content)) return Object.freeze([])
  const lines: string[] = []
  for (const item of result.content) {
    if (!plain(item) || typeof item.text !== 'string') continue
    lines.push(...item.text.split(/\r?\n/))
  }
  return Object.freeze(lines)
}

function chromeStructuredPages(raw: unknown): readonly ChromeStructuredPage[] {
  const result = toolResult(raw)
  const structured = result && plain(result.structuredContent) ? result.structuredContent : null
  const value = structured?.pages
  if (Array.isArray(value)) {
    const pages: ChromeStructuredPage[] = []
    for (const item of value) {
      if (!plain(item)) continue
      const id = typeof item.id === 'number'
        ? item.id
        : typeof item.pageId === 'number'
          ? item.pageId
          : NaN
      const url = typeof item.url === 'string' ? item.url : ''
      if (!Number.isInteger(id) || !url) continue
      pages.push({ id, url, selected: item.selected === true })
    }
    if (pages.length) return Object.freeze(pages)
  }

  // Chrome DevTools MCP 1.9.0 can omit structuredContent from the MCP result even when the
  // experimental structured flag is enabled. Its standard text result still emits one host-owned
  // page line per page. Parse only the final URL position, never URLs embedded in page titles.
  const pages: ChromeStructuredPage[] = []
  for (const line of toolTextLines(raw)) {
    const row = line.match(/^\s*(\d+)\s*:\s*(.+?)\s*$/)
    if (!row) continue
    const id = Number(row[1])
    let body = row[2].trim()
    const selected = /\s+\[selected\](?:\s+isolatedContext=.*)?\s*$/.test(body)
    body = body
      .replace(/\s+\[selected\](?:\s+isolatedContext=.*)?\s*$/, '')
      .replace(/\s+isolatedContext=.*$/, '')
      .trim()

    let url = ''
    if (/^https?:\/\/\S+$/.test(body)) {
      url = body
    } else {
      const titled = body.match(/\((https?:\/\/[^()\s]+)\)\s*$/)
      if (titled) url = titled[1]
    }
    if (Number.isInteger(id) && url) pages.push({ id, url, selected })
  }
  return Object.freeze(pages)
}

function playwrightNavigationUrl(raw: unknown): string | null {
  for (const line of toolTextLines(raw)) {
    const match = line.match(/^\s*(?:-\s*)?Page URL:\s*(https?:\/\/\S+)\s*$/)
    if (match) return match[1]
  }
  return null
}

function navigationTargetPageId(call: ReturnType<typeof callShape>, pages: readonly ChromeStructuredPage[]): number | null {
  if (!call) return null
  if (call.name === 'navigate_page') {
    return typeof call.args.pageId === 'number' && Number.isInteger(call.args.pageId)
      ? call.args.pageId
      : null
  }
  if (call.name === 'new_page') {
    const selected = pages.find(page => page.selected)
    if (selected) return selected.id
    return pages.length ? Math.max(...pages.map(page => page.id)) : null
  }
  return null
}

function assertNavigationResultAllowed(
  profile: BrowserMcpServerProfile,
  request: Readonly<Record<string, unknown>>,
  raw: unknown,
  approvedOrigins: ReadonlySet<string>,
): void {
  const call = callShape(request)
  if (!call) return

  // Preserve an upstream tool error as an upstream tool error. Final-origin evidence is required
  // only for a navigation the remote MCP server reports as successful; otherwise the adapter must
  // surface the real remote failure instead of masking it as missing navigation evidence.
  const result = toolResult(raw)
  if (result?.isError === true) return

  if (profile.profileId === 'chrome-devtools-mcp' && ['navigate_page', 'new_page'].includes(call.name)) {
    const pages = chromeStructuredPages(raw)
    if (!pages.length) throw new Error('browser_mcp_navigation_evidence_missing')
    const targetId = navigationTargetPageId(call, pages)
    const target = targetId === null ? undefined : pages.find(page => page.id === targetId)
    if (!target) throw new Error('browser_mcp_navigation_target_missing')
    assertUrlAllowed(target.url, approvedOrigins)
    return
  }

  if (profile.profileId === 'playwright-mcp' && call.name === 'browser_navigate') {
    const finalUrl = playwrightNavigationUrl(raw)
    if (!finalUrl) throw new Error('browser_mcp_navigation_evidence_missing')
    assertUrlAllowed(finalUrl, approvedOrigins)
  }
}

function filterToolsResponse(
  profile: BrowserMcpServerProfile,
  request: Readonly<Record<string, unknown>>,
  raw: unknown,
): unknown {
  if (request.method !== 'tools/list' || !plain(raw) || !plain(raw.result) || !Array.isArray(raw.result.tools)) return raw
  const allowed = LIVE_TOOL_ALLOWLIST[profile.profileId]
  return {
    ...raw,
    result: {
      ...raw.result,
      tools: raw.result.tools.filter(tool => plain(tool) && typeof tool.name === 'string' && allowed.has(tool.name)),
    },
  }
}

function recommendedArgs(profile: BrowserMcpServerProfile, approvedOrigins: readonly string[]): readonly string[] {
  if (profile.profileId === 'playwright-mcp') {
    return Object.freeze([
      ...profile.recommendedArgs,
      '--allowed-origins',
      approvedOrigins.join(';'),
      '--block-service-workers',
    ])
  }
  return profile.recommendedArgs
}

function defaultCommand(profile: BrowserMcpServerProfile, approvedOrigins: readonly string[], cwd?: string): McpStdioCommand {
  return Object.freeze({
    command: 'npx',
    args: Object.freeze(['--no-install', profile.packageName, ...recommendedArgs(profile, approvedOrigins)]),
    cwd,
    env: Object.freeze({
      npm_config_yes: 'false',
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1',
    }),
  })
}

export interface BrowserMcpStdioHostOptions {
  readonly approvedOrigins: readonly string[]
  readonly cwd?: string
  /**
   * Optional host override. It may choose a preinstalled binary/path, but it receives only an
   * already-validated registered profile; registry data never becomes a shell command.
   */
  readonly commandForProfile?: (
    profile: BrowserMcpServerProfile,
    approvedOrigins: readonly string[],
    scope: McpOutboundScope,
  ) => McpStdioCommand
  readonly maxLineBytes?: number
}

export function createBrowserMcpStdioTransportFactory(options: BrowserMcpStdioHostOptions): McpStdioTransportFactory {
  if (!Array.isArray(options?.approvedOrigins) || options.approvedOrigins.length === 0) {
    throw new Error('browser_mcp_approved_origin_required')
  }
  const normalizedOrigins = Object.freeze(options.approvedOrigins.map(normalizeApprovedOrigin))
  const approvedOrigins = new Set(normalizedOrigins)

  const base = createNodeMcpStdioTransportFactory({
    maxLineBytes: options.maxLineBytes,
    commandResolver: {
      resolve({ serverId, transportRef, scope }) {
        const profile = profileFor(serverId, transportRef)
        return options.commandForProfile
          ? options.commandForProfile(profile, normalizedOrigins, scope)
          : defaultCommand(profile, normalizedOrigins, options.cwd)
      },
    },
  })

  return Object.freeze({
    create(input) {
      const profile = profileFor(input.serverId, input.transportRef)
      const delegate = base.create(input)
      const guarded: McpOutboundTransport = {
        async send(call: McpOutboundTransportInput) {
          assertToolCall(profile, call.request, approvedOrigins)
          const raw = await delegate.send(call)
          try {
            assertNavigationResultAllowed(profile, call.request, raw, approvedOrigins)
          } catch (error) {
            await delegate.close?.()
            throw error
          }
          return filterToolsResponse(profile, call.request, raw)
        },
        async notify(call: McpOutboundTransportInput) {
          await delegate.notify?.(call)
        },
        async close() {
          await delegate.close?.()
        },
      }
      return Object.freeze(guarded)
    },
  })
}

export function liveBrowserMcpToolNames(profileId: BrowserMcpProfileId): readonly string[] {
  return Object.freeze([...LIVE_TOOL_ALLOWLIST[profileId]].sort())
}

export function assertBrowserMcpToolCallForTest(input: {
  serverId: BrowserMcpProfileId
  toolName: string
  args: Readonly<Record<string, unknown>>
  approvedOrigins: readonly string[]
}): void {
  const profile = input.serverId === 'chrome-devtools-mcp'
    ? CHROME_DEVTOOLS_MCP_PROFILE
    : PLAYWRIGHT_MCP_PROFILE
  const approved = new Set(input.approvedOrigins.map(normalizeApprovedOrigin))
  assertToolCall(profile, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: input.toolName, arguments: input.args },
  }, approved)
}


export function assertBrowserMcpNavigationResultForTest(input: {
  serverId: BrowserMcpProfileId
  toolName: 'navigate_page' | 'new_page'
  args: Readonly<Record<string, unknown>>
  approvedOrigins: readonly string[]
  pages: readonly Readonly<{ id: number; url: string; selected?: boolean }>[]
}): void {
  const profile = input.serverId === 'chrome-devtools-mcp'
    ? CHROME_DEVTOOLS_MCP_PROFILE
    : PLAYWRIGHT_MCP_PROFILE
  const approved = new Set(input.approvedOrigins.map(normalizeApprovedOrigin))
  assertNavigationResultAllowed(profile, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: input.toolName, arguments: input.args },
  }, {
    jsonrpc: '2.0',
    id: 1,
    result: {
      structuredContent: {
        pages: input.pages.map(page => ({ ...page, selected: page.selected === true })),
      },
    },
  }, approved)
}


export function assertBrowserMcpRawNavigationResultForTest(input: {
  serverId: BrowserMcpProfileId
  toolName: 'navigate_page' | 'new_page' | 'browser_navigate'
  args: Readonly<Record<string, unknown>>
  approvedOrigins: readonly string[]
  rawResult: Readonly<Record<string, unknown>>
}): void {
  const profile = input.serverId === 'chrome-devtools-mcp'
    ? CHROME_DEVTOOLS_MCP_PROFILE
    : PLAYWRIGHT_MCP_PROFILE
  const approved = new Set(input.approvedOrigins.map(normalizeApprovedOrigin))
  assertNavigationResultAllowed(profile, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: input.toolName, arguments: input.args },
  }, {
    jsonrpc: '2.0',
    id: 1,
    result: input.rawResult,
  }, approved)
}
