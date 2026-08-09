import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(process.cwd())
const failures = []
const allowedModelRouterImports = new Set([
  'lib/cos/aiPort.ts',
  'lib/cos-backup/runtime.ts',
  'cos-backup-host/signalboostCosBackupHost.ts',
])

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (['node_modules', '.next', '.git'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await walk(full))
    else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) files.push(full)
  }
  return files
}

for (const file of await walk(root)) {
  const relative = path.relative(root, file).replaceAll('\\', '/')
  if (relative.startsWith('scripts/')) continue
  const source = await readFile(file, 'utf8')
  if (/from\s+['"]@\/lib\/ai\/modelRouter['"]/.test(source) && !allowedModelRouterImports.has(relative)) {
    failures.push(`direct_model_router_import:${relative}`)
  }
  if (/api\.openai\.com|api\.anthropic\.com/.test(source) && !relative.startsWith('lib/ai/') && relative !== 'lib/cos/aiPort.ts') {
    failures.push(`direct_provider_endpoint:${relative}`)
  }
}

const kernel = await readFile(path.join(root, 'lib/cos-core/cos-kernel.ts'), 'utf8')
for (const required of ['businessRules', 'lookupSemanticCache', 'processMemoryLayer', 'compressPromptContext', 'processReasoningLayer', 'commitToMemory', 'recordROI']) {
  if (!kernel.includes(required)) failures.push(`kernel_stage_missing:${required}`)
}

const learning = await readFile(path.join(root, 'lib/cos-core/layers/learning/index.ts'), 'utf8')
if (!learning.includes('class LearningEngine')) failures.push('learning_engine_missing')
const knowledge = await readFile(path.join(root, 'lib/cos-core/layers/knowledge/persistent.ts'), 'utf8')
if (!knowledge.includes('class KnowledgeGraph')) failures.push('knowledge_graph_missing')

console.log(JSON.stringify({ ok: failures.length === 0, schema: 'signalboost-cos-blueprint-v1', failures }, null, 2))
if (failures.length) process.exit(1)
