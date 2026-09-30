import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reasonerPromptScopeFor, scopeReasonerPromptToQuestion } from '../lib/ai/cos/cosReasonerPromptScope.ts'
import { estimateQwenContextTokens, planContextWindow } from '../lib/ai/context-window-manager.ts'

const KUBERNETES = 'How does Kubernetes keep applications reliable when a node goes down, and what role do readiness and liveness probes play?'

const FIXTURE = [
  'EVIDENCE-BASED REASONING:',
  'NORMATIVE AND PUBLIC-POLICY QUESTIONS:',
  'Use evidence and distinguish documented facts from values.',
  'QUANTITATIVE WORK AND STATED CONSTRAINTS:',
  'Calculate explicitly when the question asks for quantities.',
  'DELIVER CONCLUSIONS, NOT YOUR DELIBERATION:',
  'GIVEN FACTS AND YOUR OWN READING ARE WRITTEN DIFFERENTLY:',
  'Keep supplied facts separate from inference.',
  'RE-READ YOUR OWN ANSWER BEFORE RETURNING IT',
  'CITING INTERNAL EVIDENCE:',
  'CHAT ANSWER LENGTH:',
  'OWNER-ONLY SKILL: CHIEF OF STAFF',
  'SCOPE RULE: internal components are not interchangeable.',
  'AUTHORITATIVE COS DEFINITIONS: Semantic Memory',
  'AUTHORITATIVE COS DEFINITIONS: iTMounts',
  '- English: Write clear English.',
  '- Spanish: Escribe español claro.',
  '- Brazilian Portuguese: Escreva português claro.',
  '- Polish: Pisz jasno po polsku.',
  '- Russian: Пишите ясно по-русски.',
  'Return ONLY strict JSON',
  'Reply in English.',
].join('\n')

test('without a question the prompt is unchanged', () => {
  assert.equal(scopeReasonerPromptToQuestion(FIXTURE, ''), FIXTURE)
  assert.equal(scopeReasonerPromptToQuestion(FIXTURE, null), FIXTURE)
})

