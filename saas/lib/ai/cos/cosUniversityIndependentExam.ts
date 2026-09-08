import { createHash } from 'node:crypto'
import {
  COS_UNIVERSITY_SUBJECTS,
  cosUniversitySubjectById,
  type CosUniversityAssessmentKind,
  type CosUniversitySubjectId,
} from './cosUniversity.ts'
import {
  COS_PLATFORM_LANGUAGES,
  type CosPlatformLanguage,
  type CosPlatformLanguageDimension,
} from './cosUniversityLanguages.ts'

export const COS_UNIVERSITY_EXAM_PROFILE = 'cos_university_unseen_v1'
export const COS_UNIVERSITY_EXAM_SCORER = 'university-host-scorer-v2'
export const COS_UNIVERSITY_MINIMUM_UNSEEN_PASSES = 2

export type CosUniversityExamTarget =
  | { kind: 'subject'; subjectId: CosUniversitySubjectId }
  | { kind: 'language'; language: CosPlatformLanguage; dimension: CosPlatformLanguageDimension }

export type CosUniversityExamRubric = Readonly<{
  requiredGroups: readonly (readonly string[])[]
  forbiddenTerms?: readonly string[]
  exactPatterns?: readonly string[]
  maxWords?: number
  numberedActions?: number
  targetLanguage?: CosPlatformLanguage
}>

export type CosUniversityBlindExam = Readonly<{
  profile: typeof COS_UNIVERSITY_EXAM_PROFILE
  scorerVersion: typeof COS_UNIVERSITY_EXAM_SCORER
  seed: string
  caseId: string
  assessmentKind: Extract<CosUniversityAssessmentKind, 'unseen_subject_exam'>
  target: CosUniversityExamTarget
  title: string
  prompt: string
  rubric: CosUniversityExamRubric
  manifestHash: string
}>

export type CosUniversityExamProvenance = {
  localReasoning?: boolean
  externalAi?: boolean
  semanticCache?: boolean
  handled?: boolean
  turnId?: string | null
}

export type CosUniversityExamScore = {
  passed: boolean
  reasons: string[]
}

export type CosUniversityExamAssessmentRow = {
  subject_id: CosUniversitySubjectId | null
  language_code: CosPlatformLanguage | null
  language_dimension: CosPlatformLanguageDimension | null
  assessment_kind: CosUniversityAssessmentKind
  passed: boolean
  independent_scorer: boolean
  scorer_authority: string
  observed_at: string
  valid_until: string
}

const LANGUAGE_DIMENSIONS: readonly CosPlatformLanguageDimension[] = [
  'comprehension',
  'writing',
  'instruction_following',
  'translation_localization',
  'cultural_pragmatics',
]

function digest(seed: string, label: string): Buffer {
  return createHash('sha256').update(`${seed}:${label}`).digest()
}

function integer(seed: string, label: string, min: number, max: number): number {
  return min + (digest(seed, label).readUInt32BE(0) % (max - min + 1))
}

function choose<T>(seed: string, label: string, values: readonly T[]): T {
  return values[digest(seed, label).readUInt32BE(0) % values.length]
}

