import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  AgentRequest,
  ConsequenceClass,
  GatewayHost,
  GovernancePolicy,
} from '../agent-gateway/types.ts'
import {
  createPortableCapabilityDescriptor,
  type PortableCapabilityDiscoveryPort,
} from '../provider-hub-core/capability-runtime.ts'
import {
  BUILDER_RESIDENCY_CAPABILITIES,
  adaptResidencyRunToUniversity,
  createBuilderResidencyHarnessRequest,
  createGovernedHarnessExecutor,
  createProviderHubHarnessCapabilityResolver,
  createSelfHealingHandoff,
  resolveHarnessManifest,
  runHarnessWorker,
  type HarnessAuthorityEnvelope,
  type HarnessManifest,
  type HarnessRunResult,
  type HarnessWorkerContext,
} from '../platform-harness/index.ts'

const hash = (char: string) => char.repeat(64)

const authority: HarnessAuthorityEnvelope = {
  manifestRef: 'referee://harness/runtime-1',
  verified: true,
  verifiedBy: 'referee',
  environments: ['sandbox'],
  capabilities: [
    {
      id: 'mcp.github-mcp.contents.read',
      environments: ['sandbox'],
      mutating: false,
      risk: 'read',
      scopes: ['repository.read'],
    },
    {
      id: 'mcp.github-mcp.contents.write',
      environments: ['sandbox'],
      mutating: true,
      risk: 'write',
      scopes: ['repository.write'],
    },
  ],
  limits: { maxToolCalls: 5, deadlineMs: 60_000, maxConcurrency: 1 },
}

function request(capabilities = ['mcp.github-mcp.contents.read']) {
  return {
    runId: 'harness-runtime-test-1',
    objective: 'inspect a controlled repository fixture',
    identity: {
      agentId: 'builder-resident-1',
      role: 'builder',
      tenantId: 'tenant-1',
      portableId: 'builder',
      artifact: {
        artifactId: 'artifact-1',
        artifactHash: hash('a'),
        revision: 'revision-1',
      },
    },
    profile: 'residency' as const,
    environment: { environmentId: 'sandbox-1', class: 'sandbox' as const },
    requestedCapabilities: capabilities,
    requestedLimits: { maxToolCalls: 2, deadlineMs: 30_000, maxConcurrency: 1 },
  }
}

function discovery(
  descriptors: ReturnType<typeof createPortableCapabilityDescriptor>[],
): PortableCapabilityDiscoveryPort {
  return {
    async discover(input) {
      return descriptors.filter(item =>
        item.tenantId === input.tenantId &&
        item.environmentId === input.environmentId)
    },
  }
}

const githubRead = createPortableCapabilityDescriptor({
  capabilityId: 'mcp.github-mcp.contents.read',
  providerId: 'github-mcp',
  connectionId: 'github-mcp:sandbox-1',
  tenantId: 'tenant-1',
  environmentId: 'sandbox-1',
  risk: 'read',
  availability: 'available',
  requiresApproval: false,
  scopes: ['repository.read'],
})

const githubWrite = createPortableCapabilityDescriptor({
  capabilityId: 'mcp.github-mcp.contents.write',
  providerId: 'github-mcp',
  connectionId: 'github-mcp:sandbox-1',
  tenantId: 'tenant-1',
  environmentId: 'sandbox-1',
  risk: 'write',
  availability: 'available',
  requiresApproval: true,
  scopes: ['repository.write'],
})

test('Provider Hub supply is required in addition to profile and authority', async () => {
  const policy = resolveHarnessManifest(request(), authority)
  assert.equal(policy.allowed, true)
  if (!policy.allowed) return

  const resolver = createProviderHubHarnessCapabilityResolver(discovery([]))
  const resolution = await resolver.resolve(policy.manifest)

  assert.equal(resolution.satisfied, false)
  assert.deepEqual(resolution.missing, ['mcp.github-mcp.contents.read'])
})

test('Provider Hub resolver preserves exact tenant/environment assignment and risk ceiling', async () => {
  const policy = resolveHarnessManifest(request(), authority)
  assert.equal(policy.allowed, true)
  if (!policy.allowed) return

  const resolver = createProviderHubHarnessCapabilityResolver(discovery([githubRead, githubWrite]))
  const resolution = await resolver.resolve(policy.manifest)

  assert.equal(resolution.satisfied, true)
  assert.equal(resolution.resolved['mcp.github-mcp.contents.read']?.providerId, 'github-mcp')

  const wrongTenant = {
    ...policy.manifest,
    identity: { ...policy.manifest.identity, tenantId: 'tenant-2' },
  }
  assert.equal((await resolver.resolve(wrongTenant)).satisfied, false)
})

