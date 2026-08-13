import assert from 'node:assert/strict'
import test from 'node:test'
import { authoritativeProvenance, formatAuthoritativeProvenance } from '../lib/ai/cos/cosOrchestration.ts'

test('live state is appended without changing recorded per-answer usage flags', () => {
  const cos = {
    confidence: 0.78,
    provenance: {
      responseSource: 'semantic_similarity',
      localModelInvoked: false,
      reasonerLabel: 'independent-local:qwen2.5-coder:32b',
      knowledgeFactsUsed: 0,
      learnedItemsUsed: 0,
      enterpriseMemoriesUsed: 0,
      userMemoriesUsed: 0,
      cognitiveSkillsUsed: 0,
      evidenceFunnel: {
        knowledgeGraph: { retrieved: 0, relevant: 0, selected: 0, injected: 0, cited: 0 },
        learnedCorpus: { retrieved: 16, relevant: 13, selected: 6, injected: 0, cited: 0 },
        enterpriseMemory: { retrieved: 0, relevant: 0, selected: 0, injected: 0, cited: 0 },
        userMemory: { retrieved: 5, relevant: 0, selected: 0, injected: 0, cited: 0 },
      },
      cognitiveSkillFunnel: { retrieved: 1, relevant: 1, selected: 1, injected: 0, cited: 0 },
      cacheOrigin: {
        storedAt: '2026-08-13T16:39:14.902Z',
        policyVersion: 'legacy',
        retrievedThisTurn: { facts: 0, learned: 16, enterprise: 0, memories: 5, skills: 1 },
      },
      enterpriseMemoryStatus: 'connected_scope',
    },
  }
  const provenance = authoritativeProvenance(cos, { invoked: false }) as any
  provenance.live_system_state = {
    generatedAt: '2026-08-13T23:10:00.000Z',
    deployment: { environment: 'production', commitSha: 'abc123' },
    localReasoner: { configured: true, healthy: true, model: 'qwen2.5-coder:32b', error: null },
    enterpriseMemory: { status: 'connected_scope', organizationId: 'org-1', organizationRows: 1, intelligenceSnapshots: 1, repositorySnapshots: 0, campaignMemories: 0, confidenceHistory: 1, retrievableItems: 3, kinds: { organization: 1, intelligence: 1, confidence: 1 } },
    knowledgeGraph: { activeFacts: 17, quarantinedFacts: 2, latestUpdatedAt: '2026-08-13T22:00:00.000Z' },
    learnedCorpus: { total: 75, relevanceRejected: 12, bySourceKind: { scientific_journal: 62, video_transcript: 11, official_documentation: 1, benchmark_fixture: 1 }, latestObservedAt: '2026-08-13T16:20:52.216Z' },
    cognitiveSkills: { validated: 1, latestUpdatedAt: '2026-08-13T16:39:15.041Z' },
    cache: { semanticRecords: 8, exactRecords: 0 },
    userMemory: { available: true, records: 5 },
    lastTurnRecord: { source: 'cos-semantic-cache', updatedAt: '2026-08-13T22:24:06.644Z' },
  }
  const text = formatAuthoritativeProvenance(provenance, 'en')
  assert.match(text, /Learned Corpus\s+: NOT USED/)
  assert.match(text, /LIVE SYSTEM STATE — queried now/)
  assert.match(text, /Knowledge Graph\s+: 17 active; 2 quarantined/)
  assert.match(text, /Learned Corpus\s+: 75 total; 12 relevance-rejected/)
  assert.match(text, /Cache\s+: 8 semantic records; 0 exact records/)
})
