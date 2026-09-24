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
  assert.match(daily, /const curriculum = \[\.\.\.hfOpenDatasetCurriculum, \.\.\.recurringTechnologyCurriculum\(\)/)

  assert.match(cycle, /gap\.allowedAdapterIds/)
  assert.match(cycle, /if\(exact\.size&&\(!adapter\.id\|\|!exact\.has\(adapter\.id\)\)\)return false/)
  assert.match(caps, /hf_nist_cc0:\s*3/)
  assert.match(caps, /hf_github_cc0:\s*4/)
  assert.match(caps, /hf_arxiv_cc0:\s*3/)
})
