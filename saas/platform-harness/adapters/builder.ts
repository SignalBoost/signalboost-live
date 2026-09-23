// saas/platform-harness/adapters/builder.ts
//
// Builder is the first serious Residency workload. This profile requests only the
// practical capabilities needed to diagnose, repair in a branch/sandbox, and verify.
// Merge, Production deploy, raw SQL, migration application, and other consequential
// capabilities are intentionally absent.

import type {
  HarnessLimits,
  HarnessRunRequest,
} from '../core/types.ts'

export const BUILDER_RESIDENCY_CAPABILITIES = Object.freeze([
  'mcp.github-mcp.contents.read',
  'mcp.github-mcp.code.search',
  'mcp.github-mcp.commits.list',
  'mcp.github-mcp.commit.read',
  'mcp.github-mcp.branches.list',
  'mcp.github-mcp.pull_request.read',
  'mcp.github-mcp.branch.create',
  'mcp.github-mcp.contents.write',
  'mcp.github-mcp.pull_request.create',
  'mcp.vercel-mcp.project.read',
  'mcp.vercel-mcp.deployments.list',
  'mcp.vercel-mcp.deployment.read',
  'mcp.vercel-mcp.deployment_build_logs.read',
  'mcp.vercel-mcp.runtime_logs.read',
  'mcp.supabase-mcp.tables.list',
  'mcp.supabase-mcp.logs.query',
  'mcp.supabase-mcp.advisors.read',
  'browser.playwright-mcp.snapshot',
  'browser.playwright-mcp.screenshot',
  'browser.playwright-mcp.console',
  'browser.playwright-mcp.network.list',
  'browser.chrome-devtools-mcp.snapshot',
  'browser.chrome-devtools-mcp.screenshot',
  'browser.chrome-devtools-mcp.console.list',
  'browser.chrome-devtools-mcp.network.list',
  'browser.chrome-devtools-mcp.lighthouse',
] as const)

export function createBuilderResidencyHarnessRequest(input: {
  runId: string
  objective: string
  tenantId: string
  portableId: string
  agentId: string
  artifactId: string
  artifactHash: string
  artifactRevision?: string
  sandboxEnvironmentId: string
  fixtureHash?: string
  limits?: HarnessLimits
  /** Host-selected capability subset. Omit to use the broader governed Builder Residency catalog. */
  requestedCapabilities?: readonly string[]
}): HarnessRunRequest {
  return Object.freeze({
    runId: input.runId,
    objective: input.objective,
    identity: Object.freeze({
      agentId: input.agentId,
      role: 'builder',
      tenantId: input.tenantId,
      portableId: input.portableId,
      artifact: Object.freeze({
        artifactId: input.artifactId,
        artifactHash: input.artifactHash,
        ...(input.artifactRevision ? { revision: input.artifactRevision } : {}),
      }),
    }),
    profile: 'residency',
    environment: Object.freeze({
      environmentId: input.sandboxEnvironmentId,
      class: 'sandbox',
      ...(input.fixtureHash ? { fixtureHash: input.fixtureHash } : {}),
    }),
    requestedCapabilities: Object.freeze([...(input.requestedCapabilities ?? BUILDER_RESIDENCY_CAPABILITIES)]),
    requestedLimits: Object.freeze({
      maxToolCalls: 120,
      deadlineMs: 20 * 60_000,
      maxConcurrency: 1,
      ...(input.limits ?? {}),
    }),
  })
}
