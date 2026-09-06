import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  assessDirectedStudy,
  directedContentHash,
  directedEvidence,
  validateDirectedSubmission,
  type DirectedStudyGates,
  type DirectedStudySubmission,
} from '../lib/ai/cos/directedStudy.ts'

const gates: DirectedStudyGates = {
  distinctTerms: text => [...new Set(String(text).toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length >= 4))],
  relevanceOf: (document, terms) => {
    const haystack = `${document.sourceTitle || ''} ${document.text}`.toLowerCase()
    const anchorsMatched = terms.anchors.filter(term => haystack.includes(term))
    const supportingMatched = terms.supporting.filter(term => haystack.includes(term))
    const denominator = terms.anchors.length * 2 + terms.supporting.length
    return {
      coverage: denominator ? (anchorsMatched.length * 2 + supportingMatched.length) / denominator : 0,
      anchorsMatched,
      supportingMatched,
      totalMatched: anchorsMatched.length + supportingMatched.length,
    }
  },
  sourceAwareRelevant: (_, score) => score.anchorsMatched.length > 0 && score.coverage >= 0.12,
  candidate0Confidence: (_, score) => 0.48 + 0.5 * score.coverage,
}

const input: DirectedStudySubmission = {
  topic: 'transformer attention mechanisms',
  studyIntent: 'Learn how attention distributes transformer context for retrieval.',
  materialKind: 'book',
  license: 'purchased copy, internal study use',
  sourceUri: 'owner://book/chapter',
  text: 'Transformer attention mechanisms compute weighted combinations of value vectors. Multi head attention distributes context through transformer layers for efficient retrieval.'.repeat(2),
}

const directedStudyPage = readFileSync(new URL('../app/dashboard/cos-directed-study/page.tsx', import.meta.url), 'utf8')
const continuityEmail = readFileSync(new URL('../app/api/cron/cos-learning-continuity/route.ts', import.meta.url), 'utf8')
const miningCron = readFileSync(new URL('../app/api/cron/cos-mining/route.ts', import.meta.url), 'utf8')
const foundationalLearningPage = readFileSync(new URL('../app/dashboard/cos-learning/page.tsx', import.meta.url), 'utf8')

test('owner-directed material is admitted when it is substantive and provenance requirements are present', () => {
  const result = assessDirectedStudy(input, gates)
  assert.equal(result.ok, true)
  assert.equal(result.admitted, 1)
  assert.equal(result.rejected, 0)
  assert.equal(result.sourceKind, 'library_material')
  assert.equal(result.chunks[0]?.reason, 'admitted_owner_directed')
  assert.equal(result.chunks[0]?.admissionBasis, 'owner_directed_intent')
  assert.equal(result.learningRoute.specialistFamily, 'software')
  assert.ok(result.learningRoute.curriculumTracks.includes('software.development'))
  assert.equal(result.learningRoute.authorityGranted, false)
})

test('multilingual owner-directed literature cannot be vetoed by weak English keyword overlap', () => {
  const portugueseLiterature: DirectedStudySubmission = {
    topic: 'Lusophone literary history',
    studyIntent: 'Study prose style, historical context, and vocabulary across canonical works.',
    materialKind: 'book',
    license: 'public domain, internal study use',
    sourceUri: 'owner://literature/portuguese/sample',
    sourceTitle: 'Trecho de literatura em língua portuguesa',
    text: (
      'Naquela manhã, a cidade parecia guardar a memória de muitas gerações. ' +
      'As vozes das ruas, os gestos das famílias e a cadência das palavras revelavam um mundo inteiro ao leitor. '
    ).repeat(8),
  }

  const result = assessDirectedStudy(portugueseLiterature, gates)
  assert.equal(result.ok, true)
  assert.equal(result.admitted, 1, 'explicit owner study intent establishes relevance')
  assert.equal(result.rejected, 0)
  assert.equal(result.chunks[0]?.intentAligned, false, 'lexical relevance may remain weak and diagnostic')
  assert.equal(result.chunks[0]?.matchedTerms.length, 0)
  assert.equal(result.chunks[0]?.reason, 'admitted_owner_directed')
  assert.equal(result.learningRoute.specialistFamily, null)
})

