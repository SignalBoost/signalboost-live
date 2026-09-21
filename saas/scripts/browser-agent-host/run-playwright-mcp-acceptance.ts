// saas/scripts/browser-agent-host/run-playwright-mcp-acceptance.ts
//
// Live reference-host acceptance for Playwright MCP through the same Provider Hub and Portable
// Connector Runtime used by governed agents. Retained evidence is metadata-only.

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPortableConnectorRuntime } from '../../provider-hub-core/connector-runtime.ts'
import {
  createInMemoryMcpConnectionRegistry,
  createMcpConnectionRegistryResolver,
} from '../../provider-hub-host/mcp-connection-registry.ts'
import {
  PLAYWRIGHT_MCP_PROFILE,
  createBrowserMcpRegistryEntries,
} from '../../provider-hub-host/browser-mcp-profiles.ts'
import {
  createBrowserMcpStdioTransportFactory,
  liveBrowserMcpToolNames,
} from '../../provider-hub-host/browser-mcp-stdio-host.ts'

const tenantId = 'signalboost-reference'
const environmentId = 'production-reference'
const portableId = 'software-specialist'
const serverId = 'playwright-mcp'

const probeUrl = String(process.env.BROWSER_MCP_PROBE_URL || 'https://itmounts.com/').trim()
const resultPath = String(process.env.BROWSER_MCP_ACCEPTANCE_RESULT_PATH || 'playwright-mcp-acceptance.json').trim()
const browserExecutable = String(process.env.BROWSER_MCP_PLAYWRIGHT_EXECUTABLE || '').trim()
const approvedOrigins = String(
  process.env.BROWSER_MCP_APPROVED_ORIGINS || 'https://itmounts.com,https://www.itmounts.com',
).split(',').map(value => value.trim()).filter(Boolean)

function originOf(value: string): string {
  return new URL(value).origin
}

function assertion(name: string, passed: boolean, detail: string) {
  return Object.freeze({ name, passed, detail })
}

function safeRuntimeDetail(result: { mode?: string; error?: string | null }): string {
  const error = String(result.error || '')
  const code = error.match(/browser_mcp_[a-z0-9_.:-]+/i)?.[0]
  return code ? `mode=${result.mode || 'none'}; error=${code}` : `mode=${result.mode || 'none'}`
}

