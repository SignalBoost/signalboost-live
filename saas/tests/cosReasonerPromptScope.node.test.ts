import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COS_REASONER_SYSTEM_PROMPT } from '../lib/ai/cos/cosFirstAnswerEnterprise.ts'
import { reasonerPromptScopeFor, scopeReasonerPromptToQuestion } from '../lib/ai/cos/cosReasonerPromptScope.ts'
import { COS_GENERAL_REASONING_DISCIPLINE } from '../lib/ai/cos/cosGeneralReasoningDiscipline.ts'
import { estimateQwenContextTokens, planContextWindow } from '../lib/ai/context-window-manager.ts'

const KUBERNETES = 'How does Kubernetes keep applications reliable when a node goes down, and what role do readiness and liveness probes play?'

function ownerPrompt(question?: string, language = 'English') {
  return COS_REASONER_SYSTEM_PROMPT(language, { privileged: true, audience: 'owner', ...(question ? { question } : {}) })
}

test('without a question the prompt is unchanged', () => {
  const full = ownerPrompt()
  assert.equal(scopeReasonerPromptToQuestion(full, ''), full)
  assert.equal(scopeReasonerPromptToQuestion(full, null), full)
  assert.match(full, /NORMATIVE AND PUBLIC-POLICY QUESTIONS:/)
  assert.match(full, /QUANTITATIVE WORK AND STATED CONSTRAINTS:/)
  assert.match(full, /GIVEN FACTS AND YOUR OWN READING ARE WRITTEN DIFFERENTLY:/)
  assert.match(full, /REFERENCE CONSTANTS/)
})

test('an ordinary technical question drops the blocks it is not in and keeps the core contract', () => {
  // Production 2026-09-30 00:33 UTC: this question was refused by RunPod in 6 ms (context window) and took 29.4 s on the backup.
  const full = ownerPrompt()
  const scoped = ownerPrompt(KUBERNETES)
  for (const removed of [
    /NORMATIVE AND PUBLIC-POLICY QUESTIONS:/,
    /QUANTITATIVE WORK AND STATED CONSTRAINTS:/,
    /REFERENCE CONSTANTS/,
    /GIVEN FACTS AND YOUR OWN READING ARE WRITTEN DIFFERENTLY:/,
    /^SCOPE RULE: /m,
    /^AUTHORITATIVE COS DEFINITIONS: Semantic Memory/m,
    /^- Spanish: /m,
    /^- Russian: /m,
  ]) assert.doesNotMatch(scoped, removed)
  for (const kept of [
    /EVIDENCE-BASED REASONING:/,
    /DELIVER CONCLUSIONS, NOT YOUR DELIBERATION:/,
    /RE-READ YOUR OWN ANSWER BEFORE RETURNING IT/,
    /CITING INTERNAL EVIDENCE:/,
    /CHAT ANSWER LENGTH:/,
    /OWNER-ONLY SKILL: CHIEF OF STAFF/,
    /^- English: /m,
    /^AUTHORITATIVE COS DEFINITIONS: iTMounts/m,
    /Return ONLY strict JSON/,
    /Reply in English\./,
  ]) assert.match(scoped, kept)
  assert.ok(scoped.length < full.length - 18_000, `expected a large cut, got ${full.length} -> ${scoped.length}`)
  assert.doesNotMatch(scoped, /\n\n\n/)
})

test('each block returns when the question calls for it', () => {
  const quantitative = ownerPrompt('How much power does a 64 GPU H100 cluster draw?')
  assert.match(quantitative, /QUANTITATIVE WORK AND STATED CONSTRAINTS:/)
  assert.match(quantitative, /REFERENCE CONSTANTS/)
  assert.match(quantitative, /GIVEN FACTS AND YOUR OWN READING ARE WRITTEN DIFFERENTLY:/)

  const normative = ownerPrompt('Should governments ban facial recognition in public spaces?')
  assert.match(normative, /NORMATIVE AND PUBLIC-POLICY QUESTIONS:/)
  assert.match(normative, /GIVEN FACTS AND YOUR OWN READING ARE WRITTEN DIFFERENTLY:/)

  const self = ownerPrompt('What is the difference between your semantic memory and enterprise memory?')
  assert.match(self, /^SCOPE RULE: /m)
  assert.match(self, /^AUTHORITATIVE COS DEFINITIONS: Semantic Memory/m)

  const scenario = ownerPrompt(`Our team is deciding how to reorganize support. ${'The support team handles escalations from enterprise accounts and has grown quickly. '.repeat(6)}`)
  assert.match(scenario, /GIVEN FACTS AND YOUR OWN READING ARE WRITTEN DIFFERENTLY:/)
})

test('only the answer language writing profile is kept, and every profile stays when unsure', () => {
  const spanish = ownerPrompt('Explain photosynthesis', 'es')
  assert.match(spanish, /^- Spanish: /m)
  assert.doesNotMatch(spanish, /^- Polish: /m)
  const accented = ownerPrompt('¿Cómo funciona la fotosíntesis?', 'en')
  for (const name of ['English', 'Spanish', 'Brazilian Portuguese', 'Polish', 'Russian']) assert.match(accented, new RegExp(`^- ${name}: `, 'm'))
  assert.equal(reasonerPromptScopeFor('Explain photosynthesis', 'klingon').languageProfile, null)
})

