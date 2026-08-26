import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { COS_GENERAL_REASONING_DISCIPLINE } from '../lib/ai/cos/cosGeneralReasoningDiscipline.ts'
import {
  COS_BEHAVIORAL_CONTRACT,
  COS_BEHAVIORAL_CONTRACT_VERSION,
  COS_DECISION_PRIORITY,
} from '../lib/ai/cos/cosBehavioralContract.ts'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')

test('COS behavioral contract is versioned and preserves the owner-defined decision priority', () => {
  assert.equal(COS_BEHAVIORAL_CONTRACT_VERSION, 'cos-behavioral-contract-v1')
  assert.deepEqual(COS_DECISION_PRIORITY, ['safety', 'accuracy', 'autonomy', 'speed', 'cost', 'convenience'])
  assert.match(COS_BEHAVIORAL_CONTRACT, /safety first, then accuracy, then autonomy, then speed, then cost, then convenience/i)
})

test('COS behavioral contract requires challenge, proactive completion, evidence and uncertainty discipline', () => {
  const rule = COS_BEHAVIORAL_CONTRACT
  assert.match(rule, /Do not blindly agree/i)
  assert.match(rule, /at least one concrete example/i)
  assert.match(rule, /Pursue tasks end-to-end/i)
  assert.match(rule, /Be proactive rather than merely reactive/i)
  assert.match(rule, /strongest available current evidence path/i)
  assert.match(rule, /continue searching or validating/i)
  assert.match(rule, /best-supported answer available/i)
  assert.match(rule, /When sources conflict/i)
})

test('COS behavioral contract governs learning, knowledge lifecycle, privacy and repository awareness', () => {
  const rule = COS_BEHAVIORAL_CONTRACT
  assert.match(rule, /Learning must be purpose-driven/i)
  assert.match(rule, /Knowledge age alone is not a reason to discard it/i)
  assert.match(rule, /weakened, quarantined, replaced, or forgotten/i)
  assert.match(rule, /Minimize private or confidential information/i)
  assert.match(rule, /inspect the current repository and canonical onboarding/i)
  assert.match(rule, /Do not ask a human for information that the repository, documentation, telemetry, or live evidence can answer/i)
})

test('COS behavioral contract preserves human control for consequential decisions', () => {
  const rule = COS_BEHAVIORAL_CONTRACT
  assert.match(rule, /Consequential actions must remain behind deterministic human-approval governance/i)
  assert.match(rule, /Never treat model confidence as permission to bypass an approval gate/i)
  assert.match(rule, /safety, financial, legal, privacy, security, destructive, external-effect, irreversible, or major platform-impact decisions/i)

  const governance = read('../agent-gateway/governance.ts')
  const types = read('../agent-gateway/types.ts')
  assert.match(governance, /money \/ safety \/ data \/ external \/ unknown are ALWAYS human-gated/i)
  assert.match(governance, /reversible_internal action, explicitly listed, with a rollback/i)
  assert.match(governance, /Default — halt/i)
  assert.match(types, /'financial', 'safety', 'data_destructive', 'external_effect', 'unknown'/)
})

test('global reasoning guidance includes the COS behavioral contract and does not smuggle an unvalidated ambiguity skill into live prompts', () => {
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /COS BEHAVIORAL CONTRACT cos-behavioral-contract-v1/i)
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /do not invent missing context/i)
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /validated cognitive-skill path/i)
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /do not expose hidden scratchpad or chain-of-thought/i)
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /strict JSON/i)
  assert.doesNotMatch(COS_GENERAL_REASONING_DISCIPLINE, /ask one concise clarification/i)
  assert.doesNotMatch(COS_GENERAL_REASONING_DISCIPLINE, /unresolved referents/i)
  assert.doesNotMatch(COS_GENERAL_REASONING_DISCIPLINE, /comparison baselines/i)
})

test('scenario strategy advice keeps supplied metrics separate from modeled outcomes', () => {
  const rule = COS_GENERAL_REASONING_DISCIPLINE
  assert.match(rule, /supplied metrics as premises, not as permission to invent downstream outcomes/i)
  assert.match(rule, /Do not infer competitor losses, insolvency, bankruptcy, product-market-fit deadlines, market shifts/i)
  assert.match(rule, /Do not assign probability or impact labels such as low-probability, high-probability, high-impact, existential, or survival-critical/i)
  assert.match(rule, /Cash exhaustion, revenue change, funding timing, profitability timing, and runway extension require the relevant financial mechanics/i)
  assert.match(rule, /fixed-cohort illustration from a forecast of total users, revenue, or runway/i)
  assert.match(rule, /do not silently assume zero acquisition, constant pricing, constant burn, or unchanged cohort mix/i)
  assert.match(rule, /Label proposed timelines, staffing moves, phase gates, and KPI thresholds as proposals or decision gates/i)
  assert.match(rule, /Do not say a project is complete or that sufficient insights were extracted/i)
})