test('ordinary technical questions drop unrelated blocks and keep the core contract', () => {
  const scoped = scopeReasonerPromptToQuestion(FIXTURE, KUBERNETES, 'English')
  for (const removed of [
    /NORMATIVE AND PUBLIC-POLICY QUESTIONS:/,
    /QUANTITATIVE WORK AND STATED CONSTRAINTS:/,
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
  assert.doesNotMatch(scoped, /\n\n\n/)
})

test('question classes conservatively restore the blocks they require', () => {
  const quantitative = reasonerPromptScopeFor('How much power does a 64 GPU H100 cluster draw?', 'en')
  assert.equal(quantitative.quantitative, true)
  assert.equal(quantitative.givenFacts, true)

  const normative = reasonerPromptScopeFor('Should governments ban facial recognition in public spaces?', 'en')
  assert.equal(normative.normative, true)
  assert.equal(normative.givenFacts, true)

  const self = reasonerPromptScopeFor('What is the difference between your semantic memory and enterprise memory?', 'en')
  assert.equal(self.cosDefinitions, true)

  const scenario = reasonerPromptScopeFor(`Our team is deciding how to reorganize support. ${'The support team handles escalations from enterprise accounts and has grown quickly. '.repeat(6)}`, 'en')
  assert.equal(scenario.givenFacts, true)
})

test('only the selected answer-language profile is kept, and uncertain language keeps every profile', () => {
  const spanish = scopeReasonerPromptToQuestion(FIXTURE, 'Explain photosynthesis', 'es')
  assert.match(spanish, /^- Spanish: /m)
  assert.doesNotMatch(spanish, /^- Polish: /m)
  const accented = scopeReasonerPromptToQuestion(FIXTURE, '¿Cómo funciona la fotosíntesis?', 'en')
  for (const name of ['English', 'Spanish', 'Brazilian Portuguese', 'Polish', 'Russian']) {
    assert.match(accented, new RegExp(`^- ${name}: `, 'm'))
  }
  assert.equal(reasonerPromptScopeFor('Explain photosynthesis', 'klingon').languageProfile, null)
})

function learnedItem(i: number): string {
  return `[CL${i}] Pod eviction and rescheduling after node failure in Kubernetes clusters: ${'When a node becomes unreachable, controllers reschedule work and probes govern endpoint health. '.repeat(12)} [peer-reviewed; confidence 0.86; scientific_journal https://example.test/kubernetes-${i}]`
}

test('a production-sized chat request fits the owned 16K reasoner window with the Qwen estimator', () => {
  const system = `${scopeReasonerPromptToQuestion(FIXTURE, KUBERNETES, 'English')}\n${'Reason carefully and return concise JSON. '.repeat(180)} /no_think`
  const evidence = [
    'KNOWLEDGE GRAPH FACTS:\n[KG1] Kubernetes controllers reconcile desired and actual state.',
    `CONTINUOUS LEARNING CORPUS:\n${[1, 2, 3, 4, 5, 6].map(learnedItem).join('\n')}`,
    `CURRENT USER INPUT:\n${KUBERNETES}`,
  ].join('\n\n')
  const plan = planContextWindow({
    model: 'qwen3:30b', provider: 'runpod', contextWindowTokens: 16_384,
    systemPrompt: system, messages: [{ role: 'user', content: evidence }],
    requestedOutputTokens: 1_000, estimateTokens: estimateQwenContextTokens,
  })
  assert.equal(plan.truncatedCharacters, 0)
  assert.equal(plan.droppedMessages, 0)
  assert.equal(plan.maxOutputTokens, 1_000)
})

test('the Qwen estimate never undercounts measured Qwen3 tokenizer cases', () => {
  const cases: ReadonlyArray<readonly [string, number]> = [
    ['1234567890 '.repeat(200), 2_200],
    ['a3f9c2e1b7d4 '.repeat(200), 2_401],
    ['抗菌素耐药性是指细菌、病毒、真菌和寄生虫随着时间的推移发生变化，不再对药物产生反应。'.repeat(20), 560],
    ['Oporność na środki przeciwdrobnoustrojowe występuje, gdy bakterie, wirusy, grzyby i pasożyty zmieniają się z czasem i przestają reagować na leki. Źródło: badania naukowe. '.repeat(20), 1_301],
    ['La resistencia a los antimicrobianos ocurre cuando las bacterias, los virus, los hongos y los parásitos cambian con el tiempo y dejan de responder a los medicamentos. ¿Cómo funciona la fotosíntesis? '.repeat(20), 1_041],
    ['https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/ https://doi.org/10.1016/j.cell.2024.01.001 '.repeat(30), 1_381],
  ]
  for (const [text, real] of cases) {
    assert.ok(estimateQwenContextTokens(text) >= real, `${text.slice(0, 30)}: ${estimateQwenContextTokens(text)} < ${real}`)
  }
})

test('production integration passes the question into scoping and uses Qwen-aware RunPod planning', () => {
  const enterprise = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  assert.match(enterprise, /COS_REASONER_SYSTEM_PROMPT\(input\.language \|\| 'English', \{ privileged: audience === 'owner', audience, question: input\.prompt \}\)/)
  const promptSource = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  assert.match(promptSource, /scopeReasonerPromptToQuestion\(/)

  const source = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
  const turn = source.slice(source.indexOf('async function runpodFirstInteractiveTurn('), source.indexOf('export async function callLocalModelTurn('))
  assert.match(turn, /ownedReasonerContextWindowTokens\(runpodConfig\)/)
  assert.match(turn, /tokenEstimator: \/qwen\/i\.test\(runpodConfig\.model\) \? 'qwen' : undefined/)
  assert.match(turn, /refuseInputCompaction: true/)
  assert.match(source, /COS_REASONER_CONTEXT_LENGTH \|\| '16384'/)
  assert.match(source, /context_window_would_truncate_input/)
})