test('consequential Provider Hub capability requires explicit consequential authority', async () => {
  const consequential = createPortableCapabilityDescriptor({
    capabilityId: 'mcp.github-mcp.pull_request.merge',
    providerId: 'github-mcp',
    connectionId: 'github-mcp:sandbox-1',
    tenantId: 'tenant-1',
    environmentId: 'sandbox-1',
    risk: 'consequential',
    availability: 'available',
    requiresApproval: true,
    scopes: ['repository.merge'],
  })
  const writeOnlyAuthority: HarnessAuthorityEnvelope = {
    ...authority,
    capabilities: [{
      id: 'mcp.github-mcp.pull_request.merge',
      environments: ['sandbox'],
      mutating: true,
      risk: 'write',
      scopes: ['repository.merge'],
    }],
  }
  const policy = resolveHarnessManifest(
    request(['mcp.github-mcp.pull_request.merge']),
    writeOnlyAuthority,
  )
  assert.equal(policy.allowed, true)
  if (!policy.allowed) return

  const resolution = await createProviderHubHarnessCapabilityResolver(
    discovery([consequential]),
  ).resolve(policy.manifest)

  assert.equal(resolution.satisfied, false)
  assert.deepEqual(resolution.missing, ['mcp.github-mcp.pull_request.merge'])
})

test('Harness worker composes Provider Hub, Governed Socket, trajectory and verification', async () => {
  const policy = resolveHarnessManifest(request(), authority)
  assert.equal(policy.allowed, true)
  if (!policy.allowed) return

  let performed = 0
  const gatewayPolicy: GovernancePolicy = {
    classifier: {
      classify(): ConsequenceClass {
        return 'reversible_internal'
      },
    },
    allowlist: [{
      actionKind: 'read',
      target: 'mcp.github-mcp.contents.read',
      rollback: 'no-op',
    }],
  }
  const host: GatewayHost = {
    execution: {
      async perform(agentRequest: AgentRequest) {
        performed += 1
        return { ok: true, result: { path: agentRequest.action.params?.path ?? null } }
      },
    },
  }

  const result = await runHarnessWorker({
    manifest: policy.manifest,
    capabilities: createProviderHubHarnessCapabilityResolver(discovery([githubRead])),
    executor: createGovernedHarnessExecutor({ policy: gatewayPolicy, host }),
    worker: {
      async run(context) {
        const action = await context.execute({
          actionId: 'read-1',
          kind: 'read',
          capabilityId: 'mcp.github-mcp.contents.read',
          params: { path: 'saas/package.json' },
        })
        assert.equal(action.status, 'executed')
        context.observe({
          summary: 'Repository manifest was observed through the governed capability.',
          evidenceRefs: ['evidence://github/read-1'],
        })
      },
    },
    verifier: {
      async verify(input) {
        assert.equal(input.actionResults.length, 1)
        return {
          verified: true,
          verifierRef: 'verifier://builder-fixture-1',
          evidenceRefs: ['evidence://verified/builder-1'],
        }
      },
    },
  })

  assert.equal(performed, 1)
  assert.equal(result.outcome.status, 'success')
  assert.equal(result.authorityExpanded, false)
  assert.ok(result.trajectory.some(event => event.kind === 'capability_resolved'))
  assert.ok(result.trajectory.some(event => event.kind === 'verification'))
})

test('independent verifier routes competency vs infrastructure failure', async () => {
  const policy = resolveHarnessManifest(request(), authority)
  assert.equal(policy.allowed, true)
  if (!policy.allowed) return

  const gatewayPolicy: GovernancePolicy = {
    classifier: { classify: () => 'reversible_internal' as const },
    allowlist: [{
      actionKind: 'read',
      target: 'mcp.github-mcp.contents.read',
      rollback: 'no-op',
    }],
  }
  const host: GatewayHost = {
    execution: { async perform() { return { ok: true, result: { ok: true } } } },
  }
  const executor = createGovernedHarnessExecutor({ policy: gatewayPolicy, host })
  const capabilities = createProviderHubHarnessCapabilityResolver(discovery([githubRead]))
  const worker = {
    async run(context: HarnessWorkerContext) {
      await context.execute({
        actionId: 'read-1',
        kind: 'read',
        capabilityId: 'mcp.github-mcp.contents.read',
      })
    },
  }

  const competency = await runHarnessWorker({
    manifest: policy.manifest,
    capabilities,
    executor,
    worker,
    verifier: {
      async verify() {
        return {
          verified: false,
          verifierRef: 'verifier://competency',
          evidenceRefs: ['evidence://competency-failure'],
          failureAttribution: 'competency',
        }
      },
    },
  })
  assert.equal(competency.outcome.status, 'agent_failure')

  const infrastructure = await runHarnessWorker({
    manifest: { ...policy.manifest, runId: 'harness-runtime-test-2' },
    capabilities,
    executor,
    worker,
    verifier: {
      async verify() {
        return {
          verified: false,
          verifierRef: 'verifier://infrastructure',
          evidenceRefs: ['evidence://infra-failure'],
          failureAttribution: 'infrastructure',
        }
      },
    },
  })
  assert.equal(infrastructure.outcome.status, 'infrastructure_failure')
})