function learnedItem(i: number): string {
  return `[CL${i}] Pod eviction and rescheduling after node failure in Kubernetes clusters: ${'When a node becomes unreachable, the node lifecycle controller sets NodeReady to Unknown and applies the unreachable NoExecute taint; pods without a matching toleration are evicted and their controllers create replacements on healthy nodes. Readiness probes gate endpoint membership; liveness probes restart containers that stopped making progress. '.repeat(5)}Facts: default node-monitor-grace-period 40s; default toleration 300s. [peer-reviewed; confidence 0.86; similarity 0.71; scientific_journal https://www.usenix.org/conference/osdi24/presentation/kubernetes-failure-recovery-${i}]`
}

test('the production chat request with six learned-pool items fits the owned 16K reasoner window', () => {
  // Production 2026-09-30 01:37 UTC: this question with 6 injected [CL#] items (DeepInfra measured 12,059 real
  // prompt tokens) was refused on RunPod in 8 ms as context_window_would_truncate_input, and DeepInfra answered in 17.7 s.
  const system = `${ownerPrompt(KUBERNETES)}\n\n${COS_GENERAL_REASONING_DISCIPLINE} /no_think`
  const evidence = [
    'KNOWLEDGE GRAPH FACTS:\n[KG1] Kubernetes controllers reconcile desired and actual state.\n[KG2] A Deployment manages ReplicaSets.',
    `CONTINUOUS LEARNING CORPUS:\n${[1, 2, 3, 4, 5, 6].map(learnedItem).join('\n')}`,
    'VALIDATED COGNITIVE PROCEDURAL SKILLS (HOW-TO GUIDANCE, NOT FACTUAL EVIDENCE):\n[SK1] Separate queueing from service time.',
    `CURRENT USER INPUT (QUESTION, STATEMENT, OR PASTED TEXT):\n${KUBERNETES}`,
  ].join('\n\n')
  assert.ok(evidence.length > 12_000, 'evidence must be production-sized')
  const plan = planContextWindow({
    model: 'qwen3:30b', provider: 'runpod', contextWindowTokens: 16_384,
    systemPrompt: system, messages: [{ role: 'user', content: evidence }],
    requestedOutputTokens: 1_000, estimateTokens: estimateQwenContextTokens,
  })
  assert.equal(plan.truncatedCharacters, 0)
  assert.equal(plan.droppedMessages, 0)
  assert.equal(plan.maxOutputTokens, 1_000)
  // The flat 3-characters-per-token estimate refuses the same request.
  const flat = planContextWindow({
    model: 'qwen3:30b', provider: 'runpod', contextWindowTokens: 16_384,
    systemPrompt: system, messages: [{ role: 'user', content: evidence }],
    requestedOutputTokens: 1_000,
  })
  assert.ok(flat.truncatedCharacters > 0)
})

test('the Qwen estimate never undercounts, measured against the real Qwen3 tokenizer', () => {
  // Real Qwen3 tokenizer counts measured 2026-09-29/30.
  const cases: ReadonlyArray<readonly [string, number]> = [
    ['1234567890 '.repeat(200), 2_200],
    ['a3f9c2e1b7d4 '.repeat(200), 2_401],
    ['抗菌素耐药性是指细菌、病毒、真菌和寄生虫随着时间的推移发生变化，不再对药物产生反应。'.repeat(20), 560],
    ['Oporność na środki przeciwdrobnoustrojowe występuje, gdy bakterie, wirusy, grzyby i pasożyty zmieniają się z czasem i przestają reagować na leki. Źródło: badania naukowe. '.repeat(20), 1_301],
    ['La resistencia a los antimicrobianos ocurre cuando las bacterias, los virus, los hongos y los parásitos cambian con el tiempo y dejan de responder a los medicamentos. ¿Cómo funciona la fotosíntesis? '.repeat(20), 1_041],
    ['https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/ https://doi.org/10.1016/j.cell.2024.01.001 '.repeat(30), 1_381],
  ]
  for (const [text, real] of cases) assert.ok(estimateQwenContextTokens(text) >= real, `${text.slice(0, 30)}: ${estimateQwenContextTokens(text)} < ${real}`)
  // Close to real on the English answer prompt (8,866 real tokens), not the ~1.45x the character estimate gave.
  const scoped = `${ownerPrompt(KUBERNETES)}${COS_GENERAL_REASONING_DISCIPLINE}`
  const estimate = estimateQwenContextTokens(scoped)
  assert.ok(estimate >= 8_866 && estimate <= 10_500, `scoped prompt estimate ${estimate}`)
})

test('chat asks RunPod first with its real window and never lets it answer from cut evidence', () => {
  const source = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
  const turn = source.slice(source.indexOf('async function runpodFirstInteractiveTurn('), source.indexOf('export async function callLocalModelTurn('))
  assert.match(turn, /ownedReasonerContextWindowTokens\(runpodConfig\)/)
  assert.match(turn, /tokenEstimator: \/qwen\/i\.test\(runpodConfig\.model\) \? 'qwen' : undefined/)
  assert.match(turn, /refuseInputCompaction: true/)
  assert.match(source, /COS_REASONER_CONTEXT_LENGTH \|\| '16384'/)
  assert.match(source, /context_window_would_truncate_input/)
  const enterprise = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  assert.match(enterprise, /COS_REASONER_SYSTEM_PROMPT\(input\.language \|\| 'English', \{ privileged: audience === 'owner', audience, question: input\.prompt \}\)/)
})
