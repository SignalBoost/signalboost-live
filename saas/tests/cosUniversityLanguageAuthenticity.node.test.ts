import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cosUniversityLanguageAuthenticityReasons,
  languageSignalDensity,
  packetShingleOverlap,
  MAXIMUM_PACKET_SHINGLE_OVERLAP,
} from '../lib/ai/cos/cosUniversityLanguageAuthenticity.ts'
import {
  buildCosUniversityLanguageARangeExam,
  scoreCosUniversityLanguageARangeExam,
} from '../lib/ai/cos/cosUniversityLanguageARange.ts'

const PROVENANCE = {
  handled: true, localReasoning: true, externalAi: false, semanticCache: false,
  turnId: '55555555-5555-4555-8555-555555555555',
} as const

const WRITTEN = {
  es: 'El equipo confirmó que el proyecto superó las verificaciones de lanzamiento, pero eso no demuestra que Producción esté lista. El despliegue sigue sin verificarse y la revisión de seguridad conserva un punto de control de acceso pendiente. Tampoco se ha aportado la autorización regulatoria local, así que el presupuesto sigue expuesto. Propongo decidir cuando la evidencia esté reunida.',
  pt: 'A equipe confirmou que o projeto passou nas verificações de lançamento, mas isso não comprova a prontidão da Produção. A implantação continua sem verificação e a revisão de segurança mantém um item de controle de acesso pendente. A autorização regulatória local também não foi fornecida, portanto o orçamento permanece exposto. Proponho decidir quando a evidência estiver reunida.',
  pl: 'Zespół potwierdził, że projekt przeszedł kontrole wydania, ale to nie dowodzi gotowości Produkcji. Wdrożenie produkcyjne nadal nie zostało zweryfikowane, a przegląd bezpieczeństwa ma jedną nierozstrzygniętą kwestię kontroli dostępu. Nie mamy również lokalnego zezwolenia regulacyjnego, więc budżet pozostaje obciążony ryzykiem. Proponuję decyzję po zebraniu dowodów.',
  ru: 'Команда подтвердила, что проект прошёл проверки выпуска, но это не доказывает готовность Production. Развертывание по-прежнему не подтверждено, и в проверке безопасности остаётся нерешённый вопрос контроля доступа. Местное регуляторное разрешение также не предоставлено, поэтому бюджет остаётся под риском. Предлагаю решение после сбора доказательств.',
  en: 'The team confirmed that the project passed its release checks, but that does not prove Production readiness. The deployment is still unverified and the security review has one unresolved access control item. Local regulatory clearance has not been provided, so the budget remains exposed. I propose a decision once the evidence is gathered.',
} as const

test('the repository regression that passed was a bag of the rubric its own required terms', () => {
  const exam = buildCosUniversityLanguageARangeExam({
    seed: '55555555-5555-4555-8555-555555555555',
    target: { stage: 'cross_domain_transfer', language: 'pl', dimension: 'writing' },
  })
  // This is the exact shape the previous test used as a passing reply: every required group's first
  // term, joined, plus one sentence. Term coverage is supplied by the rubric, so it proves nothing.
  const bag = [
    ...exam.rubric.requiredGroups.map(group => group[0]),
    'Projekt pozostaje nieznany tam, gdzie brak weryfikacji.',
  ].join(' ')
  const score = scoreCosUniversityLanguageARangeExam(exam, bag, PROVENANCE)
  assert.equal(score.passed, false)
  assert.ok(score.reasons.includes('target_language_prose_missing'), score.reasons.join(','))
})

test('English prose sprinkled with the localized terms cannot pass a Polish exam', () => {
  const exam = buildCosUniversityLanguageARangeExam({
    seed: '55555555-5555-4555-8555-555555555555',
    target: { stage: 'cross_domain_transfer', language: 'pl', dimension: 'writing' },
  })
  const paraphrase = [
    'Project Orion has passed its release checks, but the bezpieczeństwo review still has one',
    'unresolved kontrola dostępu item and the regulacyjne clearance remains nieznane.',
    'The budżet ceiling is unchanged and leadership needs a decision.',
    'Production deployment is not verified, so the evidence is incomplete.',
  ].join(' ')
  const score = scoreCosUniversityLanguageARangeExam(exam, paraphrase, PROVENANCE)
  assert.equal(score.passed, false)
  assert.ok(score.reasons.includes('dominant_language_not_target:en'), score.reasons.join(','))
})

