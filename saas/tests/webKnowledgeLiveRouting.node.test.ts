// saas/tests/webKnowledgeLiveRouting.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

test('COS live research is conditionally granted and routed through the Web Knowledge Harness', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  const external = readFileSync(join(process.cwd(), 'lib/ai/tools/getExternalInfo.ts'), 'utf8')
  const bridge = readFileSync(join(process.cwd(), 'lib/ai/tools/governedWebKnowledgeSearch.ts'), 'utf8')

  assert.match(route, /shouldGrantWebKnowledgeResearch\(prompt\)/)
  assert.match(route, /WEB_KNOWLEDGE_RESEARCH_CAPABILITY/)
  assert.match(route, /access==='live_required'\|\|access==='search_if_thin'/)

  assert.match(external, /searchThroughGovernedWebKnowledge\(\{ query, count \}\)/)
  assert.match(external, /if \(governed\.handled\)/)
  assert.match(external, /if \(governed\.ok === false\) throw new Error\(governed\.error\)/)

  assert.match(bridge, /currentCosHarnessIngress\(\)\?\.manifest/)
  assert.match(bridge, /runWebKnowledgeResearchProductionHarness\(\{/)
  assert.match(bridge, /parentManifest: parent/)
  assert.match(bridge, /web_knowledge_evidence_sink_unavailable/)
  assert.match(bridge, /handled: true,[\s\S]*ok: false/)
})
