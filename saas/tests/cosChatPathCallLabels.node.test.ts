// saas/tests/cosChatPathCallLabels.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')

function functionSource(name: string): string {
  const start = route.indexOf(`async function ${name}`)
  assert.notEqual(start, -1, `${name} must exist in cos-primary`)
  const next = route.indexOf('\nasync function ', start + 1)
  return route.slice(start, next === -1 ? route.length : next)
}

test('completion rescue is attributed to interactive COS telemetry', () => {
  const source = functionSource('runCompletionFirstRescue')
  assert.match(source, /usageContext:\s*\{feature:'cos_interactive_answer',purpose:'completion_rescue'\}/)
})

test('fresh grounded answer inference carries a dedicated usage label', () => {
  assert.match(route, /usageContext:\s*\{feature:'cos_fresh_grounded_task',purpose:'fresh_grounded_task'\}/)
})

test('interactive travel attempts persist attributed provider usage', () => {
  assert.match(route, /persistUsage:true,\s*usageContext:\s*\{feature:'cos_interactive_travel_plan',purpose:attempt\.purpose\}/)
})

// Every model call on the live chat path is labeled (2026-09-27). Production 19:56 ET, public Concierge: two
// unlabeled calls (a 36.1s redaction and a 9.3s completion rescue) ran as unattributed_local_inference on the
// background RunPod reasoner with hidden thinking, outside the 8s interactive graduate budget.
const CHAT_PATH_FILES = [
  'app/api/cos-primary/route.ts',
  'lib/ai/cos/cosFirstAnswer.ts',
  'lib/ai/cos/cosFirstAnswerCore.ts',
  'lib/ai/cos/cosFirstAnswerEnterprise.ts',
]

// Owner-only long-form repository report, not a chat answer; deliberately left on the background reasoner.
const EXEMPT_OWNER_REPORTS = ['async function assessSelfHealingSupervisor(']

function chatPathSource(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('every callCosReasoner on the chat path carries a usage label', () => {
  const unlabeled: string[] = []
  for (const path of CHAT_PATH_FILES) {
    const text = chatPathSource(path)
    const finder = /callCosReasoner\(/g
    let match: RegExpExecArray | null
    while ((match = finder.exec(text)) !== null) {
      const before = text.slice(Math.max(0, match.index - 80), match.index)
      if (/import\s*\{[^}]*$/.test(before)) continue
      const enclosing = text.lastIndexOf('function ', match.index)
      const header = text.slice(enclosing - 6, text.indexOf('(', enclosing) + 1)
      if (EXEMPT_OWNER_REPORTS.some(exempt => header.includes(exempt.replace('async ', '').trim()) || text.slice(enclosing - 6, enclosing + 60).includes(exempt))) continue
      const call = text.slice(match.index, match.index + 700)
      // A request object built elsewhere (synthesisRequest) must itself be labeled.
      const argName = /^callCosReasoner\((\w+)\)/.exec(call)?.[1]
      if (argName) {
        const declared = text.lastIndexOf(`const ${argName} = {`, match.index)
        if (declared >= 0 && /usageContext:/.test(text.slice(declared, declared + 400))) continue
        unlabeled.push(`${path}:${text.slice(0, match.index).split('\n').length}`)
        continue
      }
      if (!/usageContext\s*:/.test(call)) unlabeled.push(`${path}:${text.slice(0, match.index).split('\n').length}`)
    }
  }
  assert.deepEqual(unlabeled, [])
})

test('the rescue, interpretation, freshness and live-fact calls use the interactive policies', () => {
  assert.match(chatPathSource('app/api/cos-primary/route.ts'), /usageContext:\{feature:'cos_interactive_answer',purpose:'completion_rescue'\},/)
  assert.match(chatPathSource('lib/ai/cos/cosFirstAnswer.ts'), /usageContext: \{ feature: 'cos_interactive_answer', purpose: 'contextual_interpretation' \},\n    disableThinking: true,/)
  const core = chatPathSource('lib/ai/cos/cosFirstAnswerCore.ts')
  assert.match(core, /usageContext: \{ feature: 'cos_fresh_grounded_task', purpose: 'live_fact_synthesis' \},/)
  assert.match(core, /usageContext: \{ feature: 'cos_interactive_answer', purpose: 'answer_freshness_reflection' \},\n    disableThinking: true,/)
})
