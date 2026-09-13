// saas/tests/cosUniversityCurriculumExamAlignment.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { COS_UNIVERSITY_SUBJECTS, cosUniversitySubjectById } from '../lib/ai/cos/cosUniversity.ts'

function themesOf(subjectId: string): string {
  return (cosUniversitySubjectById(subjectId as never)?.studyThemes ?? []).join(' | ').toLowerCase()
}

test('History studies historical method, not only historical content', () => {
  const themes = themesOf('history_culture_philosophy_religion')
  assert.match(themes, /historiograph|source criticism/, themes)
})

test('Reasoning already studies the method its exam tests, and still does', () => {
  const themes = themesOf('reasoning_decision_science')
  assert.match(themes, /logic and evidence evaluation/, themes)
})

test('Quantum Computing studies its required foundations', () => {
  const themes = themesOf('quantum_computing')
  assert.match(themes, /qubits/)
  assert.match(themes, /measurement/)
  assert.match(themes, /error correction/)
  assert.match(themes, /quantum-classical/)
})

test('the existing content themes are kept, not replaced', () => {
  const themes = themesOf('history_culture_philosophy_religion')
  for (const kept of ['world history', 'cultural systems', 'philosophy and intellectual history',
    'religion and institutions', 'historical context for current systems']) {
    assert.ok(themes.includes(kept), `${kept} was dropped`)
  }
})

test('every subject keeps enough themes to rotate acquisition across cycles', () => {
  for (const subject of COS_UNIVERSITY_SUBJECTS) {
    assert.ok(subject.studyThemes.length >= 4, `${subject.id} has ${subject.studyThemes.length}`)
    assert.equal(new Set(subject.studyThemes).size, subject.studyThemes.length, `${subject.id} repeats a theme`)
    for (const theme of subject.studyThemes) assert.ok(theme.trim().length > 3, `${subject.id}: "${theme}"`)
  }
})

test('the fourteen-subject core includes Quantum Computing once', () => {
  assert.equal(COS_UNIVERSITY_SUBJECTS.length, 14)
  assert.equal(new Set(COS_UNIVERSITY_SUBJECTS.map(s => s.id)).size, 14)
  assert.equal(COS_UNIVERSITY_SUBJECTS.filter(s => s.id === 'quantum_computing').length, 1)
})