test('copying the supplied packet back is not evidence of writing it', () => {
  const exam = buildCosUniversityLanguageARangeExam({
    seed: '77777777-7777-4777-8777-777777777777',
    target: { stage: 'cross_domain_transfer', language: 'es', dimension: 'writing' },
  })
  const score = scoreCosUniversityLanguageARangeExam(exam, exam.packet, PROVENANCE)
  assert.equal(score.passed, false)
  assert.ok(score.reasons.includes('supplied_packet_copied'), score.reasons.join(','))
  assert.ok(packetShingleOverlap(exam.packet, exam.packet) > MAXIMUM_PACKET_SHINGLE_OVERLAP)
})

test('original prose in the target language still passes, in every platform language', () => {
  for (const language of ['es', 'pt', 'pl', 'ru', 'en'] as const) {
    assert.deepEqual(
      cosUniversityLanguageAuthenticityReasons({ reply: WRITTEN[language], packet: '', targetLanguage: language }),
      [], language,
    )
  }
})

test('one platform language cannot be handed in for another, including Spanish for Portuguese', () => {
  for (const target of ['es', 'pt', 'pl', 'ru', 'en'] as const) {
    for (const written of ['es', 'pt', 'pl', 'ru', 'en'] as const) {
      const reasons = cosUniversityLanguageAuthenticityReasons({
        reply: WRITTEN[written], packet: '', targetLanguage: target,
      })
      if (target === written) continue
      assert.ok(reasons.includes(`dominant_language_not_target:${written}`), `${written} accepted as ${target}: ${reasons.join(',')}`)
    }
  }
})

test('signal density counts a token once however many signals it carries', () => {
  // Cyrillic tokens are both orthography and, some of them, function words. Double counting used to
  // push Russian above 1.0, which would let one long word outweigh a sentence.
  for (const language of ['es', 'pt', 'pl', 'ru', 'en'] as const) {
    const density = languageSignalDensity(WRITTEN[language], language)
    assert.ok(density > 0 && density <= 1, `${language}=${density}`)
  }
})

test('an empty or unscorable reply is reported without throwing', () => {
  assert.deepEqual(
    cosUniversityLanguageAuthenticityReasons({ reply: '   ', packet: 'x', targetLanguage: 'pl' }),
    ['authenticity_empty_reply'],
  )
  assert.deepEqual(
    cosUniversityLanguageAuthenticityReasons({ reply: '...', packet: '', targetLanguage: 'ru' }),
    ['authenticity_empty_reply'],
  )
})

test('the packet travels on the exam so the scorer can see what the learner was given', () => {
  const transfer = buildCosUniversityLanguageARangeExam({
    seed: '88888888-8888-4888-8888-888888888888',
    target: { stage: 'cross_domain_transfer', language: 'ru', dimension: 'comprehension' },
  })
  const capstone = buildCosUniversityLanguageARangeExam({
    seed: '88888888-8888-4888-8888-888888888888',
    target: { stage: 'capstone', language: 'ru', dimension: null },
  })
  assert.ok(transfer.packet.length > 0)
  assert.ok(transfer.prompt.includes(transfer.packet))
  assert.ok(capstone.prompt.includes(capstone.packet))
  // Translation work is handed a source in another language; that is the packet to compare against.
  const translation = buildCosUniversityLanguageARangeExam({
    seed: '88888888-8888-4888-8888-888888888888',
    target: { stage: 'cross_domain_transfer', language: 'ru', dimension: 'translation_localization' },
  })
  assert.notEqual(translation.packet, transfer.packet)
  assert.ok(translation.prompt.includes(translation.packet))
})
