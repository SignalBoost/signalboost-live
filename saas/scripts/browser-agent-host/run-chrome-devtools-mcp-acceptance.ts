// saas/scripts/browser-agent-host/run-chrome-devtools-mcp-acceptance.ts
//
// Live reference-host acceptance for Chrome DevTools MCP.
//
// This runs on the existing GitHub Actions browser host, not Vercel. It consumes the same
// Provider Hub registry/client/runtime contracts the agents use, with the concrete stdio transport
// supplied by the host. The retained artifact is metadata-only: no page text, console bodies,
// request headers, cookies, screenshots, prompts or credentials are persisted.
//
// Acceptance proves:
//  1. exact Chrome DevTools MCP package + stdio process can initialize;
//  2. Provider Hub exposes only the live host allowlist;
//  3. a write-shaped navigation is blocked without approval;
//  4. off-origin navigation is rejected before the MCP process receives it;
//  5. approved navigation reaches iTMounts;
//  6. page snapshot, console and network diagnostic tools execute successfully;
//  7. the MCP process is explicitly closed.

import { writeFile } from 'node:fs/promises'
import { createPortableConnectorRuntime } from '../../provider-hub-core/connector-runtime.ts'
import {
  createInMemoryMcpConnectionRegistry,
  createMcpConnectionRegistryResolver,
} from '../../provider-hub-host/mcp-connection-registry.ts'
import {
  CHROME_DEVTOOLS_MCP_PROFILE,
  createBrowserMcpRegistryEntries,
} from '../../provider-hub-host/browser-mcp-profiles.ts'
import { createBrowserMcpStdioTransportFactory } from '../../provider-hub-host/browser-mcp-stdio-host.ts'

const tenantId = 'signalboost-reference'
const environmentId = 'production-reference'
const portableId = 'software-specialist'
const serverId = 'chrome-devtools-mcp'

const probeUrl = String(process.env.BROWSER_MCP_PROBE_URL || 'https://itmounts.com/').trim()
const resultPath = String(process.env.BROWSER_MCP_ACCEPTANCE_RESULT_PATH || 'browser-mcp-acceptance.json').trim()
const chromeExecutable = String(process.env.BROWSER_MCP_CHROME_EXECUTABLE || '').trim()
const approvedOrigins = String(
  process.env.BROWSER_MCP_APPROVED_ORIGINS || 'https://itmounts.com,https://www.itmounts.com',
).split(',').map(value => value.trim()).filter(Boolean)

function originOf(value: string): string {
  return new URL(value).origin
}

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pagesFromResult(value: unknown): Array<{ pageId: number; url: string; selected: boolean }> {
  if (plain(value) && plain(value.structuredContent) && Array.isArray(value.structuredContent.pages)) {
    const structured = value.structuredContent.pages.flatMap(item => {
      if (!plain(item)) return []
      const pageId = typeof item.id === 'number'
        ? item.id
        : typeof item.pageId === 'number'
          ? item.pageId
          : NaN
      const url = typeof item.url === 'string' ? item.url : ''
      return Number.isInteger(pageId) && url
        ? [{ pageId, url, selected: item.selected === true }]
        : []
    })
    if (structured.length) return structured
  }

  // Compatibility fallback for older/non-structured responses. Current Chrome DevTools MCP may
  // render a titled page as: "1: Page title (https://example.com/) [selected]".
  const text: string[] = []
  const collect = (input: unknown): void => {
    if (!input || typeof input !== 'object') return
    if (Array.isArray(input)) {
      input.forEach(collect)
      return
    }
    const record = input as Record<string, unknown>
    if (typeof record.text === 'string') text.push(record.text)
    Object.values(record).forEach(collect)
  }
  collect(value)

  const pages: Array<{ pageId: number; url: string; selected: boolean }> = []
  for (const line of text.join('\n').split(/\r?\n/)) {
    const id = line.match(/^\s*(\d+)\s*:/)
    const url = line.match(/https?:\/\/[^\s)\]]+/)
    if (!id || !url) continue
    pages.push({ pageId: Number(id[1]), url: url[0], selected: /\[selected\]/.test(line) })
  }
  return pages
}

function assertion(name: string, passed: boolean, detail: string) {
  return Object.freeze({ name, passed, detail })
}

