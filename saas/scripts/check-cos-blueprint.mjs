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
} catch {}

const publicRecordedProvenance = await readFile(path.join(root, 'lib/ai/cos/publicRecordedProvenance.ts'), 'utf8')
for (const required of ['live_external_evidence', 'answer_origin?.live_evidence_sources', "won't reconstruct or guess", "won't invent"]) {
  if (!publicRecordedProvenance.includes(required)) failures.push(`recorded_public_provenance_guard_missing:${required}`)
}

const freshRetryPolicy = await readFile(path.join(root, 'lib/ai/cos/freshEvidenceRetryPolicy.ts'), 'utf8')
for (const required of ['FRESH_SYNTHESIS_MAX_ATTEMPTS = 2', 'FRESH_SYNTHESIS_DEFAULT_ATTEMPT_TIMEOUT_MS = 35_000', 'FRESH_SYNTHESIS_TIMEOUT_NULL_GRACE_MS', 'freshSynthesisNullIndicatesTimeout', 'runFreshSynthesisTransportAttempts']) {
  if (!freshRetryPolicy.includes(required)) failures.push(`fresh_evidence_retry_guard_missing:${required}`)
}
const freshLocalSynthesis = await readFile(path.join(root, 'lib/ai/cos/freshEvidenceLocalSynthesis.ts'), 'utf8')
for (const required of ['runFreshSynthesisTransportAttempts', 'boundedFreshSynthesisAttemptTimeoutMs', 'freshSynthesisNullIndicatesTimeout', 'attemptStartedAt = Date.now()', 'cos-fresh-local-synthesis-retry', 'acceptFreshEvidenceSynthesis']) {
  if (!freshLocalSynthesis.includes(required)) failures.push(`fresh_evidence_retry_wiring_missing:${required}`)
}
if (!freshLocalSynthesis.includes('if (!accepted) return null')) failures.push('fresh_evidence_grounding_failure_must_not_retry')

const cosPrimaryRoute = await readFile(path.join(root, 'app/api/cos-primary/route.ts'), 'utf8')
const deterministicFreshIndex = cosPrimaryRoute.indexOf('resolveDeterministicDirectFlight(lookupInput,freshSources)')
const localFreshIndex = cosPrimaryRoute.indexOf('const localSynthesis=await synthesizeFreshEvidenceLocally')
if (deterministicFreshIndex < 0) failures.push('cos_primary_deterministic_fresh_resolver_missing')
if (localFreshIndex < 0 || deterministicFreshIndex < 0 || deterministicFreshIndex > localFreshIndex) failures.push('cos_primary_deterministic_fresh_must_precede_qwen')
if (!cosPrimaryRoute.includes("event:'fresh_deterministic_resolution_accepted'")) failures.push('cos_primary_deterministic_fresh_audit_missing')
if (!cosPrimaryRoute.includes("source:'cos-fresh-deterministic-grounded'")) failures.push('cos_primary_deterministic_fresh_response_source_missing')

const assistantTransportClient = await readFile(path.join(root, 'lib/ai/cos/assistantTransportClient.ts'), 'utf8')
for (const required of ['sendAssistantTurnAndRecover', 'findRecoveredAssistantReply', 'retrySafe: false', 'shouldRecoverTransportFailure']) {
  if (!assistantTransportClient.includes(required)) failures.push(`assistant_transport_client_guard_missing:${required}`)
}
const assistantTransportBoundary = await readFile(path.join(root, 'components/AssistantTransportBoundary.tsx'), 'utf8')
for (const required of ["pathname === '/api/cos-primary'", 'fetchImpl: originalFetch', 'historyUrl: `/api/assistant/chats?id=', "error.name === 'AbortError'"]) {
  if (!assistantTransportBoundary.includes(required)) failures.push(`assistant_transport_boundary_guard_missing:${required}`)
}
const assistantLayout = await readFile(path.join(root, 'app/dashboard/assistant/layout.tsx'), 'utf8')
if (!assistantLayout.includes('AssistantTransportBoundary')) failures.push('owner_assistant_transport_boundary_not_mounted')

const operationalLearning = await readFile(path.join(root, 'lib/ai/cos/operationalSystemsLearning.ts'), 'utf8')
for (const required of ['MAX_GAPS_PER_RUN = 4', 'OPERATIONAL_SYSTEMS_SAFETY_EVIDENCE', 'advisory only', 'no facility control', 'operationalSystemsCurriculumSignals']) {
  if (!operationalLearning.includes(required)) failures.push(`operational_learning_guard_missing:${required}`)
}
const dailyLearning = await readFile(path.join(root, 'lib/cos/dailyAutonomousLearning.ts'), 'utf8')
if (!dailyLearning.includes('injectedGapSignals?: KnowledgeGapSignal[]')) failures.push('operational_learning_host_injection_missing')
if (!dailyLearning.includes('isOperationalSystemsGap')) failures.push('operational_learning_subject_hygiene_exception_missing')
const miningRoute = await readFile(path.join(root, 'app/api/cron/cos-mining/route.ts'), 'utf8')
if (!miningRoute.includes('injectedGapSignals: operationalSystemsCurriculumSignals()')) failures.push('operational_learning_daily_mining_wiring_missing')
const currentWorldLearning = await readFile(path.join(root, 'lib/ai/cos/currentWorldLearning.ts'), 'utf8')
if (/operationalSystems/i.test(currentWorldLearning)) failures.push('operational_learning_must_not_run_hourly')

