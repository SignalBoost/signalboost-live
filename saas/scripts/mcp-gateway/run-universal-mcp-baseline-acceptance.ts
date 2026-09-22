import { mkdir, writeFile } from 'node:fs/promises'
import { certifyMcpProvider } from '../../provider-hub-host/mcp-certification.ts'
import { createUniversalMcpGateway } from '../../provider-hub-host/universal-mcp-gateway.ts'
import {
  CONTEXT7_MCP_PROFILE,
  GITHUB_MCP_PROFILE,
} from '../../provider-hub-host/universal-mcp-profiles.ts'

async function run() {
  const gateway = createUniversalMcpGateway({
    tenantId: 'signalboost-live-baseline-acceptance',
    environmentId: 'github-actions',
    portableId: 'mcp-baseline-live-acceptance',
    actor: { userId: 'github-actions', roles: ['acceptance'] },
    allowedGitHubRepos: ['SignalBoost/signalboost-live'],
    audit: { async append() {} },
  })

  const context7 = await certifyMcpProvider(gateway, {
    providerId: 'context7-mcp',
    expectedCapabilities: CONTEXT7_MCP_PROFILE.tools.map(item => `mcp.context7-mcp.${item.capabilityName}`),
    probes: [{
      id: 'real_library_lookup',
      capabilityId: 'mcp.context7-mcp.library.resolve',
      args: { libraryName: 'next.js', query: 'App Router route handlers' },
      expect: { ok: true },
    }],
  })

  const github = await certifyMcpProvider(gateway, {
    providerId: 'github-mcp',
    expectedCapabilities: GITHUB_MCP_PROFILE.tools.map(item => `mcp.github-mcp.${item.capabilityName}`),
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

  const certifications = [github, context7]
  const checks = certifications.flatMap(report =>
    report.checks.map(check => ({
      providerId: report.providerId,
      id: check.id,
      passed: check.passed,
      detail: check.detail,
    })),
  )

  const evidence = {
    schemaVersion: 'universal-mcp-baseline-live-acceptance-v1',
    observedAt: new Date().toISOString(),
    scope: ['github-mcp', 'context7-mcp'],
    excludedPendingProviders: {
      'supabase-mcp': 'repository_credential_required',
      'figma-mcp': 'provider_client_approval_required',
      'vercel-mcp': 'repository_credential_required',
    },
    certifications,
    checks,
  }

  await mkdir('artifacts', { recursive: true })
  await writeFile('artifacts/universal-mcp-baseline-live-acceptance.json', JSON.stringify(evidence, null, 2) + '\n')

  for (const check of checks) {
    console.log(`${check.passed ? 'PASS' : 'FAIL'} ${check.providerId} ${check.id}: ${check.detail}`)
  }
  if (certifications.some(item => !item.passed)) {
    throw new Error('universal_mcp_baseline_live_acceptance_failed')
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