test('owner authority does not bypass minimum substance or provenance requirements', () => {
  assert.match(String(validateDirectedSubmission({ ...input, license: '' })), /license/)
  assert.match(String(validateDirectedSubmission({ ...input, studyIntent: 'learn it' })), /studyIntent/)
  assert.match(String(validateDirectedSubmission({ ...input, text: 'too short' })), /too short/)
})

test('stable source-specific hashes and owner admission provenance are preserved', () => {
  assert.equal(directedContentHash(input.sourceUri, input.text), directedContentHash(input.sourceUri, input.text))
  assert.notEqual(directedContentHash(input.sourceUri, input.text), directedContentHash('owner://other', input.text))
  const evidence = directedEvidence(input)
  assert.ok(evidence.includes('owner_directed_study'))
  assert.ok(evidence.includes('admission_basis:owner_directed_intent'))
  assert.ok(evidence.includes('learning_orchestrator:cos'))
  assert.ok(evidence.includes('specialist_family:software'))
  assert.ok(evidence.includes('specialist_authority_granted:false'))
})

test('owner UI reports route, retention, and honest application status after feeding', () => {
  assert.match(directedStudyPage, /learningRoute\.specialistFamily === 'software'/)
  assert.match(directedStudyPage, /knownKnowledgeReinforced/)
  assert.match(directedStudyPage, /result\.application\?\.status === 'queued'/)
  assert.match(directedStudyPage, /Evaluation queue/)
  assert.doesNotMatch(directedStudyPage, /applicationValidation[^\n]*passed/i)
})

test('directed-study store hands admitted software lessons to the governed cognitive lifecycle', () => {
  const store = readFileSync(new URL('../lib/ai/cos/directedStudyStore.ts', import.meta.url), 'utf8')
  const activeLearning = readFileSync(new URL('../lib/ai/cos/cognitiveActiveLearning.ts', import.meta.url), 'utf8')
  assert.match(store, /queueProceduralApplication/)
  assert.match(store, /cos_teacher_lessons/)
  assert.match(store, /queued_for_candidate_extraction_practice_and_independent_evaluation/)
  assert.match(store, /authorityGranted: false/)
  assert.match(activeLearning, /specialistFamily: lesson\.metadata\.specialistFamily/)
  assert.match(activeLearning, /applicationLifecycle: 'candidate_created_awaiting_evidence'/)
})

test('daily learning backfills pre-loop software lessons idempotently into the governed queue', () => {
  const store = readFileSync(new URL('../lib/ai/cos/directedStudyStore.ts', import.meta.url), 'utf8')
  assert.match(store, /backfillDirectedSoftwareApplications/)
  assert.match(store, /owner_directed_study', 'specialist_family:software'/)
  assert.match(store, /source URI \+ original study intent retain idempotency/i)
  assert.match(store, /specialistFamily: 'software'/)
  assert.doesNotMatch(store, /status:\s*'(?:validated|learned|mastered)'/)
  assert.match(miningCron, /await backfillDirectedSoftwareApplications\(200\)/)
  assert.ok(miningCron.indexOf('backfillDirectedSoftwareApplications(200)') < miningCron.indexOf('runGovernedCognitiveLearningCycle()'))
})

test('foundational learning displays live software application progress', () => {
  assert.match(foundationalLearningPage, /api\/admin\/cos-specialist-learning/)
  assert.match(foundationalLearningPage, /applicationProgress\?\.sources/)
  assert.match(foundationalLearningPage, /applicationProgress\?\.validated/)
  assert.match(foundationalLearningPage, /softwareApplicationExplanation/)
})

test('learning alert points to current specialist telemetry and never obsolete RunPod', () => {
  assert.match(continuityEmail, /api\/admin\/cos-specialist-learning/)
  assert.doesNotMatch(continuityEmail, /api\/admin\/cos-runpod/)
})
