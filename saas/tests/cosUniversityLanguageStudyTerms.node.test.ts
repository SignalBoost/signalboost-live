// saas/tests/cosUniversityLanguageStudyTerms.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  platformLanguageStudyGapSignal,
  selectCosUniversityStudyStrategy,
} from '../lib/ai/cos/cosUniversityStudyStrategy.ts'
import { platformLanguageDiscoveryQuery } from '../lib/ai/cos/cosUniversityLanguageDiscoveryQuery.ts'
import { COS_PLATFORM_LANGUAGES } from '../lib/ai/cos/cosUniversityLanguages.ts'

const languageStrategy = selectCosUniversityStudyStrategy({ failureClass: 'language' })
import { generateKnowledgeGaps } from '../lib/cos-core/layers/learning/gaps.ts'

function wholeLanguageSignal(studyVariant?: number) {
  return platformLanguageStudyGapSignal({
    planKey: '71ef90dc400fb1925734b2f4fbedf481238984271a2032e9686af1110cf20cff',
    language: 'pt',
    dimension: null,
    objective: 'restore Portuguese language competence',
    strategy: languageStrategy,
    ...(studyVariant === undefined ? {} : { studyVariant }),
  })
}

test('a whole-language plan carries study themes instead of nothing', () => {
  const signal = wholeLanguageSignal()
  assert.ok(signal.missingFacts?.length, 'a dimensionless language plan had no study themes at all')
  assert.ok(signal.missingFacts?.every(fact => fact.startsWith('Portuguese ')), String(signal.missingFacts))
})

// Acquisition is asked IN the language being studied (cosUniversityLanguageDiscoveryQuery.ts):
// an English "Portuguese reading comprehension" query only retrieves English writing ABOUT
// Portuguese, which is why native admissions stayed at zero.
test('acquisition searches the language and what is studied about it, not the boilerplate question', () => {
  const query = wholeLanguageSignal().discoveryQuery || ''
  assert.equal(query, platformLanguageDiscoveryQuery({ language: 'pt', dimension: null, studyVariant: undefined }))
  assert.ok(query.startsWith('língua portuguesa '), query)
  assert.ok(!/verified knowledge|higher confidence/i.test(query), query)
})

test('the rotation actually changes the query across study variants', () => {
  const queries = new Set([0, 1, 2, 3, 4].map(variant => wholeLanguageSignal(variant).discoveryQuery))
  assert.ok(queries.size >= 4, `expected the query to rotate, got ${queries.size} distinct: ${[...queries].join(' | ')}`)
})

test('the gap the cycle sees now carries language study terms, not only boilerplate', () => {
  // The production failure: 733 of 883 Portuguese documents rejected as not relevant, none accepted.
  // Relevance is scored against the gap's subject and question, so the question must name what is
  // actually being studied rather than only "what verified knowledge would let COS handle X".
  const [gap] = generateKnowledgeGaps([wholeLanguageSignal()])
  assert.ok(gap)
  assert.ok(/comprehension|composition/i.test(gap.question), gap.question)
  assert.ok(!/what verified knowledge would let cos handle/i.test(gap.question), gap.question)
  assert.ok((gap.discoveryQuery || '').startsWith('língua portuguesa '), gap.discoveryQuery)
})

test('a dimension-scoped plan keeps the themes it already had', () => {
  const scoped = platformLanguageStudyGapSignal({
    planKey: 'scoped',
    language: 'pl',
    dimension: 'writing',
    objective: 'restore Polish writing competence',
    strategy: languageStrategy,
  })
  assert.ok(scoped.missingFacts?.every(fact => fact.startsWith('Polish ')), String(scoped.missingFacts))
  assert.equal(scoped.discoveryQuery, platformLanguageDiscoveryQuery({ language: 'pl', dimension: 'writing' }))
  assert.ok(/gramatyka|akapitu|tekstu/.test(scoped.discoveryQuery || ''), scoped.discoveryQuery)
})

// What each language's query must be written in. English has no native profile by design and
// keeps the English study terms; every other platform language is searched in its own script.
const NATIVE_QUERY_EVIDENCE: Record<string, RegExp> = {
  en: /^English /,
  es: /[a-záéíóúñ]/i,
  pt: /[a-zãõçáéíóú]/i,
  pl: /[a-ząćęłńóśźż]/i,
  ru: /[\u0400-\u04FF]/,
  de: /[A-Za-zäöüß]/,
  fr: /[a-zàâçéèêëîïôûù]/i,
  it: /[a-zàèéìòù]/i,
  ja: /[\u3040-\u30ff\u4e00-\u9fff]/,
  ko: /[\uac00-\ud7af]/,
  ar: /[\u0600-\u06ff]/,
}

test('every platform language gets a study query in that language, whole and per dimension', () => {
  assert.equal(COS_PLATFORM_LANGUAGES.length, 11)
  for (const language of COS_PLATFORM_LANGUAGES) {
    const evidence = NATIVE_QUERY_EVIDENCE[language.id]
    assert.ok(evidence, `no expectation for ${language.id}`)
    for (const dimension of [null, ...language.competencyDimensions]) {
      const signal = platformLanguageStudyGapSignal({
        planKey: `all-${language.id}-${dimension || 'whole'}`,
        language: language.id,
        dimension,
        objective: `restore ${language.title} language competence`,
        strategy: languageStrategy,
      })
      const query = signal.discoveryQuery || ''
      assert.ok(query.length > 0, `${language.id}/${dimension}: empty query`)
      assert.ok(!/verified knowledge|higher confidence/i.test(query), `${language.id}/${dimension}: ${query}`)
      assert.ok(evidence.test(query), `${language.id}/${dimension}: ${query}`)
      if (language.id !== 'en') assert.ok(!query.startsWith(`${language.title} `), `${language.id}/${dimension} fell back to English: ${query}`)
      assert.ok(signal.missingFacts?.every(fact => fact.startsWith(`${language.title} `)), String(signal.missingFacts))
    }
  }
})
