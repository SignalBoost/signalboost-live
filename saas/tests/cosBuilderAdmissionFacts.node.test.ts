// saas/tests/cosBuilderAdmissionFacts.node.test.ts
// Production 2026-10-26: the owner pasted an acceptance campaign (COS-PAC-001) into chat. Because it contained
// "repair" and "fail" next to "test" and "server", a word rule sent it to a paid Builder job, which stopped on its
// spending limit, and COS never answered. Software work is now admitted only on facts (attached or pasted source,
// a pending proposal, a pasted log the owner may repair) or on COS's own planner request after it read the request.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { registerHooks } from 'node:module'

const root = new URL('../', import.meta.url)
registerHooks({
  resolve(specifier, context, next) {
    const base = specifier.startsWith('@/') ? new URL(specifier.slice(2), root).href : specifier
    try { return next(base, context) } catch (error) {
      for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}.js`]) {
        try { return next(candidate, context) } catch { /* try the next file form */ }
      }
      throw error
    }
  },
})

const campaign = readFileSync(new URL('./fixtures/cos-production-acceptance-campaign.txt', import.meta.url), 'utf8')
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const request = (overrides: Record<string, unknown> = {}) => ({ body: { messages: [] }, objective: '', surface: 'assistant' as const, ...overrides })

test('the words of a request never admit software work; facts or the planner do', async () => {
  const { specialistAdmitted } = await import('../lib/ai/cos/softwareSpecialist.ts')
  const { isSoftwareRepairRequest } = await import('../lib/ai/cos/softwareRepairIntent.ts')
  // The word rule still matches the campaign; it only keeps such a request out of the edit lanes now.
  assert.equal(isSoftwareRepairRequest(campaign), true)
  for (const words of [campaign, 'My login page fails, please fix it.', 'Build a Node.js application with package.json and npm test.']) {
    assert.equal(specialistAdmitted(request(), words, false, false), false, words.slice(0, 40))
    assert.equal(specialistAdmitted(request({ plannerRequested: true }), words, false, false), true, words.slice(0, 40))
  }
  assert.equal(specialistAdmitted(request(), 'this is broken', true, false), true, 'an attached source file')
  // Codex on #4916: the owner's "go" after our own offer to repair carries the recovered request into admission.
  assert.equal(specialistAdmitted(request({ confirmedRepairContinuation: true }), 'Fix the Failed to fetch error on the Builder page', false, false), true)
  assert.equal(specialistAdmitted(request(), 'Why does this crash?\n```js\nconst items = []\nitems[3].name\n```', false, false), true, 'pasted source')
})

test('chat consults the Software Specialist before the planner only on facts', () => {
  const browser = source('../app/api/cos-browser/route.ts')
  const gate = browser.slice(browser.indexOf('const shouldConsultSoftwareSpecialist'), browser.indexOf('const ownerRepositoryRepairAllowed'))
  assert.match(gate, /hasSourceAttachment \|\| explicitOperationalRepair\s*\n\s*\|\| Boolean\(ownerRepairFollowup\)\s*\n\s*\|\| pastedSourceCode\(prompt\)/)
  assert.doesNotMatch(gate, /softwareRepairRequest|isConciergeBuilderObjective|isSoftwareRepairRequest/)
  // The planner's handoff is what admits a request described only in words.
  // Only a software_specialist request admits software work; repository_read alone is inspection (Codex on #4916).
  assert.equal(browser.match(/plannerRequested: agentDecision\.capabilities\.includes\('software_specialist'\),/g)?.length, 3)
  assert.doesNotMatch(browser, /plannerRequested: true/)
  assert.match(browser, /confirmedRepairContinuation: Boolean\(ownerRepairFollowup\) && specialistObjective === ownerRepairFollowup,/)
})

test('every surface can ask for the Software Specialist; repository authority stays with the signed-in owner', () => {
  const decision = source('../lib/ai/cos/cosAgentDecision.ts')
  const catalog = decision.slice(decision.indexOf('function toolCatalog'), decision.indexOf('function turnReasonerLabel'))
  assert.match(catalog, /\['live_web', 'compute', 'software_specialist'\]\s*\n\s*: input\.ownerAuthenticated\s*\n\s*\? COS_AGENT_CAPABILITIES\s*\n\s*: \['live_web', 'compute', 'software_specialist'\]/)
  assert.match(decision, /decide what the user asks to have DONE, not which words appear in it/)
})

test('the browser sends the campaign to COS, not straight to Builder', async () => {
  ;(globalThis as any).window = globalThis
  const { conciergeBuilderRequest } = await import('../lib/ai/cos/agentProgressClient.ts')
  const body = { messages: [{ role: 'user', content: campaign }], context: { conversationId: '00000000-0000-4000-8000-000000000001', language: 'en' } }
  assert.equal(conciergeBuilderRequest(body), null)
})

// Codex on #4916: a build request phrased as a question still reaches the planner that hands it to the Specialist.
test('a build request phrased as a question is not skipped as a stable knowledge question', async () => {
  const { stableKnowledgeQuestionNeedsNoPlanner } = await import('../lib/ai/cos/cosAgentDecision.ts')
  assert.equal(stableKnowledgeQuestionNeedsNoPlanner('What I need you to build is a Python CLI in main.py that adds two numbers.'), false)
  assert.equal(stableKnowledgeQuestionNeedsNoPlanner('What is the difference between an Ingress and a Service in Kubernetes?'), true)
})
