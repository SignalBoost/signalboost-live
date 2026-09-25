import { mkdir, writeFile } from 'node:fs/promises'
import { certifyMcpProvider } from '../../provider-hub-host/mcp-certification.ts'
import { createUniversalMcpGateway } from '../../provider-hub-host/universal-mcp-gateway.ts'
import {
  CONTEXT7_MCP_PROFILE,
  FIGMA_MCP_PROFILE,
  GITHUB_MCP_PROFILE,
  SUPABASE_MCP_PROFILE,
  VERCEL_MCP_PROFILE,
} from '../../provider-hub-host/universal-mcp-profiles.ts'

const checks: Array<{ name: string; passed: boolean; detail: string }> = []
const add = (name: string, passed: boolean, detail: string) => checks.push({ name, passed, detail })

async function run() {
  const gateway = createUniversalMcpGateway({
    tenantId: 'signalboost-live-acceptance',
    environmentId: 'github-actions',
    portableId: 'mcp-live-acceptance',
    actor: { userId: 'github-actions', roles: ['acceptance'] },
    allowedGitHubRepos: ['SignalBoost/signalboost-live'],
    audit: { async append() {} },
  })

  const context7Certification = await certifyMcpProvider(gateway, {
    providerId: 'context7-mcp',
    expectedCapabilities: CONTEXT7_MCP_PROFILE.tools.map(item => `mcp.context7-mcp.${item.capabilityName}`),
    probes: [{
      id: 'real_library_lookup',
      capabilityId: 'mcp.context7-mcp.library.resolve',
      args: { libraryName: 'next.js', query: 'App Router route handlers' },
      expect: { ok: true },
    }],
  })
  for (const item of context7Certification.checks) {
    add(`context7_certification_${item.id.replace(/[^a-z0-9_-]+/gi, '_')}`, item.passed, item.detail)
  }

  const githubCertification = await certifyMcpProvider(gateway, {
    providerId: 'github-mcp',
    // github.token is repository-scoped and the remote GitHub MCP omits
    // get_me/identity.read for this credential class. The runtime profile
    // still retains identity.read for user credentials.
    expectedCapabilities: GITHUB_MCP_PROFILE.tools
      .filter(item => item.capabilityName !== 'identity.read')
      .map(item => `mcp.github-mcp.${item.capabilityName}`),
    probes: [
      {
        id: 'private_repo_read',
        capabilityId: 'mcp.github-mcp.contents.read',
        args: { owner: 'SignalBoost', repo: 'signalboost-live', path: 'ONBOARD.md', ref: 'main' },
        expect: { ok: true },
      },
      {
        id: 'cross_repo_scope_rejected',
        capabilityId: 'mcp.github-mcp.contents.read',
        args: { owner: 'other', repo: 'repo', path: 'README.md', ref: 'main' },
        expect: { ok: false, errorIncludes: 'universal_mcp_github_repository_rejected' },
      },
    ],
  })
  for (const item of githubCertification.checks) {
    add(`github_certification_${item.id.replace(/[^a-z0-9_-]+/gi, '_')}`, item.passed, item.detail)
  }

  const supabaseCertification = await certifyMcpProvider(gateway, {
    providerId: 'supabase-mcp',
    expectedCapabilities: SUPABASE_MCP_PROFILE.tools.map(item => `mcp.supabase-mcp.${item.capabilityName}`),
    probes: [{
      id: 'real_project_table_read',
      capabilityId: 'mcp.supabase-mcp.tables.list',
      args: { schemas: ['public'] },
      expect: { ok: true },
    }],
  })
  for (const item of supabaseCertification.checks) {
    add(`supabase_certification_${item.id.replace(/[^a-z0-9_-]+/gi, '_')}`, item.passed, item.detail)
  }

  const figmaCertification = await certifyMcpProvider(gateway, {
    providerId: 'figma-mcp',
    expectedCapabilities: FIGMA_MCP_PROFILE.tools.map(item => `mcp.figma-mcp.${item.capabilityName}`),
    probes: [{
      id: 'authenticated_identity',
      capabilityId: 'mcp.figma-mcp.identity.read',
      args: {},
      expect: { ok: true },
    }],
  })
  for (const item of figmaCertification.checks) {
    add(`figma_certification_${item.id.replace(/[^a-z0-9_-]+/gi, '_')}`, item.passed, item.detail)
  }

  const vercelCertification = await certifyMcpProvider(gateway, {
    providerId: 'vercel-mcp',
    expectedCapabilities: VERCEL_MCP_PROFILE.tools.map(item => `mcp.vercel-mcp.${item.capabilityName}`),
    probes: [{
      id: 'project_details',
      capabilityId: 'mcp.vercel-mcp.project.read',
      args: {},
      expect: { ok: true },
    }],
  })
  for (const item of vercelCertification.checks) {
    add(`vercel_certification_${item.id.replace(/[^a-z0-9_-]+/gi, '_')}`, item.passed, item.detail)
  }

  const evidence = {
    schemaVersion: 'universal-mcp-live-acceptance-v4',
    observedAt: new Date().toISOString(),
    providers: gateway.readiness.map(item => ({
      providerId: item.providerId,
      configured: item.configured,
      reason: item.reason,
      authentication: item.authentication,
    })),
    certifications: [githubCertification, supabaseCertification, context7Certification, figmaCertification, vercelCertification],
    checks,
  }
  await mkdir('artifacts', { recursive: true })
  await writeFile('artifacts/universal-mcp-live-acceptance.json', JSON.stringify(evidence, null, 2) + '\n')

  for (const item of checks) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}: ${item.detail}`)
  const failed = checks.filter(item => !item.passed)
  if (failed.length) throw new Error(`universal_mcp_live_acceptance_failed:${failed.map(item => item.name).join(',')}`)
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