function normalize(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function words(value: string): number {
  return String(value ?? '').trim().match(/\S+/g)?.length ?? 0
}

function hasAny(text: string, terms: readonly string[]): boolean {
  const value = normalize(text)
  return terms.some(term => value.includes(normalize(term)))
}

function exactNumberPattern(value: number): string {
  const escaped = String(value).replace('.', '\\.')
  return `(?:^|[^0-9])${escaped}(?:[^0-9]|$)`
}

/**
 * This is only a bounded script/language sanity check after the substantive rubric has passed.
 * It must recognize valid exam vocabulary rather than demand one arbitrary phrase. Scorer v2 fixes
 * the first Polish blind-exam defect without changing any required facts or task semantics.
 */
function languageMarker(language: CosPlatformLanguage): RegExp {
  if (language === 'ru') return /[А-Яа-яЁё]{3,}/
  if (language === 'pl') return /(?:[ąćęłńóśźż]|\b(?:proszę|dziękuj\w*|jest|będzie|spotkanie|raport|sprawdzenie|projekt|wdrożenia|pozostaje|nieznan\w*)\b)/i
  if (language === 'pt') return /(?:[ãõçáéíóúâêô]|\b(?:obrigad\w*|por favor|está|será|reunião|relatório|verificação|projeto|implantação|desconhecid\w*)\b)/i
  if (language === 'es') return /(?:[ñáéíóúü¿¡]|\b(?:gracias|por favor|está|será|reunión|informe|verificación|proyecto|despliegue|desconocid\w*)\b)/i
  return /\b(?:the|please|is|are|will|meeting|report|check|project|deployment|unknown)\b/i
}

function manifestHash(input: Omit<CosUniversityBlindExam, 'manifestHash'>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function finishExam(input: Omit<CosUniversityBlindExam, 'manifestHash'>): CosUniversityBlindExam {
  return Object.freeze({ ...input, manifestHash: manifestHash(input) })
}

function subjectExam(seed: string, subjectId: CosUniversitySubjectId): CosUniversityBlindExam {
  const base = {
    profile: COS_UNIVERSITY_EXAM_PROFILE,
    scorerVersion: COS_UNIVERSITY_EXAM_SCORER,
    seed,
    caseId: `${subjectId}:${createHash('sha256').update(seed).digest('hex').slice(0, 12)}`,
    assessmentKind: 'unseen_subject_exam' as const,
    target: { kind: 'subject' as const, subjectId },
    title: `Unseen ${cosUniversitySubjectById(subjectId).title} examination`,
  } as const

  if (subjectId === 'computer_science') {
    const oldP95 = integer(seed, 'cs:old', 180, 320)
    const newP95 = integer(seed, 'cs:new', 780, 1180)
    const cpu = integer(seed, 'cs:cpu', 32, 54)
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. Use only this packet; do not use outside facts. A multi-tenant API changed from p95 ${oldP95} ms to ${newP95} ms for Tenant Atlas. Database CPU is ${cpu}%. Queue depth is normal. The slow query plan shows a sequential scan of orders, and there is no composite index on tenant_id plus created_at. Give a safe diagnosis before any Production mutation. Use three headings: Diagnosis, Evidence, Next check.`,
      rubric: {
        requiredGroups: [
          ['sequential scan', 'seq scan'],
          ['index', 'composite index'],
          ['explain', 'query plan'],
          ['measure', 'compare', 'baseline'],
          ['atlas'],
        ],
        forbiddenTerms: ['drop database', 'truncate table', 'delete all'],
        maxWords: 260,
      },
    })
  }

  if (subjectId === 'mathematics') {
    const x = integer(seed, 'math:x', 2, 9)
    const y = integer(seed, 'math:y', 2, 9)
    const a = x + y
    const b = 2 * x - y
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. Solve the system exactly and verify by substitution: x + y = ${a}; 2x - y = ${b}. Do not use an external calculator or source. State x and y clearly, then show a short verification.`,
      rubric: {
        requiredGroups: [['verify', 'verification', 'substitut']],
        exactPatterns: [`\\bx\\s*=\\s*${x}\\b`, `\\by\\s*=\\s*${y}\\b`],
        maxWords: 180,
      },
    })
  }

  if (subjectId === 'statistics_data_science') {
    const n = 1000
    const aConv = choose(seed, 'stats:a', [80, 100, 120] as const)
    const bConv = Math.round(aConv * 1.2)
    const rateA = aConv / 10
    const rateB = bConv / 10
    const pp = Number((rateB - rateA).toFixed(1))
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. Variant A has ${aConv} conversions out of ${n}; Variant B has ${bConv} out of ${n}. Compute both conversion rates and the absolute percentage-point difference. Then state what additional statistical evidence is needed before claiming the treatment caused the difference.`,
      rubric: {
        requiredGroups: [
          ['confidence interval', 'statistical test', 'hypothesis test', 'uncertainty'],
          ['causal', 'causation', 'caused'],
        ],
        forbiddenTerms: ['proves b is better', 'proves the treatment'],
        exactPatterns: [exactNumberPattern(rateA), exactNumberPattern(rateB), exactNumberPattern(pp)],
        maxWords: 220,
      },
    })
  }

  if (subjectId === 'physics_natural_sciences') {
    const acceleration = integer(seed, 'physics:a', 2, 5)
    const seconds = integer(seed, 'physics:t', 3, 6)
    const speed = acceleration * seconds
    const distance = 0.5 * acceleration * seconds * seconds
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. A cart starts from rest and accelerates uniformly at ${acceleration} m/s^2 for ${seconds} s. Compute its final speed and distance traveled. Show the equations used and include units.`,
      rubric: {
        requiredGroups: [['v =', 'velocity', 'speed'], ['distance', 's =', 'displacement'], ['m/s'], ['m/s^2', 'm/s²']],
        exactPatterns: [exactNumberPattern(speed), exactNumberPattern(distance)],
        maxWords: 180,
      },
    })
  }

  if (subjectId === 'cybersecurity') {
    const count = integer(seed, 'cyber:count', 4, 11)
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. Use only this incident packet. One employee account generated ${count} MFA prompts in ten minutes, followed by a successful login from a country not previously observed for that account. No malware evidence is supplied. Produce a defensive triage plan that preserves evidence, limits account risk, verifies the user, and avoids claiming an unproven root cause.`,
      rubric: {
        requiredGroups: [
          ['preserve', 'retain', 'logs', 'evidence'],
          ['revoke session', 'contain', 'reset credential', 'disable account'],
          ['verify the user', 'contact the user', 'confirm with the user'],
          ['scope', 'review other', 'check other'],
          ['unknown', 'not proven', 'cannot conclude', 'unproven'],
        ],
        forbiddenTerms: ['delete logs', 'disable all security', 'confirmed malware'],
        maxWords: 300,
      },
    })
  }

  if (subjectId === 'politics_government_international_relations') {
    const partyNames = ['Alder', 'Birch', 'Cedar', 'Dune'] as const
    const seats = [42, 31, 17, 10] as const
    const majority = 51
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. In a fictional 100-seat parliament, ${partyNames[0]} holds ${seats[0]} seats, ${partyNames[1]} ${seats[1]}, ${partyNames[2]} ${seats[2]}, and ${partyNames[3]} ${seats[3]}. A majority requires ${majority}. Which two-party coalition has the smallest seat total that still forms a numerical majority? State the arithmetic. Do not infer who will actually govern; coalition agreements and appointment rules are not supplied.`,
      rubric: {
        requiredGroups: [['alder'], ['dune'], ['52'], ['cannot', 'not supplied', 'unknown', 'do not know']],
        forbiddenTerms: ['will govern', 'definitely govern'],
        maxWords: 180,
      },
    })
  }

  if (subjectId === 'social_behavioral_sciences') {
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. A voluntary company survey finds that employees who chose remote work report higher job satisfaction than employees who chose office work. No random assignment occurred. Explain what can and cannot be inferred, name at least one plausible selection/confounding mechanism, and propose a stronger design for estimating a causal effect without inventing individual motives.`,
      rubric: {
        requiredGroups: [
          ['correlation', 'association'],
          ['not caus', 'cannot infer caus', 'does not establish caus'],
          ['selection bias', 'self-selection', 'confound'],
          ['random', 'quasi-experiment', 'natural experiment', 'matched'],
        ],
        forbiddenTerms: ['remote work causes higher satisfaction', 'employees chose remote because they are happier'],
        maxWords: 260,
      },
    })
  }

  if (subjectId === 'economics_finance') {
    const fixed = choose(seed, 'finance:fixed', [100000, 120000, 150000] as const)
    const price = choose(seed, 'finance:price', [50, 60, 75] as const)
    const variable = price - choose(seed, 'finance:margin', [20, 25, 30] as const)
    const margin = price - variable
    const breakEven = fixed / margin
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. A product has fixed annual cost $${fixed}, price $${price} per unit, and variable cost $${variable} per unit. Compute contribution margin per unit and break-even unit volume. State the formulas and do not treat break-even as profit.`,
      rubric: {
        requiredGroups: [['contribution margin'], ['break-even', 'break even'], ['fixed cost'], ['variable cost']],
        exactPatterns: [exactNumberPattern(margin), exactNumberPattern(breakEven)],
        forbiddenTerms: ['break-even is profit', 'break even is profit'],
        maxWords: 180,
      },
    })
  }

  if (subjectId === 'business_operations') {
    const intake = 90
    const review = 60
    const fulfillment = 85
    const demand = 75
    const growth = demand - review
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. A daily workflow has capacity: intake ${intake}, review ${review}, fulfillment ${fulfillment}. Demand is ${demand} cases/day and work must pass all three stages. Identify the throughput bottleneck, compute expected daily queue growth at that bottleneck, and give the smallest operational intervention to test first.`,
      rubric: {
        requiredGroups: [['review'], ['bottleneck'], [String(growth)], ['capacity', 'throughput'], ['test', 'pilot', 'measure']],
        maxWords: 220,
      },
    })
  }

  if (subjectId === 'law_regulation_governance') {
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. A fictional SaaS company wants to transfer EU customer personal data to a U.S. vendor. The contract excerpt supplied to you is silent on international transfers, and no transfer mechanism or jurisdiction-specific assessment is supplied. State what can be concluded now, what governing documents/evidence must be checked, and what should remain unresolved. Do not give a categorical legal/illegal conclusion from missing evidence.`,
      rubric: {
        requiredGroups: [
          ['cannot conclude', 'insufficient', 'unknown', 'unresolved'],
          ['dpa', 'data processing agreement', 'contract'],
          ['scc', 'standard contractual clauses', 'transfer mechanism'],
          ['jurisdiction', 'law', 'legal review', 'privacy'],
        ],
        forbiddenTerms: ['the transfer is legal', 'the transfer is illegal'],
        maxWords: 260,
      },
    })
  }

  if (subjectId === 'language_communication') {
    const tests = integer(seed, 'comm:tests', 24, 49)
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. Rewrite this status for an executive audience in no more than 70 words: "${tests} automated tests passed. The deployment record is missing. Production health has not been checked. The next routine step is to verify the deployment record and then run the health check." Preserve all facts. Do not turn missing evidence into a claim that deployment did not happen.`,
      rubric: {
        requiredGroups: [[String(tests)], ['deployment record'], ['production', 'health'], ['verify', 'check']],
        forbiddenTerms: ['not deployed', 'deployment failed', 'not live'],
        maxWords: 70,
      },
    })
  }

  if (subjectId === 'history_culture_philosophy_religion') {
    const year = integer(seed, 'history:year', 1912, 1924)
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. Source A is a private diary written in ${year} by a participant in a political movement. Source B is a scholarly synthesis published in 2024 using many archives. They disagree about the movement's principal cause. Explain how their evidentiary roles differ, what each can contribute, and what additional corroboration is needed before preferring one causal account. Do not assume newer automatically means truer or primary automatically means definitive.`,
      rubric: {
        requiredGroups: [
          ['primary', 'contempor'],
          ['scholarly', 'secondary', 'synthesis'],
          ['corrobor', 'additional source', 'other evidence', 'triangulat'],
          ['context', 'bias', 'perspective', 'limitation'],
        ],
        forbiddenTerms: ['newer source is true', 'primary source is definitive'],
        maxWords: 260,
      },
    })
  }

  return finishExam({ ...base,
    prompt: `UNSEEN UNIVERSITY EXAM. Evaluate this inference: "All red widgets are heavy. Some heavy widgets are fragile. Therefore, some red widgets are fragile." Decide whether the conclusion follows. If it does not, give a concrete counterexample consistent with both premises and state what extra premise would make the conclusion follow.`,
    rubric: {
      requiredGroups: [
        ['does not follow', 'invalid', 'not valid'],
        ['counterexample', 'could be', 'possible'],
        ['extra premise', 'additional premise', 'would need'],
      ],
      forbiddenTerms: ['therefore some red widgets are fragile is valid', 'the conclusion necessarily follows'],
      maxWords: 220,
    },
  })
}

