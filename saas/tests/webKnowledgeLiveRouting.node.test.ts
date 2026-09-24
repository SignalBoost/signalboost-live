// Diagnostic isolation: static wiring only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

test('COS route grants Web Knowledge only to live/thin/explicit research turns and getExternalInfo consumes it', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  const external = readFileSync(join(process.cwd(), 'lib/ai/tools/getExternalInfo.ts'), 'utf8')

  assert.match(route, /shouldGrantWebKnowledgeResearch\(prompt\)/)
  assert.match(route, /WEB_KNOWLEDGE_RESEARCH_CAPABILITY/)
  assert.match(route, /access==='live_required'\|\|access==='search_if_thin'/)
  assert.match(external, /searchThroughGovernedWebKnowledge\(\{ query, count \}\)/)
  assert.match(external, /if \(governed\.handled\)/)
})
