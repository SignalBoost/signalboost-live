import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { generateKnowledgeGaps } from '../lib/cos-core/layers/learning/gaps.ts'
import {
  selectCosUniversityStudyStrategy,
  universityStudyGapSignal,
} from '../lib/ai/cos/cosUniversityStudyStrategy.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

function physicsGap() {
  const signal = universityStudyGapSignal({
    planKey: 'physics-remediation-plan',
    subjectId: 'physics_natural_sciences',
    objective: 'Remediate the weakness demonstrated by a fresh independent unseen Physics & Natural Sciences examination, then prove improvement.',
    failureClass: 'unknown',
    strategy: selectCosUniversityStudyStrategy({ failureClass: 'unknown' }),
  })
  const [gap] = generateKnowledgeGaps([signal])
  assert.ok(gap)
  return { signal, gap }
}

test('University study gaps put host-owned curriculum themes before remediation prose', () => {
  const { signal, gap } = physicsGap()
  assert.ok(signal.missingFacts?.includes('physics and mechanics'))
  assert.ok(signal.missingFacts?.includes('scientific method'))
  assert.match(gap.question, /^physics and mechanics; chemistry and biology fundamentals; scientific method;/i)

  const boundedQuestionTerms = gap.question.toLowerCase().match(/[a-z0-9]+/g)?.slice(0, 12) ?? []
  assert.ok(boundedQuestionTerms.includes('mechanics'))
  assert.ok(boundedQuestionTerms.includes('scientific'))
  assert.ok(!boundedQuestionTerms.includes('weakness'))
})

test('bounded scholarly discovery receives canonical curriculum content before generic remediation wording', () => {
  const { gap } = physicsGap()
  const query = `${gap.subject} ${gap.question}`
  const boundedPrefix = query.split(/\s+/).filter(Boolean).slice(0, 10).join(' ')
  assert.match(boundedPrefix, /physics and mechanics/i)
  assert.doesNotMatch(boundedPrefix, /verified knowledge/i)
  assert.doesNotMatch(boundedPrefix, /higher confidence/i)

  const connectors = file('lib/cos-core/layers/learning/connectors.ts')
  const publicClients = file('lib/cos-core/layers/learning/publicClients.ts')
  assert.match(connectors, /`\$\{gap\.subject\} \$\{gap\.question\}`/)
  assert.match(publicClients, /compactQuery\(query,maxTerms=10\)/)
  assert.match(publicClients, /compactQuery\(query,8\)/)
})

test('academic focus changes relevance inputs without lowering the global relevance floor', () => {
  const { gap } = physicsGap()
  const cycle = file('lib/cos-core/layers/learning/cycle.ts')
  assert.match(cycle, /distinctTerms\(gap\.question\)\.filter\(term=>!anchorSet\.has\(term\)\)\.slice\(0,12\)/)
  assert.match(cycle, /envNumber\('COS_LEARNING_MIN_RELEVANCE',0\.12,0,1\)/)
  assert.doesNotMatch(gap.question.slice(0, 160).toLowerCase(), /higher confidence/)
})