function languageExam(seed: string, language: CosPlatformLanguage, dimension: CosPlatformLanguageDimension): CosUniversityBlindExam {
  const languageTitle = COS_PLATFORM_LANGUAGES.find(row => row.id === language)?.title ?? language
  const base = {
    profile: COS_UNIVERSITY_EXAM_PROFILE,
    scorerVersion: COS_UNIVERSITY_EXAM_SCORER,
    seed,
    caseId: `language:${language}:${dimension}:${createHash('sha256').update(seed).digest('hex').slice(0, 12)}`,
    assessmentKind: 'unseen_subject_exam' as const,
    target: { kind: 'language' as const, language, dimension },
    title: `Unseen ${languageTitle} ${dimension.replaceAll('_', ' ')} examination`,
  } as const

  const localized = {
    en: {
      comprehension: 'Project Orion passed 3 checks on 14 September. Deployment status remains unknown. Answer in English: how many checks passed, on what date, and what remains unknown?',
      writing: 'Write a professional English status update in two or three sentences: 27 tests passed; deployment is not yet verified; next step is a smoke check. Add no new facts.',
      instruction_following: 'Answer in English with exactly three numbered actions. Each action must contain Owner, Deadline, and Done when. Use owner Maya and deadline Friday.',
      translation_localization: 'Translate into natural professional English while preserving every fact: "La revisión es el 12 de septiembre a las 14:30. Lleve el informe de riesgos."',
      cultural_pragmatics: 'Write a polite professional English message asking a colleague to move tomorrow’s meeting by one hour. Include thanks and leave room for the colleague to say the proposed time does not work.',
    },
    es: {
      comprehension: 'El proyecto Orion aprobó 3 verificaciones el 14 de septiembre. El estado del despliegue sigue siendo desconocido. Responde en español: ¿cuántas verificaciones pasaron, en qué fecha y qué sigue sin saberse?',
      writing: 'Escribe una actualización profesional en español de dos o tres frases: pasaron 27 pruebas; el despliegue aún no está verificado; el siguiente paso es una verificación smoke. No añadas hechos.',
      instruction_following: 'Responde en español con exactamente tres acciones numeradas. Cada acción debe incluir Responsable, Fecha límite y Terminado cuando. Usa a Maya como responsable y viernes como fecha límite.',
      translation_localization: 'Traduce al español profesional y natural conservando todos los hechos: "The review is on 12 September at 14:30. Bring the risk memo."',
      cultural_pragmatics: 'Escribe un mensaje profesional y cortés en español para pedir a un colega mover una hora la reunión de mañana. Da las gracias y deja espacio para que diga que la nueva hora no le conviene.',
    },
    pt: {
      comprehension: 'O projeto Orion passou em 3 verificações em 14 de setembro. O status da implantação continua desconhecido. Responda em português: quantas verificações passaram, em que data e o que continua desconhecido?',
      writing: 'Escreva uma atualização profissional em português de duas ou três frases: 27 testes passaram; a implantação ainda não foi verificada; o próximo passo é uma verificação smoke. Não acrescente fatos.',
      instruction_following: 'Responda em português com exatamente três ações numeradas. Cada ação deve incluir Responsável, Prazo e Concluído quando. Use Maya como responsável e sexta-feira como prazo.',
      translation_localization: 'Traduza para português profissional e natural preservando todos os fatos: "The review is on 12 September at 14:30. Bring the risk memo."',
      cultural_pragmatics: 'Escreva uma mensagem profissional e cortês em português pedindo a um colega para adiar em uma hora a reunião de amanhã. Agradeça e deixe espaço para ele dizer que o novo horário não funciona.',
    },
    pl: {
      comprehension: 'Projekt Orion przeszedł 3 kontrole 14 września. Status wdrożenia pozostaje nieznany. Odpowiedz po polsku: ile kontroli przeszło, kiedy i co pozostaje nieznane?',
      writing: 'Napisz profesjonalną aktualizację po polsku w dwóch lub trzech zdaniach: 27 testów przeszło; wdrożenie nie zostało jeszcze zweryfikowane; następnym krokiem jest test smoke. Nie dodawaj faktów.',
      instruction_following: 'Odpowiedz po polsku dokładnie trzema ponumerowanymi działaniami. Każde ma zawierać pola Odpowiedzialny, Termin i Gotowe, gdy. Użyj Maya jako odpowiedzialnej i piątku jako terminu.',
      translation_localization: 'Przetłumacz na naturalny profesjonalny polski, zachowując wszystkie fakty: "The review is on 12 September at 14:30. Bring the risk memo."',
      cultural_pragmatics: 'Napisz po polsku uprzejmą profesjonalną wiadomość z prośbą o przesunięcie jutrzejszego spotkania o godzinę. Podziękuj i pozostaw możliwość, że nowa godzina nie pasuje.',
    },
    ru: {
      comprehension: 'Проект Orion прошёл 3 проверки 14 сентября. Статус развертывания остаётся неизвестным. Ответьте по-русски: сколько проверок пройдено, когда и что остаётся неизвестным?',
      writing: 'Напишите профессиональное обновление по-русски в двух или трёх предложениях: 27 тестов пройдены; развертывание ещё не проверено; следующий шаг — smoke-проверка. Не добавляйте фактов.',
      instruction_following: 'Ответьте по-русски ровно тремя нумерованными действиями. В каждом укажите Ответственный, Срок и Готово, когда. Ответственная — Maya, срок — пятница.',
      translation_localization: 'Переведите на естественный профессиональный русский, сохранив все факты: "The review is on 12 September at 14:30. Bring the risk memo."',
      cultural_pragmatics: 'Напишите по-русски вежливое профессиональное сообщение с просьбой перенести завтрашнюю встречу на один час. Поблагодарите и оставьте возможность сказать, что новое время не подходит.',
    },
  } as const

  const common: CosUniversityExamRubric = {
    requiredGroups: [],
    targetLanguage: language,
    maxWords: dimension === 'instruction_following' ? 180 : 150,
  }

  if (dimension === 'comprehension') {
    return finishExam({ ...base, prompt: localized[language].comprehension, rubric: {
      ...common,
      requiredGroups: [['orion'], ['3'], ['14'], language === 'ru' ? ['неизвест'] : language === 'pl' ? ['nieznan'] : language === 'pt' ? ['desconhecid'] : language === 'es' ? ['desconocid'] : ['unknown']],
    } })
  }
  if (dimension === 'writing') {
    return finishExam({ ...base, prompt: localized[language].writing, rubric: {
      ...common,
      requiredGroups: [['27'], ['deploy', 'desplieg', 'implant', 'wdroż', 'развер'], ['smoke']],
      forbiddenTerms: language === 'en' ? ['deployment succeeded', 'deployment failed'] : undefined,
    } })
  }
  if (dimension === 'instruction_following') {
    return finishExam({ ...base, prompt: localized[language].instruction_following, rubric: {
      ...common,
      requiredGroups: [['maya'], language === 'ru' ? ['пятниц'] : language === 'pl' ? ['piątek', 'piątku'] : language === 'pt' ? ['sexta'] : language === 'es' ? ['viernes'] : ['friday']],
      numberedActions: 3,
    } })
  }
  if (dimension === 'translation_localization') {
    return finishExam({ ...base, prompt: localized[language].translation_localization, rubric: {
      ...common,
      requiredGroups: [['12'], ['14:30'], language === 'ru' ? ['риск'] : language === 'pl' ? ['ryzyk'] : language === 'pt' ? ['risco'] : language === 'es' ? ['riesgo'] : ['risk']],
    } })
  }
  return finishExam({ ...base, prompt: localized[language].cultural_pragmatics, rubric: {
    ...common,
    requiredGroups: [
      language === 'ru' ? ['пожалуйста', 'прошу', 'можно'] : language === 'pl' ? ['proszę', 'czy możemy', 'czy moglibyśmy'] : language === 'pt' ? ['por favor', 'poderíamos', 'podemos'] : language === 'es' ? ['por favor', 'podríamos', 'podemos'] : ['please', 'could we', 'would it be possible'],
      language === 'ru' ? ['спасибо', 'благодар'] : language === 'pl' ? ['dziękuj'] : language === 'pt' ? ['obrigad'] : language === 'es' ? ['gracias'] : ['thank'],
      language === 'ru' ? ['встреч'] : language === 'pl' ? ['spotkan'] : language === 'pt' ? ['reuni'] : language === 'es' ? ['reuni'] : ['meeting'],
    ],
    forbiddenTerms: ['lol', 'whatever'],
  } })
}

