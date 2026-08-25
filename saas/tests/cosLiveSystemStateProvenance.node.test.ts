// saas/tests/cosLiveSystemStateProvenance.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { authoritativeProvenance, formatAuthoritativeProvenance } from '../lib/ai/cos/cosOrchestration.ts'

test('provenance omits zero-activity components and preserves live state',()=>{
  const p:any={
    semantic_cache:{used:false,evidence_count:0},
    enterprise_memory:{used:false,retrieved_count:3,relevant_count:2,selected_count:2,injected_count:2,evidence_count:0},
    knowledge_graph:{used:false,retrieved_count:0,relevant_count:0,selected_count:0,injected_count:0,evidence_count:0},
    learned_corpus:{used:false,retrieved_count:16,relevant_count:13,selected_count:6,injected_count:6,evidence_count:0},
    cognitive_skills:{used:true,retrieved_count:1,relevant_count:1,selected_count:1,injected_count:1,evidence_count:1},
    user_memory:{used:false,retrieved_count:5,relevant_count:0,selected_count:0,injected_count:0,evidence_count:0},
    autonomous_research:{used:false,documents_acquired:0,new_knowledge_retained:0},
    local_reasoning:{invoked:true,model:'independent-local:qwen2.5-coder:32b',confidence:.78,threshold:.72},
    external_ai:{invoked:false,provider:null,model:null},answer_origin:{from_cache:false},
    live_system_state:{generatedAt:'now',deployment:{environment:'production',commitSha:'abc'},localReasoner:{configured:true,healthy:true,model:'qwen2.5-coder:32b'},enterpriseMemory:{status:'connected_scope',organizationId:'org',organizationRows:1,intelligenceSnapshots:1,repositorySnapshots:0,campaignMemories:0,confidenceHistory:1,retrievableItems:3,kinds:{}},knowledgeGraph:{activeFacts:17,quarantinedFacts:2},learnedCorpus:{total:75,relevanceRejected:12,bySourceKind:{}},cognitiveSkills:{validated:1},cache:{semanticRecords:8,exactRecords:1},userMemory:{available:true,records:5},lastTurnRecord:null}
  }
  const text=formatAuthoritativeProvenance(p,'en')
  assert.match(text,/Answer Origin/)
  assert.match(text,/FRESH — generated during this request/)
  assert.match(text,/Cognitive Skills/)
  assert.match(text,/Local Reasoning Engine/)
  assert.match(text,/Consulted but not material/)
  assert.match(text,/Enterprise Memory: 3 retrieved/)
  assert.match(text,/Learned Corpus: 16 retrieved/)
  assert.match(text,/Explicitly Not Used/)
  assert.match(text,/External Fallback \/ Teacher: NOT USED/)
  assert.match(text,/LIVE SYSTEM STATE — queried now/)
  assert.match(text,/Knowledge Graph\s+: 17 active; 2 quarantined/)
})

test('cache replay renders original lineage separately from current retrieval attempt',()=>{
  const p:any={
    semantic_cache:{used:true,evidence_count:1},
    enterprise_memory:{used:false,retrieved_count:3,relevant_count:0,selected_count:0,injected_count:0,evidence_count:0},
    knowledge_graph:{used:false,retrieved_count:2,relevant_count:0,selected_count:0,injected_count:0,evidence_count:0},
    learned_corpus:{used:false,retrieved_count:40,relevant_count:14,selected_count:6,injected_count:0,evidence_count:0},
    cognitive_skills:{used:false,retrieved_count:0,relevant_count:0,selected_count:0,injected_count:0,evidence_count:0},
    user_memory:{used:false,retrieved_count:0,relevant_count:0,selected_count:0,injected_count:0,evidence_count:0},
    autonomous_research:{used:false,documents_acquired:0,new_knowledge_retained:0},
    local_reasoning:{invoked:false,model:null,confidence:.78,threshold:.72},
    external_ai:{invoked:false,provider:null,model:null},
    answer_origin:{
      from_cache:true,
      stored_at:'2026-08-16T03:54:03.385Z',
      model:'qwen2.5-coder:32b',
      evidence_funnel:{
        learnedCorpus:{retrieved:40,relevant:14,selected:6,injected:6,cited:0},
        enterpriseMemory:{retrieved:3,relevant:0,selected:0,injected:0,cited:0},
        knowledgeGraph:{retrieved:2,relevant:0,selected:0,injected:0,cited:0},
        userMemory:{retrieved:0,relevant:0,selected:0,injected:0,cited:0},
      },
      cognitive_skill_funnel:{retrieved:0,relevant:0,selected:0,injected:0,cited:0},
    },
  }
  const text=formatAuthoritativeProvenance(p,'en')

  assert.match(text,/Answer Origin\s+: CACHE — written 2026-08-16T03:54:03\.385Z by qwen2\.5-coder:32b/)
  assert.match(text,/Original Lineage/)
  // Bare legacy model labels do not prove self-hosting, so the disclosure policy names this
  // original cached generator "Primary Reasoner" rather than "Local Reasoning Engine".
  assert.match(text,/Primary Reasoner\s+: INVOKED — qwen2\.5-coder:32b/)
  assert.match(text,/Learned Corpus\s+: 40 retrieved → 14 relevant → 6 selected → 6 injected → 0 cited/)
  assert.match(text,/Enterprise Memory\s+: 3 retrieved → 0 relevant → 0 selected → 0 injected → 0 cited/)
  assert.match(text,/Knowledge Graph\s+: 2 retrieved → 0 relevant → 0 selected → 0 injected → 0 cited/)
  assert.match(text,/COS Answer Confidence\s+: 0\.78 — threshold 0\.72 \(based on original lineage\)/)

  assert.match(text,/Current Retrieval Attempt/)
  assert.match(text,/Learned Corpus\s+: 40 retrieved → 14 relevant → 6 selected → 0 injected — NOT INJECTED into the cached answer/)
  assert.match(text,/Enterprise Memory\s+: 3 retrieved → 0 relevant → 0 selected → 0 injected — NOT INJECTED into the cached answer/)
  assert.match(text,/Knowledge Graph\s+: 2 retrieved → 0 relevant → 0 selected → 0 injected — NOT INJECTED into the cached answer/)

  assert.match(text,/Explicitly Not Used/)
  assert.match(text,/Autonomous Research: NOT USED/)
  assert.match(text,/Local Reasoning Engine \(current replay\): NOT USED/)
  assert.match(text,/External Fallback \/ Teacher \(current replay\): NOT USED/)
  assert.doesNotMatch(text,/Learned Corpus\s+: USED/)
})

