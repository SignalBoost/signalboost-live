// saas/tests/cosUniversityCurriculumExamAlignment.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { COS_UNIVERSITY_SUBJECTS, cosUniversitySubjectById } from '../lib/ai/cos/cosUniversity.ts'

/**
 * A subject's study themes decide what acquisition searches for; its independent exam decides what
 * is asked. When the exam tests method and the themes name only content, the learner studies the
 * wrong material and the subject can never pass — which is what History showed in production.
 */
function themesOf(subjectId: string): string {
  return (cosUniversitySubjectById(subjectId as never)?.studyThemes ?? []).join(' | ').toLowerCase()
}

test('History studies historical method, not only historical content', () => {
  // Its exam asks how a primary diary and a 2024 scholarly synthesis differ evidentially, and what
  // corroboration is needed before preferring either causal account.
  const themes = themesOf('history_culture_philosophy_religion')
  assert.match(themes, /historiograph|source criticism/, themes)
})

test('Reasoning already studies the method its exam tests, and still does', () => {
  const themes = themesOf('reasoning_decision_science')
  assert.match(themes, /logic and evidence evaluation/, themes)
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

test('the thirteen-subject core is unchanged', () => {
  assert.equal(COS_UNIVERSITY_SUBJECTS.length, 13)
  assert.equal(new Set(COS_UNIVERSITY_SUBJECTS.map(s => s.id)).size, 13)
})