async function main() {
  const startedAt = new Date().toISOString()
  const checks: Array<ReturnType<typeof assertion>> = []
  const approvedOriginSet = new Set(approvedOrigins.map(originOf))
  if (!approvedOriginSet.has(originOf(probeUrl))) {
    throw new Error('probe URL origin is not in BROWSER_MCP_APPROVED_ORIGINS')
  }

  const outputDir = await mkdtemp(join(tmpdir(), 'signalboost-playwright-mcp-'))
  const entries = createBrowserMcpRegistryEntries({
    tenantId,
    environmentId,
    portableId,
    enabledProfiles: ['playwright-mcp'],
  })
  const registry = createInMemoryMcpConnectionRegistry(entries)

  const transportFactory = createBrowserMcpStdioTransportFactory({
    approvedOrigins: [...approvedOriginSet],
    cwd: process.cwd(),
    maxLineBytes: 8 * 1024 * 1024,
    commandForProfile(profile, origins) {
      if (profile.profileId !== 'playwright-mcp') throw new Error('unexpected browser MCP profile')
      return {
        command: 'npx',
        args: [
          '--no-install',
          profile.packageName,
          ...profile.recommendedArgs,
          '--allowed-origins',
          origins.join(';'),
          '--block-service-workers',
          '--image-responses',
          'omit',
          '--output-dir',
          outputDir,
          ...(browserExecutable ? ['--executable-path', browserExecutable] : []),
        ],
        cwd: process.cwd(),
        env: {
          npm_config_yes: 'false',
          PLAYWRIGHT_MCP_IMAGE_RESPONSES: 'omit',
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
  if (!resolved) throw new Error('Playwright MCP registry resolution failed')

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
    manifestVersion: 'playwright-mcp-live-acceptance-v1',
    requirements: [
      { capabilityId: 'browser.playwright-mcp.navigate', required: true, allowedRisk: 'write' as const },
      { capabilityId: 'browser.playwright-mcp.snapshot', required: true, allowedRisk: 'read' as const },
      { capabilityId: 'browser.playwright-mcp.console', required: true, allowedRisk: 'read' as const },
      { capabilityId: 'browser.playwright-mcp.network.list', required: true, allowedRisk: 'read' as const },
      { capabilityId: 'browser.playwright-mcp.screenshot', required: true, allowedRisk: 'read' as const },
    ],
  }

  try {
    const discovered = await runtime.discover({ tenantId, environmentId, manifest })
    const names = discovered.capabilities.map(capability => capability.capabilityId).sort()
    const expectedLiveCount = liveBrowserMcpToolNames('playwright-mcp').length
    checks.push(assertion(
      'provider_hub_exact_tool_projection',
      discovered.resolution.satisfied &&
        names.length === expectedLiveCount &&
        names.includes('browser.playwright-mcp.navigate') &&
        !names.some(name => name.includes('upload') || name.includes('evaluate') || name.includes('run_code')),
      `visible_capabilities=${names.length}; expected_live_capabilities=${expectedLiveCount}`,
    ))

    const noApproval = await runtime.invoke({
      manifest,
      invocation: {
        tenantId,
        environmentId,
        portableId,
        capabilityId: 'browser.playwright-mcp.navigate',
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
        capabilityId: 'browser.playwright-mcp.navigate',
        args: { url: 'https://example.invalid/' },
        approval: {
          approvalId: 'owner-playwright-mcp-live-acceptance',
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
        capabilityId: 'browser.playwright-mcp.navigate',
        args: { url: probeUrl },
        approval: {
          approvalId: 'owner-playwright-mcp-live-acceptance',
          approvedBy: 'owner',
          approvedAt: startedAt,
        },
      },
    })
    checks.push(assertion('approved_itmounts_navigation', opened.ok, safeRuntimeDetail(opened)))

    if (opened.ok) {
      const snapshot = await runtime.invoke({
        manifest,
        invocation: { tenantId, environmentId, portableId, capabilityId: 'browser.playwright-mcp.snapshot', args: {} },
      })
      checks.push(assertion('accessibility_snapshot_live', snapshot.ok, `mode=${snapshot.mode || 'none'}`))

      const consoleResult = await runtime.invoke({
        manifest,
        invocation: {
          tenantId,
          environmentId,
          portableId,
          capabilityId: 'browser.playwright-mcp.console',
          args: { level: 'info', all: false },
        },
      })
      checks.push(assertion('console_diagnostics_live', consoleResult.ok, `mode=${consoleResult.mode || 'none'}`))

      const networkResult = await runtime.invoke({
        manifest,
        invocation: {
          tenantId,
          environmentId,
          portableId,
          capabilityId: 'browser.playwright-mcp.network.list',
          args: { static: false },
        },
      })
      checks.push(assertion('network_diagnostics_live', networkResult.ok, `mode=${networkResult.mode || 'none'}`))

      const screenshot = await runtime.invoke({
        manifest,
        invocation: {
          tenantId,
          environmentId,
          portableId,
          capabilityId: 'browser.playwright-mcp.screenshot',
          args: { type: 'jpeg', fullPage: false, scale: 'css' },
        },
      })
      checks.push(assertion('screenshot_live', screenshot.ok, `mode=${screenshot.mode || 'none'}`))
    } else {
      checks.push(assertion('accessibility_snapshot_live', false, 'skipped_navigation_failed'))
      checks.push(assertion('console_diagnostics_live', false, 'skipped_navigation_failed'))
      checks.push(assertion('network_diagnostics_live', false, 'skipped_navigation_failed'))
      checks.push(assertion('screenshot_live', false, 'skipped_navigation_failed'))
    }
  } finally {
    await resolved.close()
    await rm(outputDir, { recursive: true, force: true })
  }

  const passed = checks.length >= 8 && checks.every(check => check.passed)
  const evidence = {
    schemaVersion: 'playwright-mcp-live-acceptance-v1',
    passed,
    startedAt,
    completedAt: new Date().toISOString(),
    serverId,
    packageName: PLAYWRIGHT_MCP_PROFILE.packageName,
    packageVersion: PLAYWRIGHT_MCP_PROFILE.packageVersion,
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
      temporaryBrowserOutputRemoved: true,
    },
  }

  await writeFile(resultPath, JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ passed, checks, resultPath }))
  if (!passed) process.exitCode = 1
}

main().catch(async error => {
  const payload = {
    schemaVersion: 'playwright-mcp-live-acceptance-v1',
    passed: false,
    completedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : 'unknown acceptance failure',
  }
  try { await writeFile(resultPath, JSON.stringify(payload, null, 2)) } catch {}
  console.error(payload.error)
  process.exit(1)
})
