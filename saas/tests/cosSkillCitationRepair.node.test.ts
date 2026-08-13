import assert from 'node:assert/strict'
import test from 'node:test'
import { skillCitationRepairNeeded, skillCitationTags, validSkillCitationOnlyRepair } from '../lib/ai/cos/cosReasoner'

test('skill citation audit is needed only when a skill was supplied but not cited', () => {
  assert.equal(skillCitationRepairNeeded('Use [SK1] when relevant.', 'Answer with no citation.'), true)
  assert.equal(skillCitationRepairNeeded('Use [SK1] when relevant.', 'Answer [SK1].'), false)
  assert.equal(skillCitationRepairNeeded('No procedural skill supplied.', 'Answer with no citation.'), false)
})

test('skill citation tags are normalized and unique', () => {
  assert.deepEqual(skillCitationTags('Use [SK01], [SK1], and [SK2].'), ['[SK1]', '[SK2]'])
})

test('citation-only repair accepts only supplied tags and unchanged substance', () => {
  const original = 'Rank the query-plan threshold first. Then test the pool wait.'
  assert.equal(
    validSkillCitationOnlyRepair(original, 'Rank the query-plan threshold first [SK1]. Then test the pool wait.', ['[SK1]']),
    true,
  )
  assert.equal(
    validSkillCitationOnlyRepair(original, 'Rank the query-plan threshold first [SK2]. Then test the pool wait.', ['[SK1]']),
    false,
  )
  assert.equal(
    validSkillCitationOnlyRepair(original, 'Rank the connection pool first [SK1]. Then test the pool wait.', ['[SK1]']),
    false,
  )
})

test('server cannot manufacture a citation when model adds none', () => {
  const original = 'Use tenant asymmetry as evidence.'
  assert.equal(validSkillCitationOnlyRepair(original, original, ['[SK1]']), false)
})
