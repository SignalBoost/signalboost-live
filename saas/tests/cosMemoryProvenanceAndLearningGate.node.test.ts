import assert from 'node:assert/strict'
import test from 'node:test'
import { authoritativeProvenance, formatAuthoritativeProvenance } from '../lib/ai/cos/cosOrchestration.ts'
import { gapStudyTerms, relevanceOf, sourceAwareRelevant, type LearningSourceDocument } from '../lib/cos-core/layers/learning/cycle.ts'
import type { KnowledgeGap } from '../lib/cos-core/layers/learning/index.ts'

test('enterprise memory is not aliased to knowledge graph and cached origin shows cited skills', () => {
  const cos = {
    confidence: 0.78,
    provenance: {
      responseSource: 'semantic_similarity',
      reasonerLabel: 'independent-local:qwen2.5-coder:32b',
      localModelInvoked: false,
      knowledgeFactsUsed: 0,
      learnedItemsUsed: 6,
      userMemoriesUsed: 0,
      cognitiveSkillsUsed: 1,
      evidenceFunnel: {
        knowledgeGraph: { retrieved: 0, relevant: 0, selected: 0, injected: 0, cited: 0 },
        learnedCorpus: { retrieved: 16, relevant: 13, selected: 6, injected: 0, cited: 0 },
        userMemory: { retrieved: 5, relevant: 0, selected: 0, injected: 0, cited: 0 },
      },
      cognitiveSkillFunnel: { retrieved: 1, relevant: 1, selected: 1, injected: 0, cited: 0 },
      cacheOrigin: {
        storedAt: '2026-08-13T16:39:14.902Z',
        policyVersion: '55f68ee3ad14',
        retrievedThisTurn: { facts: 0, learned: 16, memories: 5, skills: 1 },
        originEvidenceFunnel: {
          knowledgeGraph: { retrieved: 0, relevant: 0, selected: 0, injected: 0, cited: 0 },
          learnedCorpus: { retrieved: 16, relevant: 13, selected: 6, injected: 6, cited: 0 },
          userMemory: { retrieved: 5, relevant: 0, selected: 0, injected: 0, cited: 0 },
        },
        originCognitiveSkillFunnel: { retrieved: 1, relevant: 1, selected: 1, injected: 1, cited: 1 },
      },
    },
  }

  const provenance = authoritativeProvenance(cos, { invoked: false })
  assert.equal(provenance.enterprise_memory.used, false)
  assert.equal(provenance.enterprise_memory.retrieved_count, 0)
  assert.equal(provenance.knowledge_graph.retrieved_count, 0)
  const text = formatAuthoritativeProvenance(provenance, 'en')
  assert.match(text, /Enterprise Memory\s+: NOT USED — organization-scoped Enterprise Memory is not yet connected to COS Primary/)
  assert.match(text, /skills 1 injected\/1 cited/)
})

const POSTGRES_GAP: KnowledgeGap = {
  id: 'foundational:postgres:2',
  subject: 'PostgreSQL database performance multi tenant SaaS',
  question: 'How can pg_stat_statements, pg_stat_activity, wait events and buffer statistics distinguish query execution from pool wait latency?',
  portableIds: ['cos'],
  expectedReuse: 100,
  expectedAvoidedCostUsd: 10,
  urgency: 90,
  evidence: ['curriculum'],
}

function relevant(document: LearningSourceDocument): boolean {
  const terms = gapStudyTerms(POSTGRES_GAP)
  return sourceAwareRelevant(document, relevanceOf(document, terms), terms)
}

test('generic long scientific papers cannot enter PostgreSQL memory from scattered generic terms', () => {
  const unrelated: LearningSourceDocument = {
    sourceKind: 'scientific_journal',
    sourceUri: 'https://europepmc.org/article/PMC/example',
    sourceTitle: 'Cloud data provenance and multi-tenant infrastructure security',
    subject: POSTGRES_GAP.subject,
    text: 'This long research article studies cloud computing, database systems, multi-tenant infrastructure, security, data provenance, and performance management. '.repeat(20),
  }
  assert.equal(relevant(unrelated), false)
})

test('specific PostgreSQL diagnostic evidence still passes the learning gate', () => {
  const useful: LearningSourceDocument = {
    sourceKind: 'official_documentation',
    sourceUri: 'https://www.postgresql.org/docs/example',
    sourceTitle: 'PostgreSQL runtime statistics',
    subject: POSTGRES_GAP.subject,
    text: 'PostgreSQL pg_stat_statements records query execution time and buffer activity. pg_stat_activity exposes wait events. These observations distinguish database execution from connection pool wait latency without mutating production. '.repeat(8),
  }
  assert.equal(relevant(useful), true)
})