// Owner policy: advisory diagnosis works the problem before it abstains. Enterprise COS already
// retrieves KG/corpus/memory/skills before entering the reasoner. The primary reasoner may then do
// a bounded methods lookup, but only authority-ranked official/institutional web results and
// Crossref scholarly results can enter the reference block. Publications are never incident data.
const advisoryDiagnosisPolicy = await readFile(path.join(root, 'lib/ai/cos/advisoryDiagnosisPolicy.ts'), 'utf8')
for (const required of ['ADVISORY_DIAGNOSIS_OWNER_POLICY', 'Observed / established facts', 'Candidate hypotheses', 'Distinguishing checks', 'Missing readings / baselines', 'NEVER INCIDENT TELEMETRY', 'uncertainty_not_last']) {
  if (!advisoryDiagnosisPolicy.includes(required)) failures.push(`advisory_diagnosis_policy_guard_missing:${required}`)
}
const advisoryDiagnosisLookup = await readFile(path.join(root, 'lib/ai/cos/advisoryDiagnosisPublishedLookup.ts'), 'utf8')
for (const required of ['getExternalInfo(officialQuery, 6', 'crossrefScientificSearch(baseQuery, 3)', 'selectOfficialDiagnosticReferences', 'references.length >= 4']) {
  if (!advisoryDiagnosisLookup.includes(required)) failures.push(`advisory_diagnosis_lookup_guard_missing:${required}`)
}
const cosReasoner = await readFile(path.join(root, 'lib/ai/cos/cosReasoner.ts'), 'utf8')
for (const required of ['primaryReasonerRequest', 'retrievePublishedDiagnosticReferences(args.prompt)', 'ADVISORY_DIAGNOSIS_OWNER_POLICY', 'advisoryDiagnosisBriefDefects', 'published_diagnostic_research', 'incidentTelemetry: false']) {
  if (!cosReasoner.includes(required)) failures.push(`advisory_diagnosis_reasoner_guard_missing:${required}`)
}
const publishedLookupIndex = cosReasoner.indexOf('retrievePublishedDiagnosticReferences(args.prompt)')
const reasonerDraftIndex = cosReasoner.indexOf("recorder.time('draft', () => callLocalModel(effectiveArgs, inference)")
if (publishedLookupIndex < 0 || reasonerDraftIndex < 0 || publishedLookupIndex > reasonerDraftIndex) failures.push('advisory_diagnosis_published_lookup_must_precede_draft')
const enterpriseFirstAnswer = await readFile(path.join(root, 'lib/ai/cos/cosFirstAnswerEnterprise.ts'), 'utf8')
const internalRetrievalIndex = enterpriseFirstAnswer.indexOf('const context = await retrieveInternalContext')
const enterpriseReasonerIndex = enterpriseFirstAnswer.indexOf('const reasoned = await callCosReasoner')
if (internalRetrievalIndex < 0 || enterpriseReasonerIndex < 0 || internalRetrievalIndex > enterpriseReasonerIndex) failures.push('advisory_diagnosis_internal_retrieval_must_precede_reasoner')
const honestRefusal = await readFile(path.join(root, 'lib/ai/cos/honestRefusalReply.ts'), 'utf8')
if (!honestRefusal.includes('I still cannot stand behind a single cause yet.')) failures.push('advisory_diagnosis_uncertainty_last_copy_missing')

const conciergeRoute = await readFile(path.join(root, 'app/api/concierge/route.ts'), 'utf8')
if (!conciergeRoute.includes('const PRIMARY_TIMEOUT_MS = 150_000')) failures.push('public_concierge_primary_timeout_must_be_150s')
const vercelCosGates = await readFile(path.join(root, 'scripts/vercel-cos-gates.mjs'), 'utf8')
if (!vercelCosGates.includes("'tests/conciergeTransportBudget.node.test.ts'")) failures.push('concierge_transport_budget_test_not_mandatory')
if (!vercelCosGates.includes("'tests/cosPrimaryDeterministicFreshRouting.node.test.ts'")) failures.push('cos_primary_deterministic_fresh_test_not_mandatory')
if (!vercelCosGates.includes("'tests/assistantTransportClient.node.test.ts'")) failures.push('assistant_transport_client_test_not_mandatory')
if (!vercelCosGates.includes("'tests/operationalSystemsLearning.node.test.ts'")) failures.push('operational_learning_test_not_mandatory')
if (!vercelCosGates.includes("'tests/advisoryDiagnosisPolicy.node.test.ts'")) failures.push('advisory_diagnosis_policy_test_not_mandatory')

console.log(JSON.stringify({ ok: failures.length === 0, schema: 'signalboost-cos-blueprint-v1', failures }, null, 2))
if (failures.length) process.exit(1)
