import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const route = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
const agent = readFileSync(join(process.cwd(), 'lib/ai/cos/modelFirstAgent.ts'), 'utf8')
const inference = readFileSync(join(process.cwd(), 'lib/ai/local-inference.ts'), 'utf8')

test('ordinary read-only COS turns give the primary model first semantic decision', () => {
  const modelFirst = route.indexOf('runModelFirstCosAgent({')
  const semanticClassifier = route.indexOf('classifyCosSemanticTaskIntent({', modelFirst)
  assert.ok(modelFirst > 0)
  assert.ok(semanticClassifier > modelFirst)
  assert.match(route, /if\(!requestedAction&&!hasAttachments&&!isCosCodingObjective\(input\)\)/)
})

test('model-first direct answers remain behind host freshness and authority release guards', () => {
  const modelFirst = route.indexOf('runModelFirstCosAgent({')
  const release = route.indexOf('if(liveAuthoritySatisfied)', modelFirst)
  assert.ok(release > modelFirst)
  const section = route.slice(modelFirst, release + 1200)
  assert.match(section, /requiresFreshExternalEvidence\(input\)/)
  assert.match(section, /freshEvidenceMeetsQuestionAuthority\(input,agentSources\)/)
  assert.match(section, /securityScenarioEvidenceIsSpecific\(input,agentSources\)/)
})

test('native model-first loop uses OpenAI-compatible function calling instead of JSON-emulated routing', () => {
  assert.match(agent, /tools: definitions/)
  assert.match(agent, /toolChoice: 'auto'/)
  assert.match(agent, /tool_calls: calls/)
  assert.match(agent, /role: 'tool'/)
  assert.match(agent, /MAX_NATIVE_TOOL_CALLS = 3/)
  assert.doesNotMatch(agent, /"type":"tool","toolId"/)
})

test('public capability surface stays read-only and owner capabilities are privilege-gated', () => {
  assert.match(agent, /const BASE_TOOL_IDS = \['web\.search'\]/)
  assert.match(agent, /const OWNER_TOOL_IDS = \['repo\.list', 'repo\.read', 'business\.metrics', 'memory\.read'\]/)
  assert.match(agent, /if \(args\.privileged\) \{/)
  assert.match(agent, /name: 'platform_runtime'/)
  assert.match(agent, /tool\.risk !== 'read_only'/)
})

test('native inference seam sends tools and parses provider tool_calls', () => {
  assert.match(inference, /tools: args\.tools, tool_choice: args\.toolChoice \?\? 'auto'/)
  assert.match(inference, /message\?\.tool_calls/)
  assert.match(inference, /export async function callLocalModelTurn/)
})

test('web capability executes one live retrieval per native tool call', () => {
  const executeStart = agent.indexOf('async function executeTool')
  const executeEnd = agent.indexOf('export async function runModelFirstCosAgent', executeStart)
  const execute = agent.slice(executeStart, executeEnd)
  assert.equal((execute.match(/await getExternalInfo\(/g) || []).length, 1)
})