test('University adapter accepts practical Residency evidence before final examinations', () => {
  const decision = resolveHarnessManifest(request(), authority)
  assert.equal(decision.allowed, true)
  if (!decision.allowed) return

  const result: HarnessRunResult = {
    runId: decision.manifest.runId,
    profile: 'residency',
    trajectory: [{
      runId: decision.manifest.runId,
      sequence: 1,
      at: '2026-09-22T22:00:00Z',
      kind: 'verification',
      summary: 'Independent practical outcome verified.',
      evidenceRefs: ['evidence://practice-1'],
    }],
    outcome: {
      status: 'success',
      verifierRef: 'verifier://practice-1',
      evidenceHash: 'evidence://practice-1',
    },
    authorityExpanded: false,
    productionMutationObserved: false,
  }

  const adapted = adaptResidencyRunToUniversity(decision.manifest, result, {
    candidateId: 'mass:test:0123456789abcdef',
    subjectId: 'computer_science_coding',
    caseFamily: 'broken_deployment',
    variantHash: hash('b'),
    competencyId: 'root_cause_diagnosis',
    requestedState: 'demonstrated',
    finalExamMaterialUsed: false,
  })

  assert.equal(adapted.accepted, true)
  assert.equal(adapted.route, 'competency_evidence')
  assert.equal(adapted.promotionAuthorized, false)
  assert.equal(adapted.productionTrafficAuthorized, false)

  const hiddenExam = adaptResidencyRunToUniversity(decision.manifest, result, {
    candidateId: 'mass:test:0123456789abcdef',
    subjectId: 'computer_science_coding',
    caseFamily: 'broken_deployment',
    variantHash: hash('b'),
    competencyId: 'root_cause_diagnosis',
    requestedState: 'demonstrated',
    finalExamMaterialUsed: true,
  })
  assert.equal(hiddenExam.accepted, false)
  assert.ok(hiddenExam.blockers.includes('university_residency_final_exam_material_forbidden'))
})

test('Self-Healing adapter receives only infrastructure failures', () => {
  const decision = resolveHarnessManifest(request(), authority)
  assert.equal(decision.allowed, true)
  if (!decision.allowed) return
  const manifest: HarnessManifest = decision.manifest

  const infra: HarnessRunResult = {
    runId: manifest.runId,
    profile: manifest.profile,
    trajectory: [{
      runId: manifest.runId,
      sequence: 1,
      at: '2026-09-22T22:00:00Z',
      kind: 'failure',
      summary: 'Provider unavailable.',
      evidenceRefs: ['evidence://provider-down'],
    }],
    outcome: { status: 'infrastructure_failure', failureCode: 'provider_unavailable' },
    authorityExpanded: false,
    productionMutationObserved: false,
  }
  assert.equal(createSelfHealingHandoff(manifest, infra)?.failureCode, 'provider_unavailable')

  const competency = {
    ...infra,
    outcome: { status: 'agent_failure' as const, failureCode: 'wrong_diagnosis' },
  }
  assert.equal(createSelfHealingHandoff(manifest, competency), null)
})

test('Builder Residency excludes consequential Production authority', () => {
  const forbidden = [
    'mcp.github-mcp.pull_request.merge',
    'mcp.github-mcp.actions.trigger',
    'mcp.supabase-mcp.sql.execute',
    'mcp.supabase-mcp.migration.apply',
    'mcp.supabase-mcp.edge_function.deploy',
  ]
  for (const capability of forbidden) {
    assert.equal(BUILDER_RESIDENCY_CAPABILITIES.includes(capability as never), false)
  }

  const builder = createBuilderResidencyHarnessRequest({
    runId: 'builder-residency-1',
    objective: 'repair a broken sandbox deployment',
    tenantId: 'tenant-1',
    portableId: 'builder',
    agentId: 'builder-resident-1',
    artifactId: 'artifact-1',
    artifactHash: hash('c'),
    sandboxEnvironmentId: 'sandbox-1',
  })
  assert.equal(builder.profile, 'residency')
  assert.equal(builder.environment.class, 'sandbox')
})