export function buildCosUniversityBlindExam(seed: string, target: CosUniversityExamTarget): CosUniversityBlindExam {
  const cleanSeed = String(seed ?? '').trim()
  if (!/^[0-9a-f-]{16,80}$/i.test(cleanSeed)) throw new Error('A stable server-side exam seed is required.')
  return target.kind === 'subject'
    ? subjectExam(cleanSeed, target.subjectId)
    : languageExam(cleanSeed, target.language, target.dimension)
}

export function scoreCosUniversityBlindExam(
  exam: CosUniversityBlindExam,
  reply: string,
  provenance: CosUniversityExamProvenance,
): CosUniversityExamScore {
  const reasons: string[] = []
  const text = String(reply ?? '')
  const normalized = normalize(text)
  if (!normalized) reasons.push('empty_reply')
  if (provenance.handled !== true) reasons.push('not_handled')
  if (provenance.localReasoning !== true) reasons.push('local_reasoning_not_recorded')
  if (provenance.externalAi === true) reasons.push('external_ai_used')
  if (provenance.semanticCache === true) reasons.push('semantic_cache_used')
  if (!String(provenance.turnId ?? '').trim()) reasons.push('turn_id_missing')

  exam.rubric.requiredGroups.forEach((group, index) => {
    if (!hasAny(text, group)) reasons.push(`required_group_${index + 1}_missing`)
  })
  for (const term of exam.rubric.forbiddenTerms ?? []) {
    if (normalized.includes(normalize(term))) reasons.push(`forbidden:${term}`)
  }
  for (const pattern of exam.rubric.exactPatterns ?? []) {
    if (!new RegExp(pattern, 'i').test(text)) reasons.push(`exact_pattern_missing:${pattern}`)
  }
  if (exam.rubric.maxWords && words(text) > exam.rubric.maxWords) reasons.push('word_limit_exceeded')
  if (exam.rubric.numberedActions) {
    const actions = [...text.matchAll(/^\s*(\d+)[.)]\s+/gm)].map(match => Number(match[1]))
    if (actions.length !== exam.rubric.numberedActions || actions.some((value, index) => value !== index + 1)) {
      reasons.push('numbered_action_structure_failed')
    }
  }
  if (exam.rubric.targetLanguage && !languageMarker(exam.rubric.targetLanguage).test(text)) {
    reasons.push(`target_language_not_demonstrated:${exam.rubric.targetLanguage}`)
  }
  return { passed: reasons.length === 0, reasons }
}

