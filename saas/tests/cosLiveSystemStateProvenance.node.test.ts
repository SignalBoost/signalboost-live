import assert from 'node:assert/strict'
import test from 'node:test'
import { formatAuthoritativeProvenance } from '../lib/ai/cos/cosOrchestration.ts'

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
  assert.match(text,/Cognitive Skills/)
  assert.match(text,/Local Reasoning Engine/)
  assert.match(text,/Consulted but not material/)
  assert.match(text,/Enterprise Memory: 3 retrieved/)
  assert.match(text,/Learned Corpus: 16 retrieved/)
  assert.doesNotMatch(text,/NOT USED/)
  assert.doesNotMatch(text,/External AI Provider/)
  assert.match(text,/LIVE SYSTEM STATE — queried now/)
  assert.match(text,/Knowledge Graph\s+: 17 active; 2 quarantined/)
})