function safeRuntimeDetail(result: { mode?: string; error?: string | null }): string {
  const rawError = String(result.error || '')
  const code = rawError.match(/browser_mcp_[a-z0-9_.:-]+/i)?.[0]
  const sanitized = rawError
    .replace(/https?:\/\/\S+/gi, '<url>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
  return code
    ? `mode=${result.mode || 'none'}; error=${code}`
    : sanitized
      ? `mode=${result.mode || 'none'}; error=${sanitized}`
      : `mode=${result.mode || 'none'}`
}

async function main() {
  const startedAt = new Date().toISOString()
  const checks: Array<ReturnType<typeof assertion>> = []
  const approvedOriginSet = new Set(approvedOrigins.map(originOf))
  if (!approvedOriginSet.has(originOf(probeUrl))) {
    throw new Error('probe URL origin is not in BROWSER_MCP_APPROVED_ORIGINS')
  }

  const entries = createBrowserMcpRegistryEntries({
    tenantId,
    environmentId,
    portableId,
    enabledProfiles: ['chrome-devtools-mcp'],
  })
  const registry = createInMemoryMcpConnectionRegistry(entries)

  const transportFactory = createBrowserMcpStdioTransportFactory({
    approvedOrigins: [...approvedOriginSet],
    cwd: process.cwd(),
    maxLineBytes: 8 * 1024 * 1024,
    commandForProfile(profile, origins) {
      if (profile.profileId !== 'chrome-devtools-mcp') throw new Error('unexpected browser MCP profile')
      return {
        command: 'npx',
        args: [
          '--no-install',
          profile.packageName,
          ...profile.recommendedArgs,
          ...(chromeExecutable ? [`--executable-path=${chromeExecutable}`] : []),
        ],
        cwd: process.cwd(),
        env: {
          npm_config_yes: 'false',
          CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1',
          BROWSER_MCP_APPROVED_ORIGIN_COUNT: String(origins.length),
        },
      }
    },
  })

  const resolver = createMcpConnectionRegistryResolver({
    registry,
    transportFactory,
    timeoutMs: 60_000,
    maxTools: 128,
  })
  const resolved = await resolver.resolve({ tenantId, environmentId, portableId, serverId })
  if (!resolved) throw new Error('Chrome DevTools MCP registry resolution failed')

  const auditEvents: Array<Record<string, unknown>> = []
  const runtime = createPortableConnectorRuntime({
    discovery: resolved.adapter.discovery,
    execution: resolved.adapter.execution,
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 90_000,
    audit: {
      async append(event) {
        auditEvents.push({
          capabilityId: event.capabilityId,
          risk: event.risk,
          requiresApproval: event.requiresApproval,
          approvalId: event.approvalId || null,
          ok: event.ok,
          mode: event.mode || null,
        })
      },
    },
  })

  const manifest = {
    portableId,
    manifestVersion: 'chrome-devtools-mcp-live-acceptance-v1',
    requirements: [
      { capabilityId: 'browser.chrome-devtools-mcp.pages.list', required: true, allowedRisk: 'read' as const },
      { capabilityId: 'browser.chrome-devtools-mcp.page.new', required: true, allowedRisk: 'write' as const },
      { capabilityId: 'browser.chrome-devtools-mcp.snapshot', required: true, allowedRisk: 'read' as const },
      { capabilityId: 'browser.chrome-devtools-mcp.console.list', required: true, allowedRisk: 'read' as const },
      { capabilityId: 'browser.chrome-devtools-mcp.network.list', required: true, allowedRisk: 'read' as const },
    ],
  }

  try {
    const discovered = await runtime.discover({ tenantId, environmentId, manifest })
    const names = discovered.capabilities.map(capability => capability.capabilityId).sort()
    checks.push(assertion(
      'provider_hub_exact_tool_projection',
      discovered.resolution.satisfied &&
        names.includes('browser.chrome-devtools-mcp.pages.list') &&
        !names.some(name => name.includes('upload') || name.includes('evaluate')),
      `visible_capabilities=${names.length}`,
    ))

    const noApproval = await runtime.invoke({
      manifest,
      invocation: {
        tenantId,
        environmentId,
        portableId,
        capabilityId: 'browser.chrome-devtools-mcp.page.new',
        args: { url: probeUrl },
      },
    })
    checks.push(assertion(
      'navigation_requires_approval',
      !noApproval.ok && noApproval.mode === 'approval_required',
      `mode=${noApproval.mode || 'none'}`,
    ))

    const rejectedOrigin = await runtime.invoke({
      manifest,
      invocation: {
        tenantId,
        environmentId,
        portableId,
        capabilityId: 'browser.chrome-devtools-mcp.page.new',
        args: { url: 'https://example.invalid/' },
        approval: {
          approvalId: 'owner-browser-mcp-live-acceptance',
          approvedBy: 'owner',
          approvedAt: startedAt,
        },
      },
    })
    checks.push(assertion(
      'off_origin_rejected_before_browser',
      !rejectedOrigin.ok && String(rejectedOrigin.error || '').includes('browser_mcp_navigation_origin_rejected'),
      `mode=${rejectedOrigin.mode || 'none'}`,
    ))

    const opened = await runtime.invoke({
      manifest,
      invocation: {
        tenantId,
        environmentId,
        portableId,
        capabilityId: 'browser.chrome-devtools-mcp.page.new',
        args: { url: probeUrl },
        approval: {
          approvalId: 'owner-browser-mcp-live-acceptance',
          approvedBy: 'owner',
          approvedAt: startedAt,
        },
      },
    })
    checks.push(assertion('approved_itmounts_navigation', opened.ok, safeRuntimeDetail(opened)))

    if (opened.ok) {
      const listed = await runtime.invoke({
        manifest,
        invocation: {
          tenantId,
          environmentId,
          portableId,
          capabilityId: 'browser.chrome-devtools-mcp.pages.list',
          args: {},
        },
      })
      const pages = listed.ok ? pagesFromResult(listed.data) : []
      const target = pages.find(page => {
        try { return approvedOriginSet.has(originOf(page.url)) } catch { return false }
      })
      const observedOrigins = [...new Set(pages.flatMap(page => {
        try { return [originOf(page.url)] } catch { return [] }
      }))].sort()
      checks.push(assertion(
        'itmounts_page_observed',
        listed.ok && Boolean(target),
        `page_count=${pages.length}; approved_page=${Boolean(target)}; observed_origins=${observedOrigins.join(',') || 'none'}`,
      ))

      if (target) {
        const snapshot = await runtime.invoke({
          manifest,
          invocation: {
            tenantId,
            environmentId,
            portableId,
            capabilityId: 'browser.chrome-devtools-mcp.snapshot',
            args: { pageId: target.pageId, verbose: false },
          },
        })
        checks.push(assertion('accessibility_snapshot_live', snapshot.ok, `mode=${snapshot.mode || 'none'}`))

        const consoleResult = await runtime.invoke({
          manifest,
          invocation: {
            tenantId,
            environmentId,
            portableId,
            capabilityId: 'browser.chrome-devtools-mcp.console.list',
            args: { pageId: target.pageId, pageSize: 20 },
          },
        })
        checks.push(assertion('console_diagnostics_live', consoleResult.ok, `mode=${consoleResult.mode || 'none'}`))

        const networkResult = await runtime.invoke({
          manifest,
          invocation: {
            tenantId,
            environmentId,
            portableId,
            capabilityId: 'browser.chrome-devtools-mcp.network.list',
            args: { pageId: target.pageId, pageSize: 20 },
          },
        })
        checks.push(assertion('network_diagnostics_live', networkResult.ok, `mode=${networkResult.mode || 'none'}`))
      } else {
        checks.push(assertion('accessibility_snapshot_live', false, 'skipped_no_approved_page'))
        checks.push(assertion('console_diagnostics_live', false, 'skipped_no_approved_page'))
        checks.push(assertion('network_diagnostics_live', false, 'skipped_no_approved_page'))
      }
    } else {
      checks.push(assertion('itmounts_page_observed', false, 'skipped_navigation_failed'))
      checks.push(assertion('accessibility_snapshot_live', false, 'skipped_navigation_failed'))
      checks.push(assertion('console_diagnostics_live', false, 'skipped_navigation_failed'))
      checks.push(assertion('network_diagnostics_live', false, 'skipped_navigation_failed'))
    }
  } finally {
    await resolved.close()
  }

  const passed = checks.length >= 7 && checks.every(check => check.passed)
  const evidence = {
    schemaVersion: 'chrome-devtools-mcp-live-acceptance-v1',
    passed,
    startedAt,
    completedAt: new Date().toISOString(),
    serverId,
    packageName: CHROME_DEVTOOLS_MCP_PROFILE.packageName,
    packageVersion: CHROME_DEVTOOLS_MCP_PROFILE.packageVersion,
    transport: 'stdio',
    portableId,
    probeOrigin: originOf(probeUrl),
    approvedOrigins: [...approvedOriginSet].sort(),
    checks,
    auditEvents,
    privacy: {
      pageContentStored: false,
      consoleBodiesStored: false,
      networkHeadersStored: false,
      credentialsStored: false,
      screenshotsStored: false,
    },
  }

  await writeFile(resultPath, JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ passed, checks, resultPath }))
  if (!passed) process.exitCode = 1
}

main().catch(async error => {
  const payload = {
    schemaVersion: 'chrome-devtools-mcp-live-acceptance-v1',
    passed: false,
    completedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : 'unknown acceptance failure',
  }
  try { await writeFile(resultPath, JSON.stringify(payload, null, 2)) } catch {}
  console.error(payload.error)
  process.exit(1)
})