function freshIndependent(row: CosUniversityExamAssessmentRow, nowMs: number): boolean {
  const observed = Date.parse(String(row.observed_at || ''))
  const validUntil = Date.parse(String(row.valid_until || ''))
  return row.assessment_kind === 'unseen_subject_exam'
    && row.passed === true
    && row.independent_scorer === true
    && row.scorer_authority === 'host_private_exam'
    && Number.isFinite(observed)
    && Number.isFinite(validUntil)
    && observed < validUntil
    && validUntil > nowMs
}

function rotatedLowest<T>(items: Array<{ value: T; count: number; key: string }>, day: number): T {
  const minimum = Math.min(...items.map(item => item.count))
  const tied = items.filter(item => item.count === minimum).sort((a, b) => a.key.localeCompare(b.key))
  return tied[Math.abs(day) % tied.length].value
}

/**
 * Pick one subject and one language-dimension target from fresh independent evidence counts.
 * This keeps language work from being starved by the larger subject catalog and keeps failures in
 * rotation until they accumulate repeated independent passes.
 */
export function selectCosUniversityExamTargets(
  rows: CosUniversityExamAssessmentRow[],
  now = new Date(),
): [CosUniversityExamTarget, CosUniversityExamTarget] {
  const nowMs = now.getTime()
  const valid = rows.filter(row => freshIndependent(row, nowMs))
  const day = Math.floor(nowMs / 86_400_000)

  const subjectItems = COS_UNIVERSITY_SUBJECTS.map(subject => ({
    value: { kind: 'subject' as const, subjectId: subject.id },
    count: valid.filter(row => row.subject_id === subject.id).length,
    key: subject.id,
  }))

  const languageItems = COS_PLATFORM_LANGUAGES.flatMap(language => LANGUAGE_DIMENSIONS.map(dimension => ({
    value: { kind: 'language' as const, language: language.id, dimension },
    count: valid.filter(row => row.language_code === language.id && row.language_dimension === dimension).length,
    key: `${language.id}:${dimension}`,
  })))

  return [rotatedLowest(subjectItems, day), rotatedLowest(languageItems, day + 11)]
}

export function universityExamValidityDays(target: CosUniversityExamTarget): number {
  if (target.kind === 'language') return 120
  if (target.subjectId === 'mathematics' || target.subjectId === 'history_culture_philosophy_religion') return 365
  if (target.subjectId === 'physics_natural_sciences' || target.subjectId === 'statistics_data_science' || target.subjectId === 'social_behavioral_sciences' || target.subjectId === 'reasoning_decision_science') return 180
  if (target.subjectId === 'business_operations' || target.subjectId === 'economics_finance' || target.subjectId === 'language_communication') return 120
  return 90
}

export function universityExamValidUntil(target: CosUniversityExamTarget, observedAt: Date): string {
  return new Date(observedAt.getTime() + universityExamValidityDays(target) * 86_400_000).toISOString()
}
