import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

test('HF open datasets receive bounded rotating exact-source daily acquisition', () => {
  const daily = readFileSync(join(process.cwd(), 'lib/cos/dailyAutonomousLearning.ts'), 'utf8')
  const cycle = readFileSync(join(process.cwd(), 'lib/cos-core/layers/learning/cycle.ts'), 'utf8')
  const caps = readFileSync(join(process.cwd(), 'lib/cos-core/layers/learning/learningSourceCaps.ts'), 'utf8')

  assert.match(daily, /const HF_NIST_DAILY_QUERIES = Object\.freeze\(\[/)
  assert.match(daily, /const HF_GITHUB_CC0_DAILY_QUERIES = Object\.freeze\(\[/)
  assert.match(daily, /const HF_ARXIV_DAILY_QUERIES = Object\.freeze\(\[/)
  assert.match(daily, /function utcLearningDay\(now: Date\): number/)
  assert.match(daily, /export function huggingFaceOpenDatasetCurriculum\(now: Date = new Date\(\)\): KnowledgeGap\[\]/)

  assert.match(daily, /id: 'curriculum:hf-nist-cc0-continuous'[\s\S]*?sourceKinds: \['public_dataset'\][\s\S]*?allowedAdapterIds: \['hf_nist_cc0'\]/)
  assert.match(daily, /id: 'curriculum:hf-github-cc0-continuous'[\s\S]*?sourceKinds: \['public_dataset'\][\s\S]*?allowedAdapterIds: \['hf_github_cc0'\]/)
  assert.match(daily, /id: 'curriculum:hf-arxiv-metadata-continuous'[\s\S]*?sourceKinds: \['public_dataset'\][\s\S]*?allowedAdapterIds: \['hf_arxiv_cc0'\]/)
  assert.match(daily, /const hfOpenDatasetCurriculum = huggingFaceOpenDatasetCurriculum\(\)/)
  assert.match(daily, /const generalCurriculum = \[\.\.\.hfOpenDatasetCurriculum, \.\.\.recurringTechnologyCurriculum\(\)/)

  assert.match(cycle, /gap\.allowedAdapterIds/)
  assert.match(cycle, /if\(exact\.size&&\(!adapter\.id\|\|!exact\.has\(adapter\.id\)\)\)return false/)
  assert.match(caps, /hf_nist_cc0:\s*3/)
  assert.match(caps, /hf_github_cc0:\s*4/)
  assert.match(caps, /hf_arxiv_cc0:\s*3/)
})


test('Semantic Scholar and Wikimedia receive exact-source rotating continuity objectives before generic gaps', () => {
  const daily = readFileSync(join(process.cwd(), 'lib/cos/dailyAutonomousLearning.ts'), 'utf8')

  assert.match(daily, /const SEMANTIC_SCHOLAR_CONTINUOUS_QUERIES = Object\.freeze\(\[/)
  assert.match(daily, /const WIKIMEDIA_CONTINUOUS_TOPICS = Object\.freeze\(\[/)
  assert.match(daily, /function utcLearningHour\(now: Date\): number/)
  assert.match(daily, /export function openSourceContinuityCurriculum\(now: Date = new Date\(\)\): KnowledgeGap\[\]/)

  assert.match(daily, /id: 'curriculum:semantic-scholar-continuous'[\s\S]*?sourceKinds: \['scientific_journal'\][\s\S]*?allowedAdapterIds: \['semantic_scholar'\]/)
  assert.ok(daily.includes('curriculum:wikimedia-continuous-'))
  assert.match(daily, /sourceKinds: \['approved_public_web'\][\s\S]*?allowedAdapterIds: \['reference'\]/)
  assert.match(daily, /const openSourceContinuity = openSourceContinuityCurriculum\(\)/)
  assert.match(daily, /const gaps = \[\.\.\.openSourceContinuity, miningGap\(input\.miningSummary\), \.\.\.autonomousGaps, \.\.\.generalCurriculum\]/)
  assert.match(daily, /openSourceContinuityQueries:/)
})


test('Semantic Scholar and Wikimedia continuity has a dedicated bounded 15-minute cron', () => {
  const continuity = readFileSync(join(process.cwd(), 'lib/cos/openSourceContinuityLearning.ts'), 'utf8')
  const route = readFileSync(join(process.cwd(), 'app/api/cron/cos-open-source-continuity/route.ts'), 'utf8')
  const vercel = readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')

  assert.match(continuity, /openSourceContinuityCurriculum/)
  assert.match(continuity, /allowedAdapterIds\?\.includes\('semantic_scholar'\)/)
  assert.match(continuity, /allowedAdapterIds\?\.includes\('reference'\)/)
  assert.match(continuity, /maxCandidatesPerCycle: 12/)
  assert.match(continuity, /maxExternalCostUsdPerCycle: 0/)
  assert.match(continuity, /\[cos-open-source-continuity\]/)
  assert.match(route, /runOpenSourceContinuityLearning/)
  assert.match(route, /CRON_SECRET/)
  assert.match(vercel, /"path": "\/api\/cron\/cos-open-source-continuity"/)
  assert.match(vercel, /"schedule": "\*\/15 \* \* \* \*"/)
})


test('open-source continuity rotates on the 15-minute cron slot instead of hourly', () => {
  const daily = readFileSync(join(process.cwd(), 'lib/cos/dailyAutonomousLearning.ts'), 'utf8')
  assert.match(daily, /function utcLearningQuarterHour\(now: Date\): number/)
  assert.match(daily, /Math\.floor\(value\.getTime\(\) \/ \(15 \* 60_000\)\)/)
  assert.match(daily, /const slot = utcLearningQuarterHour\(now\)/)
  assert.match(daily, /rotatingItem\(SEMANTIC_SCHOLAR_CONTINUOUS_QUERIES, slot\)/)
  assert.match(daily, /rotatingItem\(WIKIMEDIA_CONTINUOUS_TOPICS, slot \* 3 \+ offset\)/)
})
