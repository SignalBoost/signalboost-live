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

test('the ordinary chat prompt now fits the owned 16K reasoner window with room for evidence', () => {
  const system = `${ownerPrompt(KUBERNETES)}\n\n${COS_GENERAL_REASONING_DISCIPLINE}`
  const evidence = `${'KNOWLEDGE GRAPH FACTS:\n[KG1] Kubernetes node controller marks unreachable nodes NotReady and evicts pods after the toleration period.\n'.repeat(20)}${KUBERNETES}`
  const plan = planContextWindow({
    model: 'qwen3:30b', provider: 'runpod', contextWindowTokens: 16_384,
    systemPrompt: system, messages: [{ role: 'user', content: evidence }],
    requestedOutputTokens: 1_200, estimateTokens: estimateQwenContextTokens,
  })
  assert.equal(plan.truncatedCharacters, 0)
  assert.equal(plan.maxOutputTokens, 1_200)
  // The same request with the unscoped prompt and the flat estimate is what production refused.
  assert.throws(() => planContextWindow({
    model: 'qwen3:30b', provider: 'runpod', contextWindowTokens: 16_384,
    systemPrompt: `${ownerPrompt()}\n\n${COS_GENERAL_REASONING_DISCIPLINE}`, messages: [{ role: 'user', content: KUBERNETES }],
    requestedOutputTokens: 2_000,
  }), /context_window_budget_insufficient/)
})

test('the Qwen estimate never undercounts the text Qwen spends the most tokens on', () => {
  // Real Qwen3 tokenizer counts, measured 2026-09-29: one token per digit, hex/UUID-heavy strings near one per character.
  assert.ok(estimateQwenContextTokens('1234567890 '.repeat(200)) >= 2_200)
  assert.ok(estimateQwenContextTokens('a3f9c2e1b7d4 '.repeat(200)) >= 2_401)
  assert.ok(estimateQwenContextTokens('抗菌素耐药性是指细菌、病毒、真菌和寄生虫随着时间的推移发生变化，不再对药物产生反应。'.repeat(20)) >= 560)
  assert.ok(estimateQwenContextTokens('Oporność na środki przeciwdrobnoustrojowe występuje, gdy bakterie, wirusy, grzyby i pasożyty zmieniają się z czasem i przestają reagować na leki. Źródło: badania naukowe. '.repeat(20)) >= 1_301)
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