test('crisis and compliance scenarios do not manufacture legal obligations', () => {
  const rule = COS_GENERAL_REASONING_DISCIPLINE
  assert.match(rule, /do not turn prudent governance advice into a claimed legal obligation/i)
  assert.match(rule, /do not name statutes or regulatory regimes such as GDPR or CCPA/i)
  assert.match(rule, /Legal\/Privacy\/Compliance must determine the notification duties, scope, recipients, and deadlines/i)
  assert.match(rule, /Customer disclosure is a decision point unless the supplied facts or verified authority establish a mandatory notice/i)
  assert.match(rule, /do not invent a requirement that a particular executive or Legal must approve/i)
})

test('a stakeholder secrecy proposal does not cause COS to refuse a legitimate crisis protocol request', () => {
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /not a request to conceal misconduct merely because one stakeholder in the scenario proposes secrecy/i)
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /Draft the protocol directly/i)
})

test('backup brain carries the same crisis legal-grounding invariants', () => {
  const brain = read('../../cos-core/brain.md')
  assert.match(brain, /never claim that a statute, regulation, customer-notification duty, approval authority, or legal deadline applies/i)
  assert.match(brain, /Do not name GDPR, CCPA/i)
  assert.match(brain, /Legal\/Privacy\/Compliance assessment a decision gate/i)
  assert.match(brain, /proposal to keep an incident quiet does not make a request for a crisis-response protocol improper/i)
})

test('backup brain carries scenario-premise and modeled-outcome boundaries too', () => {
  const brain = read('../../cos-core/brain.md')
  assert.match(brain, /supplied metrics are premises, not downstream outcomes/i)
  assert.match(brain, /Do not invent competitor losses, insolvency or bankruptcy, product-market-fit deadlines, market shifts/i)
  assert.match(brain, /Do not assign probability or impact labels such as low-probability, high-probability, high-impact, existential, or survival-critical/i)
  assert.match(brain, /Cash exhaustion, revenue change, funding timing, profitability timing, and runway extension require the relevant financial mechanics/i)
  assert.match(brain, /Distinguish fixed-cohort illustrations from forecasts of total users, revenue, or runway/i)
  assert.match(brain, /Never say a prototype or discovery phase is complete or that sufficient insights were extracted/i)
})

test('every reasoning worker receives the lifecycle-neutral safety and behavioral invariants, including primary', () => {
  const source = read('../lib/ai/cos/cosReasoningWorkers.ts')
  assert.match(source, /COS_GENERAL_REASONING_DISCIPLINE/)
  assert.match(source, /\[request\.systemPrompt, COS_GENERAL_REASONING_DISCIPLINE, roleGuidance\]/)
})

test('validated skill retrieval can use structural triggers but never bypasses lifecycle status', () => {
  const source = read('../lib/ai/cos/cognitiveSkillContext.ts')
  assert.match(source, /detectCognitiveReasoningTriggers/)
  assert.match(source, /matchingCognitiveReasoningTriggers/)
  assert.match(source, /\.in\('status', \['validated', 'learned', 'mastered'\]\)/)
  assert.doesNotMatch(source, /\.in\('status', \[[^\]]*'encountered'/)
})

test('seeded generalized ambiguity procedure is falsifiable candidate, not fake learned knowledge', () => {
  const migration = read('../supabase/migrations/20260822_cos_general_ambiguity_reasoning_candidate.sql')
  assert.match(migration, /reasoning\.context_ambiguity_resolution\.v1/)
  assert.match(migration, /'deictic_predicate_question'/)
  assert.match(migration, /'unresolved_referent_followup'/)
  assert.match(migration, /'underspecified_comparison'/)
  assert.match(migration, /'vague_temporal_reference'/)
  assert.match(migration, /'observables'/)
  assert.match(migration, /'falsifiers'/)
  assert.match(migration, /'encountered'/)
  assert.match(migration, /automaticSkillPromotionAllowed', false/)
  assert.match(migration, /requiresIndependentHoldouts', true/)
  assert.doesNotMatch(migration, /'validated'\s*,\s*true/)
})
