// saas/tests/webKnowledgeHarness.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WEB_KNOWLEDGE_RESEARCH_CAPABILITY,
  WEB_KNOWLEDGE_RESEARCH_SCOPE,
  createCosProductionIngressManifest,
  createNativeWebKnowledgeCapabilityResolver,
  createWebKnowledgeCapabilityGrant,
  createWebKnowledgeResearchPort,
  runWebKnowledgeResearchProductionHarness,
} from '../platform-harness/index.ts'

test('web knowledge is a read-only capability and never grants learning or training authority', async () => {
  const grant = createWebKnowledgeCapabilityGrant(['production'])
  assert.equal(grant.id, WEB_KNOWLEDGE_RESEARCH_CAPABILITY)
  assert.equal(grant.mutating, false)
  assert.equal(grant.risk, 'read')
  assert.deepEqual(grant.scopes, [WEB_KNOWLEDGE_RESEARCH_SCOPE])

  const research = createWebKnowledgeResearchPort({
    search: async () => [{
      uri: 'https://example.edu/research',
      title: 'Research source',
      text: 'A sufficiently useful research extract.',
      observedAt: '2026-09-24T12:00:00.000Z',
      license: 'rights_status=reference_only',
      evidence: ['source_class=institutional'],
    }],
  })
  const rows = await research.search({
    query: 'research question',
    purpose: 'university_research',
    maxResults: 2,
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.purpose, 'university_research')
  assert.equal(rows[0]?.durableLearningAuthorized, false)
  assert.equal(rows[0]?.trainingAuthorized, false)
  assert.equal(rows[0]?.rightsEvidence, 'rights_status=reference_only')
  assert.ok(rows[0]?.evidence.includes('web_knowledge_acquisition=research_only_v1'))
})

test('COS parent Harness can carry web research only as the exact read scope', async () => {
  const manifest = createCosProductionIngressManifest({
    runId: 'cos-web-research-parent',
    objective: 'research evidence',
    tenantId: 'itmounts',
    requestedCapabilities: [WEB_KNOWLEDGE_RESEARCH_CAPABILITY],
  })

  assert.equal(manifest.capabilities.length, 1)
  assert.equal(manifest.capabilities[0]?.id, WEB_KNOWLEDGE_RESEARCH_CAPABILITY)
  assert.equal(manifest.capabilities[0]?.mutating, false)
  assert.equal(manifest.capabilities[0]?.risk, 'read')
  assert.deepEqual(manifest.capabilities[0]?.scopes, [WEB_KNOWLEDGE_RESEARCH_SCOPE])

  const resolver = createNativeWebKnowledgeCapabilityResolver({
    tenantId: 'itmounts',
    environmentId: 'itmounts-production',
    portableId: 'cos',
  })
  const resolution = await resolver.resolve(manifest)
  assert.equal(resolution.satisfied, true)
  assert.ok(resolution.resolved[WEB_KNOWLEDGE_RESEARCH_CAPABILITY])
})

test('governed Production web research returns evidence without Production mutation', async () => {
  const evidence: any[] = []
  const research = createWebKnowledgeResearchPort({
    search: async () => [{
      uri: 'https://example.gov/current-guidance',
      title: 'Current guidance',
      text: 'Current public evidence for the research objective.',
      evidence: ['source_class=owning_authority'],
    }],
  })

  const outcome = await runWebKnowledgeResearchProductionHarness({
    query: 'current guidance',
    purpose: 'agent_research',
    tenantId: 'itmounts',
    portableId: 'research-specialist',
    agentId: 'research-specialist',
    role: 'research_specialist',
    evidenceSink: { async append(record) { evidence.push(record) } },
    research,
    runId: 'web-knowledge-harness-test',
  })

  assert.equal(outcome.ok, true)
  if (!outcome.ok) return
  assert.equal(outcome.results.length, 1)
  assert.equal(outcome.results[0]?.trainingAuthorized, false)
  assert.equal(evidence.length, 1)
  assert.equal(evidence[0]?.outcomeStatus, 'success')
  assert.equal(evidence[0]?.productionMutationObserved, false)
})

test('web knowledge resolver fails closed when the manifest did not authorize the capability', async () => {
  const manifest = createCosProductionIngressManifest({
    runId: 'cos-web-research-missing',
    objective: 'answer without tools',
    tenantId: 'itmounts',
  })
  const resolver = createNativeWebKnowledgeCapabilityResolver({
    tenantId: 'itmounts',
    environmentId: 'itmounts-production',
    portableId: 'cos',
  })
  const resolution = await resolver.resolve(manifest)
  assert.equal(resolution.satisfied, false)
  assert.deepEqual(resolution.missing, [WEB_KNOWLEDGE_RESEARCH_CAPABILITY])
})

test('empty or failed first governed discovery retries a simpler query without granting training', async () => {
  const attempted: string[] = []
  const research = createWebKnowledgeResearchPort({
    search: async (query) => {
      attempted.push(query)
      if (attempted.length === 1) throw new Error('transient_search_provider_error')
      return [{
        uri: 'https://example.gov/verified',
        title: 'Verified public source',
        text: 'Authoritative source material available on the retry.',
        evidence: ['source_class=institutional'],
      }]
    },
  })
  const rows = await research.search({
    query: 'Who is the current official responsible for this office?',
    purpose: 'agent_research',
    maxResults: 3,
  })
  assert.equal(attempted.length, 2)
  assert.notEqual(attempted[0], attempted[1])
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.trainingAuthorized, false)
  assert.equal(rows[0]?.durableLearningAuthorized, false)
})

test('governed discovery retries a zero-result first attempt', async () => {
  let calls = 0
  const research = createWebKnowledgeResearchPort({
    search: async () => {
      calls++
      return calls === 1 ? [] : [{
        uri: 'https://example.edu/answer',
        title: 'Second-source answer',
        text: 'Sufficient evidence for the live answer.',
      }]
    },
  })
  const rows = await research.search({
    query: 'What is the current public status of the requested system?',
    purpose: 'live_reference',
  })
  assert.equal(calls, 2)
  assert.equal(rows.length, 1)
})