test('cache replay omits current retrieval section when replay performed no retrieval',()=>{
  const p:any={
    semantic_cache:{used:true,evidence_count:1},
    enterprise_memory:{used:false,retrieved_count:0,relevant_count:0,selected_count:0,injected_count:0,evidence_count:0},
    knowledge_graph:{used:false,retrieved_count:0,relevant_count:0,selected_count:0,injected_count:0,evidence_count:0},
    learned_corpus:{used:false,retrieved_count:0,relevant_count:0,selected_count:0,injected_count:0,evidence_count:0},
    cognitive_skills:{used:false,retrieved_count:0,relevant_count:0,selected_count:0,injected_count:0,evidence_count:0},
    user_memory:{used:false,retrieved_count:0,relevant_count:0,selected_count:0,injected_count:0,evidence_count:0},
    autonomous_research:{used:false,documents_acquired:0,new_knowledge_retained:0},
    local_reasoning:{invoked:false,model:null,confidence:.81,threshold:.72},
    external_ai:{invoked:false,provider:null,model:null},
    answer_origin:{
      from_cache:true,
      stored_at:'2026-08-16T03:54:03.385Z',
      model:'qwen2.5-coder:32b',
      evidence_funnel:{
        learnedCorpus:{retrieved:12,relevant:8,selected:4,injected:4,cited:1},
        enterpriseMemory:{retrieved:0,relevant:0,selected:0,injected:0,cited:0},
        knowledgeGraph:{retrieved:0,relevant:0,selected:0,injected:0,cited:0},
        userMemory:{retrieved:0,relevant:0,selected:0,injected:0,cited:0},
      },
    },
  }
  const text=formatAuthoritativeProvenance(p,'en')
  assert.match(text,/Original Lineage/)
  assert.doesNotMatch(text,/Current Retrieval Attempt/)
})

test('authoritative cache replay telemetry zeroes current injection while preserving origin injection',()=>{
  const provenance=authoritativeProvenance({
    confidence:.78,
    provenance:{
      responseSource:'semantic_cache',
      reasonerLabel:'qwen2.5-coder:32b',
      localModelInvoked:false,
      evidenceFunnel:{
        learnedCorpus:{retrieved:40,relevant:14,selected:6,injected:6,cited:0},
        enterpriseMemory:{retrieved:3,relevant:0,selected:0,injected:0,cited:0},
        knowledgeGraph:{retrieved:2,relevant:0,selected:0,injected:0,cited:0},
        userMemory:{retrieved:0,relevant:0,selected:0,injected:0,cited:0},
      },
      cacheOrigin:{
        storedAt:'2026-08-16T03:54:03.385Z',
        retrievedThisTurn:{learned:40,enterprise:3,facts:2,memories:0,skills:0},
        originEvidenceFunnel:{
          learnedCorpus:{retrieved:40,relevant:14,selected:6,injected:6,cited:0},
          enterpriseMemory:{retrieved:3,relevant:0,selected:0,injected:0,cited:0},
          knowledgeGraph:{retrieved:2,relevant:0,selected:0,injected:0,cited:0},
          userMemory:{retrieved:0,relevant:0,selected:0,injected:0,cited:0},
        },
      },
    },
  },{invoked:false}) as any

  assert.equal(provenance.semantic_cache.used,true)
  assert.equal(provenance.learned_corpus.retrieved_count,40)
  assert.equal(provenance.learned_corpus.selected_count,6)
  assert.equal(provenance.learned_corpus.injected_count,0)
  assert.equal(provenance.learned_corpus.evidence_count,0)
  assert.equal(provenance.learned_corpus.used,false)
  assert.equal(provenance.answer_origin.evidence_funnel.learnedCorpus.injected,6)
  assert.equal(provenance.answer_origin.evidence_funnel.learnedCorpus.cited,0)
})
