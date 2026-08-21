import assert from 'node:assert/strict'
import test from 'node:test'
import { decideCosTurnExperience } from '../lib/ai/cos/cognitiveTurnExperience.ts'

test('episodic turn evidence records injected-vs-cited utilization explicitly', () => {
  const decision = decideCosTurnExperience({
    prompt: 'Investigate intermittent production 500 errors read-only.',
    handled: true,
    confidence: 0.75,
    provenance: {
      responseSource: 'local_cos_reasoning',
      localModelInvoked: true,
      externalAiInvoked: false,
      reasonerLabel: 'managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B',
      knowledgeFactsCited: 0,
      learnedItemsCited: 0,
      enterpriseMemoriesCited: 0,
      userMemoriesCited: 0,
      cognitiveSkillsCited: 0,
      evidenceFunnel: {
        knowledgeGraph: { injected: 0 },
        learnedCorpus: { injected: 6 },
        enterpriseMemory: { injected: 3 },
        userMemory: { injected: 4 },
      },
      cognitiveSkillFunnel: { injected: 1 },
    },
  })

  const evidence = decision.evidence as Record<string, any>
  assert.equal(evidence.schemaVersion, 2)
  assert.deepEqual(evidence.utilization.learnedCorpus, {
    injected: 6,
    cited: 0,
    utilization: 0,
    unusedInjected: 6,
  })
  assert.deepEqual(evidence.utilization.enterpriseMemory, {
    injected: 3,
    cited: 0,
    utilization: 0,
    unusedInjected: 3,
  })
  assert.deepEqual(evidence.utilization.cognitiveSkills, {
    injected: 1,
    cited: 0,
    utilization: 0,
    unusedInjected: 1,
  })
})

test('utilization is null when nothing was injected, not falsely reported as zero performance', () => {
  const decision = decideCosTurnExperience({
    prompt: 'Explain a general concept.',
    handled: true,
    confidence: 0.74,
    provenance: {
      responseSource: 'local_cos_reasoning',
      localModelInvoked: true,
      externalAiInvoked: false,
      evidenceFunnel: {},
      cognitiveSkillFunnel: {},
    },
  })
  const evidence = decision.evidence as Record<string, any>
  assert.equal(evidence.utilization.knowledgeGraph.utilization, null)
  assert.equal(evidence.utilization.learnedCorpus.utilization, null)
})
