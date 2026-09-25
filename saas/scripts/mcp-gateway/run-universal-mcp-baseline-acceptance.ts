import { mkdir, writeFile } from 'node:fs/promises'
import { MCP_PROVIDER_CERTIFICATION_VERSION, certifyMcpProvider } from '../../provider-hub-host/mcp-certification.ts'
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

  // The workflow uses GitHub's repository-scoped Actions token. The remote MCP
  // deliberately does not advertise get_me/identity.read for that credential,
  // so CI certifies the repository capabilities it is actually authorized to use.
  // Runtime user credentials still retain identity.read in GITHUB_MCP_PROFILE.
  const githubReadCapabilities = GITHUB_MCP_PROFILE.tools
    .filter(item => item.risk === 'read' && item.capabilityName !== 'identity.read')
    .map(item => `mcp.github-mcp.${item.capabilityName}`)
    .sort()
  const githubReadiness = gateway.readiness.find(item => item.providerId === 'github-mcp')
  const githubVisible = githubReadiness?.configured ? await gateway.discover('github-mcp') : []
  const githubVisibleIds = new Set(githubVisible.map(item => item.capabilityId))
  const missingGithubReads = githubReadCapabilities.filter(id => !githubVisibleIds.has(id))
  const githubChecks: Array<{ id: string; passed: boolean; detail: string }> = [
    {
      id: 'readiness',
      passed: githubReadiness?.configured === true,
      detail: githubReadiness?.configured ? 'configured=true' : `configured=false;reason=${githubReadiness?.reason || 'missing'}`,
    },
    {
      id: 'read_projection_complete',
      passed: missingGithubReads.length === 0,
      detail: `expected_read=${githubReadCapabilities.length};missing_read=${missingGithubReads.length};missing=${missingGithubReads.join(',') || 'none'}`,
    },
  ]

  const privateRead = await gateway.invoke({
    serverId: 'github-mcp',
    capabilityId: 'mcp.github-mcp.contents.read',
    args: { owner: 'SignalBoost', repo: 'signalboost-live', path: 'ONBOARD.md', ref: 'main' },
  })
  githubChecks.push({
    id: 'probe:private_repo_read',
    passed: privateRead.ok === true,
    detail: `ok_match=${privateRead.ok === true}`,
  })

  const crossRepo = await gateway.invoke({
    serverId: 'github-mcp',
    capabilityId: 'mcp.github-mcp.contents.read',
    args: { owner: 'other', repo: 'repo', path: 'README.md', ref: 'main' },
  })
  const crossRepoRejected = crossRepo.ok === false && String(crossRepo.error || '').includes('universal_mcp_github_repository_rejected')
  githubChecks.push({
    id: 'probe:cross_repo_scope_rejected',
    passed: crossRepoRejected,
    detail: `rejected=${crossRepoRejected}`,
  })

  const github = {
    schemaVersion: MCP_PROVIDER_CERTIFICATION_VERSION,
    providerId: 'github-mcp',
    passed: githubChecks.every(item => item.passed),
    checks: githubChecks,
  }

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
      'vercel-mcp': 'provider_client_approval_required',
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
