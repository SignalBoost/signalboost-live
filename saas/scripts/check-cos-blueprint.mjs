import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(process.cwd())
const failures = []
const allowedProviderRouterImports = new Set([
  'lib/cos/textGateway.ts',
  'lib/cos/aiPort.ts',
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
  if (/from\s+['"]@\/lib\/ai\/providerRouter['"]/.test(source) && !allowedProviderRouterImports.has(relative)) {
    failures.push(`direct_provider_router_import:${relative}`)
  }
}

const compatibilityRouter = await readFile(path.join(root, 'lib/ai/modelRouter.ts'), 'utf8')
if (!compatibilityRouter.includes('callCosText')) failures.push('legacy_model_router_bypasses_cos')
if (compatibilityRouter.includes('api.anthropic.com') || compatibilityRouter.includes('api.openai.com')) failures.push('legacy_model_router_contains_provider_endpoint')

const kernel = await readFile(path.join(root, 'lib/cos-core/cos-kernel.ts'), 'utf8')
for (const required of ['businessRules', 'lookupSemanticCache', 'processMemoryLayer', 'compressPromptContext', 'processReasoningLayer', 'commitToMemory', 'recordROI']) {
  if (!kernel.includes(required)) failures.push(`kernel_stage_missing:${required}`)
}

const learning = await readFile(path.join(root, 'lib/cos-core/layers/learning/index.ts'), 'utf8')
if (!learning.includes('class LearningEngine')) failures.push('learning_engine_missing')
if (!learning.includes('ContinuousLearningDirector')) failures.push('continuous_learning_director_missing')
const knowledge = await readFile(path.join(root, 'lib/cos-core/layers/knowledge/persistent.ts'), 'utf8')
if (!knowledge.includes('class KnowledgeGraph')) failures.push('knowledge_graph_missing')

// Public provenance is execution history, never a reasoning task. Both externally reachable model
// ingress routes must render only recorded turn data and must explicitly report that no model was
// invoked for provenance introspection. This guard is part of every prebuild, so the old
// model-narrated provenance pattern cannot be silently reintroduced.
for (const relative of ['app/api/cos-browser/route.ts', 'app/api/support/route.ts']) {
  const source = await readFile(path.join(root, relative), 'utf8')
  if (!source.includes('renderPublicRecordedProvenance')) failures.push(`public_provenance_not_recorded:${relative}`)
  if (!/local_model_invoked:\s*false/.test(source)) failures.push(`public_provenance_model_flag_missing:${relative}`)
  for (const forbidden of ['dynamicPublicSourceExplanation', 'acceptPublicNarrative', 'buildPublicProvenanceInstruction', 'emergencyPublicProvenance']) {
    if (source.includes(forbidden)) failures.push(`model_generated_public_provenance:${relative}:${forbidden}`)
  }
}

try {
  await readFile(path.join(root, 'lib/ai/cos/publicProvenanceNarrative.ts'), 'utf8')
  failures.push('obsolete_model_generated_public_provenance_module_present')
} catch {
  // Expected: the obsolete model-narrated provenance implementation must not exist.
}

const publicRecordedProvenance = await readFile(path.join(root, 'lib/ai/cos/publicRecordedProvenance.ts'), 'utf8')
for (const required of ['live_external_evidence', 'answer_origin?.live_evidence_sources', "won't reconstruct or guess", "won't invent"]) {
  if (!publicRecordedProvenance.includes(required)) failures.push(`recorded_public_provenance_guard_missing:${required}`)
}

// Current facts that already have usable live evidence must not depend on one 120s model call.
// Fresh synthesis may retry only transport failures under the same evidence-only contract. The
// local inference compatibility layer returns null on AbortError, so the fresh path must recognize a
// null that consumes essentially the full bounded timeout and convert only that case into a retry.
const freshRetryPolicy = await readFile(path.join(root, 'lib/ai/cos/freshEvidenceRetryPolicy.ts'), 'utf8')
for (const required of ['FRESH_SYNTHESIS_MAX_ATTEMPTS = 2', 'FRESH_SYNTHESIS_DEFAULT_ATTEMPT_TIMEOUT_MS = 35_000', 'FRESH_SYNTHESIS_TIMEOUT_NULL_GRACE_MS', 'freshSynthesisNullIndicatesTimeout', 'runFreshSynthesisTransportAttempts']) {
  if (!freshRetryPolicy.includes(required)) failures.push(`fresh_evidence_retry_guard_missing:${required}`)
}
const freshLocalSynthesis = await readFile(path.join(root, 'lib/ai/cos/freshEvidenceLocalSynthesis.ts'), 'utf8')
for (const required of ['runFreshSynthesisTransportAttempts', 'boundedFreshSynthesisAttemptTimeoutMs', 'freshSynthesisNullIndicatesTimeout', 'attemptStartedAt = Date.now()', 'cos-fresh-local-synthesis-retry', 'acceptFreshEvidenceSynthesis']) {
  if (!freshLocalSynthesis.includes(required)) failures.push(`fresh_evidence_retry_wiring_missing:${required}`)
}
if (!freshLocalSynthesis.includes('if (!accepted) return null')) failures.push('fresh_evidence_grounding_failure_must_not_retry')

console.log(JSON.stringify({ ok: failures.length === 0, schema: 'signalboost-cos-blueprint-v1', failures }, null, 2))
if (failures.length) process.exit(1)
