import { createHash } from 'node:crypto'
import {
  isCosUniversityVerifiedProductionSource,
  type CosUniversityARangeProvenance,
  type CosUniversityARangeStage,
} from './cosUniversityARange.ts'
import { cosUniversityLanguageAuthenticityReasons } from './cosUniversityLanguageAuthenticity.ts'
import {
  COS_PLATFORM_LANGUAGES,
  type CosPlatformLanguage,
  type CosPlatformLanguageDimension,
} from './cosUniversityLanguages.ts'

export const COS_UNIVERSITY_LANGUAGE_A_RANGE_PROFILE = 'cos_university_language_a_range_v1'
export const COS_UNIVERSITY_LANGUAGE_A_RANGE_SCORER = 'university-language-a-range-host-scorer-v1'
export const COS_UNIVERSITY_LANGUAGE_A_RANGE_MINIMUM_DISTINCT_PASSES = 2
export const COS_UNIVERSITY_LANGUAGE_DIMENSIONS: readonly CosPlatformLanguageDimension[] = [
  'comprehension',
  'writing',
  'instruction_following',
  'translation_localization',
  'cultural_pragmatics',
]

export type CosUniversityLanguageARangeStage = CosUniversityARangeStage
export type CosUniversityLanguageARangeTarget =
  | { stage: 'cross_domain_transfer'; language: CosPlatformLanguage; dimension: CosPlatformLanguageDimension }
  | { stage: 'capstone'; language: CosPlatformLanguage; dimension: null }

export type CosUniversityLanguageARangeRunEvidence = {
  stage: CosUniversityLanguageARangeStage
  language: CosPlatformLanguage
  dimension: CosPlatformLanguageDimension | null
  passed: boolean
  variantHash: string
  observedAt: string
}

export type CosUniversityLanguageARangeRubric = Readonly<{
  requiredGroups: readonly (readonly string[])[]
  forbiddenTerms?: readonly string[]
  requiredSections?: readonly string[]
  numberedActions?: number
  targetLanguage: CosPlatformLanguage
  maxWords: number
}>

export type CosUniversityLanguageARangeExam = Readonly<{
  profile: typeof COS_UNIVERSITY_LANGUAGE_A_RANGE_PROFILE
  scorerVersion: typeof COS_UNIVERSITY_LANGUAGE_A_RANGE_SCORER
  seed: string
  stage: Extract<CosUniversityLanguageARangeStage, 'cross_domain_transfer' | 'capstone'>
  language: CosPlatformLanguage
  dimension: CosPlatformLanguageDimension | null
  project: string
  prompt: string
  /**
   * The packet embedded in the prompt, carried separately so the scorer can tell original prose
   * from a copy of the material the learner was handed.
   */
  packet: string
  rubric: CosUniversityLanguageARangeRubric
  manifestHash: string
}>

export type CosUniversityLanguageARangeScore = { passed: boolean; reasons: string[] }

const LANGUAGE_PRODUCTION_SOURCE = /^(?:production_verified):language:(en|es|pt|pl|ru|de|fr|it|ja|ko|ar):(comprehension|writing|instruction_following|translation_localization|cultural_pragmatics):([a-z0-9][a-z0-9_.:/-]{2,118})$/i

const LANGUAGE_MARKERS: Record<CosPlatformLanguage, RegExp> = {
  en: /\b(?:the|please|is|are|will|project|deployment|security|regulatory|thank)\b/i,
  es: /(?:[ñáéíóúü¿¡]|\b(?:por favor|gracias|proyecto|despliegue|seguridad|regulatori\w*|desconocid\w*)\b)/i,
  pt: /(?:[ãõçáéíóúâêô]|\b(?:por favor|obrigad\w*|projeto|implantação|segurança|regulatóri\w*|desconhecid\w*)\b)/i,
  pl: /(?:[ąćęłńóśźż]|\b(?:proszę|dziękuj\w*|projekt|wdrożeni\w*|bezpieczeństw\w*|regulacyj\w*|nieznan\w*)\b)/i,
  ru: /[А-Яа-яЁё]{3,}/,
  de: /(?:[äöüß]|(?<!\p{L})(?:bitte|danke|projekt|bereitstellung|sicherheit|regulator\p{L}*|unbekannt\p{L}*|nicht)(?!\p{L}))/iu,
  fr: /(?:[œ]|(?<!\p{L})(?:merci|projet|déploiement|sécurité|réglementaire|inconnu\p{L}*|veuillez)(?!\p{L}))/iu,
  it: /(?<!\p{L})(?:grazie|progetto|rilascio|sicurezza|normativ\p{L}*|sconosciut\p{L}*|per favore|della|sono)(?!\p{L})/iu,
  // Hiragana separates Japanese from Chinese-only text; Hangul and Arabic script identify Korean and Arabic.
  ja: /[\u3040-\u309f]{2,}/u,
  ko: /[\uac00-\ud7af]{2,}/u,
  ar: /[\u0621-\u064a]{3,}/u,
}

const DOMAIN_GROUPS: Record<CosPlatformLanguage, {
  security: readonly string[]
  regulation: readonly string[]
  uncertainty: readonly string[]
  finance: readonly string[]
  please: readonly string[]
  thanks: readonly string[]
}> = {
  en: {
    security: ['security', 'access control'], regulation: ['regulatory', 'clearance', 'compliance'],
    uncertainty: ['unknown', 'unverified', 'not verified', 'unresolved'], finance: ['budget', 'cost', 'financial'],
    please: ['please', 'could you', 'would you'], thanks: ['thank'],
  },
  es: {
    security: ['seguridad', 'control de acceso'], regulation: ['regulator', 'autorización', 'cumplimiento'],
    uncertainty: ['desconocid', 'no verific', 'sin verificar', 'pendiente'], finance: ['presupuesto', 'coste', 'costo', 'financier'],
    please: ['por favor', 'podría', 'podrías'], thanks: ['gracias', 'agradez'],
  },
  pt: {
    security: ['segurança', 'controle de acesso'], regulation: ['regulat', 'autorização', 'conformidade'],
    uncertainty: ['desconhecid', 'não verific', 'sem verificar', 'pendente'], finance: ['orçamento', 'custo', 'financeir'],
    please: ['por favor', 'poderia'], thanks: ['obrigad', 'agradeç'],
  },
  pl: {
    security: ['bezpieczeń', 'kontrol dostępu'], regulation: ['regulacyj', 'zgodnoś', 'zezwoleni'],
    uncertainty: ['nieznan', 'niezweryfik', 'nierozstrzygnię', 'oczekuj'], finance: ['budżet', 'koszt', 'finans'],
    please: ['proszę', 'czy możesz', 'czy mogliby'], thanks: ['dziękuj'],
  },
  ru: {
    security: ['безопасн', 'контрол доступа'], regulation: ['регулятор', 'соответств', 'разрешен'],
    uncertainty: ['неизвест', 'не провер', 'не подтвержд', 'нереш'], finance: ['бюджет', 'стоимост', 'финанс'],
    please: ['пожалуйста', 'можете', 'могли бы'], thanks: ['спасибо', 'благодар'],
  },
  de: {
    security: ['sicherheit', 'zugriffskontroll', 'zugangskontroll'], regulation: ['regulator', 'regulier', 'genehmigung', 'compliance'],
    uncertainty: ['unbekannt', 'nicht verifiziert', 'nicht bestätigt', 'ungeklärt', 'offen', 'ausstehend'], finance: ['budget', 'kosten', 'finanz'],
    please: ['bitte', 'könnten sie', 'würden sie'], thanks: ['dank'],
  },
  fr: {
    security: ['sécurité', 'contrôle d’accès', "contrôle d'accès"], regulation: ['réglementaire', 'régulat', 'autorisation', 'conformité'],
    uncertainty: ['inconnu', 'non vérifié', 'non confirmé', 'non résolu', 'en suspens', 'en attente'], finance: ['budget', 'budgét', 'coût', 'financ'],
    please: ['s’il vous plaît', "s'il vous plaît", 'pourriez-vous', 'veuillez'], thanks: ['merci', 'remerci'],
  },
  it: {
    security: ['sicurezza', 'controllo degli accessi', 'controllo accessi'], regulation: ['regolament', 'normativ', 'autorizzazione', 'conformità'],
    uncertainty: ['sconosciut', 'non verificat', 'non confermat', 'irrisolt', 'in sospeso', 'in attesa'], finance: ['budget', 'cost', 'finanz'],
    please: ['per favore', 'potrebbe', 'potreste', 'vi chiedo', 'le chiedo'], thanks: ['grazie', 'ringrazi'],
  },
  ja: {
    security: ['セキュリティ', 'アクセス制御', 'アクセス管理'], regulation: ['規制', '許認可', '認可', 'コンプライアンス'],
    uncertainty: ['不明', '未確認', '未検証', '未解決', '保留'], finance: ['予算', '費用', 'コスト', '財務'],
    please: ['お願い', 'ください', 'いただけ'], thanks: ['ありがとう', '感謝'],
  },
  ko: {
    security: ['보안', '접근 제어', '접근 통제'], regulation: ['규제', '인허가', '승인', '컴플라이언스'],
    uncertainty: ['불확실', '미확인', '확인되지', '검증되지', '미해결', '해결되지', '보류'], finance: ['예산', '비용', '재무'],
    please: ['부탁', '주시기', '주십시오', '주세요'], thanks: ['감사'],
  },
  ar: {
    security: ['الأمن', 'الأمان', 'التحكم في الوصول'], regulation: ['تنظيمي', 'التنظيمية', 'الترخيص', 'ترخيص', 'الامتثال'],
    uncertainty: ['غير معروف', 'غير مؤكد', 'لم يتم التحقق', 'غير محسوم', 'معلق', 'معلّق'], finance: ['الميزانية', 'ميزاني', 'التكلفة', 'تكلفة', 'المالي'],
    please: ['يرجى', 'نرجو', 'الرجاء', 'من فضلك'], thanks: ['شكر'],
  },
}

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function digest(seed: string, label: string): Buffer {
  return createHash('sha256').update(`${seed}:${label}`).digest()
}

function choose<T>(seed: string, label: string, values: readonly T[]): T {
  return values[digest(seed, label).readUInt32BE(0) % values.length]
}

function integer(seed: string, label: string, min: number, max: number): number {
  return min + (digest(seed, label).readUInt32BE(0) % (max - min + 1))
}

function manifestHash(input: Omit<CosUniversityLanguageARangeExam, 'manifestHash'>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function words(value: string): number {
  return clean(value).match(/\S+/g)?.length ?? 0
}

function hasAny(text: string, terms: readonly string[]): boolean {
  const normalized = clean(text).toLowerCase()
  return terms.some(term => normalized.includes(term.toLowerCase()))
}

function languageTitle(language: CosPlatformLanguage): string {
  return COS_PLATFORM_LANGUAGES.find(item => item.id === language)?.title || language
}

function localizedPacket(language: CosPlatformLanguage, facts: { project: string; checks: number; budget: number; weeks: number }): string {
  const { project, checks, budget, weeks } = facts
  const packets: Record<CosPlatformLanguage, string> = {
    en: `Project ${project} has ${checks} passed release checks and a ${budget}-million budget ceiling. Production deployment is not verified. One access-control item in the security review is unresolved, and local regulatory clearance is not provided. Leadership needs a decision within ${weeks} weeks.`,
    es: `El proyecto ${project} tiene ${checks} verificaciones de lanzamiento aprobadas y un límite presupuestario de ${budget} millones. El despliegue en Producción no está verificado. Un punto de control de acceso de la revisión de seguridad sigue pendiente y no se ha aportado la autorización regulatoria local. La dirección necesita una decisión en ${weeks} semanas.`,
    pt: `O projeto ${project} tem ${checks} verificações de lançamento aprovadas e um limite de orçamento de ${budget} milhões. A implantação em Produção não foi verificada. Um item de controle de acesso da revisão de segurança continua pendente e a autorização regulatória local não foi fornecida. A liderança precisa de uma decisão em ${weeks} semanas.`,
    pl: `Projekt ${project} ma ${checks} zaliczonych kontroli wydania i limit budżetu ${budget} milionów. Wdrożenie produkcyjne nie zostało zweryfikowane. Jedna kwestia kontroli dostępu w przeglądzie bezpieczeństwa pozostaje nierozstrzygnięta, a lokalne zezwolenie regulacyjne nie zostało przedstawione. Kierownictwo potrzebuje decyzji w ciągu ${weeks} tygodni.`,
    ru: `Проект ${project} прошёл ${checks} проверок выпуска и имеет бюджетный лимит ${budget} миллионов. Развертывание в Production не подтверждено. Один вопрос контроля доступа в проверке безопасности остаётся нерешённым, а местное регуляторное разрешение не предоставлено. Руководству нужно решение в течение ${weeks} недель.`,
    de: `Das Projekt ${project} hat ${checks} bestandene Release-Prüfungen und eine Budgetobergrenze von ${budget} Millionen. Die Bereitstellung in Production ist nicht verifiziert. Ein Punkt zur Zugriffskontrolle in der Sicherheitsprüfung ist ungeklärt, und die lokale regulatorische Genehmigung liegt nicht vor. Die Geschäftsleitung benötigt innerhalb von ${weeks} Wochen eine Entscheidung.`,
    fr: `Le projet ${project} compte ${checks} contrôles de mise en production réussis et un plafond budgétaire de ${budget} millions. Le déploiement en Production n’est pas vérifié. Un point de contrôle d’accès de la revue de sécurité reste non résolu, et l’autorisation réglementaire locale n’a pas été fournie. La direction a besoin d’une décision d’ici ${weeks} semaines.`,
    it: `Il progetto ${project} ha superato ${checks} controlli di rilascio e ha un tetto di budget di ${budget} milioni. Il rilascio in Produzione non è verificato. Un punto di controllo degli accessi nella revisione di sicurezza è irrisolto e l’autorizzazione normativa locale non è stata fornita. La direzione ha bisogno di una decisione entro ${weeks} settimane.`,
    ja: `プロジェクト ${project} はリリースチェックに ${checks} 件合格しており、予算上限は ${budget} 百万です。Production へのデプロイは未検証です。セキュリティレビューのアクセス制御に関する項目が 1 件未解決で、現地の規制当局による許認可も提出されていません。経営陣は ${weeks} 週間以内に判断を必要としています。`,
    ko: `프로젝트 ${project}는 릴리스 점검 ${checks}건을 통과했으며 예산 상한은 ${budget}백만입니다. Production 배포는 검증되지 않았습니다. 보안 검토의 접근 제어 항목 1건이 미해결 상태이며, 현지 규제 인허가도 제출되지 않았습니다. 경영진은 ${weeks}주 안에 결정이 필요합니다.`,
    ar: `اجتاز المشروع ${project} عدد ${checks} من فحوصات الإصدار، وسقف ميزانيته ${budget} مليون. لم يتم التحقق من النشر في بيئة Production. لا يزال بند واحد يتعلق بالتحكم في الوصول في مراجعة الأمن غير محسوم، ولم يُقدَّم الترخيص التنظيمي المحلي. تحتاج الإدارة إلى قرار خلال ${weeks} أسابيع.`,
  }
  return packets[language]
}

function translationPacket(language: CosPlatformLanguage, facts: { project: string; checks: number; budget: number; weeks: number }): string {
  const { project, checks, budget, weeks } = facts
  if (language === 'en') {
    return `El proyecto ${project} tiene ${checks} verificaciones de lanzamiento aprobadas y un límite presupuestario de ${budget} millones. El despliegue en Producción no está verificado. Un punto de control de acceso de la revisión de seguridad sigue pendiente y no se ha aportado la autorización regulatoria local. La dirección necesita una decisión en ${weeks} semanas.`
  }
  return `Project ${project} has ${checks} passed release checks and a ${budget}-million budget ceiling. Production deployment is not verified. One access-control item in the security review is unresolved, and local regulatory clearance is not provided. Leadership needs a decision within ${weeks} weeks.`
}

function dimensionInstruction(language: CosPlatformLanguage, dimension: CosPlatformLanguageDimension): string {
  const instructions: Record<CosPlatformLanguage, Record<CosPlatformLanguageDimension, string>> = {
    en: {
      comprehension: 'Answer in English. Separate verified facts from unresolved items and explain why passed checks do not prove Production readiness.',
      writing: 'Write a concise professional executive status update in English. Preserve every material fact and do not invent completion.',
      instruction_following: 'Answer in English with exactly four numbered actions. Each action must name an owner role, an evidence check, and a done condition.',
      translation_localization: 'Translate and localize the packet into natural professional English for an executive audience while preserving every fact, number, and uncertainty.',
      cultural_pragmatics: 'Write a polite professional English message asking the security, regulatory, and operations owners for the missing evidence without blaming them. Include thanks and acknowledge uncertainty.',
    },
    es: {
      comprehension: 'Responde en español. Separa los hechos verificados de los puntos no resueltos y explica por qué las verificaciones aprobadas no demuestran que Producción esté lista.',
      writing: 'Escribe en español una actualización ejecutiva profesional y concisa. Conserva todos los hechos materiales y no inventes que algo esté terminado.',
      instruction_following: 'Responde en español con exactamente cuatro acciones numeradas. Cada acción debe indicar un rol responsable, una verificación de evidencia y una condición de terminado.',
      translation_localization: 'Traduce y adapta el paquete a un español profesional y natural para una audiencia ejecutiva, conservando todos los hechos, números e incertidumbres.',
      cultural_pragmatics: 'Escribe en español un mensaje profesional y cortés para pedir a los responsables de seguridad, regulación y operaciones la evidencia que falta sin culparlos. Da las gracias y reconoce la incertidumbre.',
    },
    pt: {
      comprehension: 'Responda em português. Separe os fatos verificados dos pontos não resolvidos e explique por que as verificações aprovadas não comprovam que a Produção esteja pronta.',
      writing: 'Escreva em português uma atualização executiva profissional e concisa. Preserve todos os fatos materiais e não invente que algo foi concluído.',
      instruction_following: 'Responda em português com exatamente quatro ações numeradas. Cada ação deve indicar um papel responsável, uma verificação de evidência e uma condição de conclusão.',
      translation_localization: 'Traduza e adapte o pacote para português profissional e natural para um público executivo, preservando todos os fatos, números e incertezas.',
      cultural_pragmatics: 'Escreva em português uma mensagem profissional e cortês pedindo aos responsáveis por segurança, regulação e operações as evidências que faltam sem culpá-los. Agradeça e reconheça a incerteza.',
    },
    pl: {
      comprehension: 'Odpowiedz po polsku. Oddziel fakty zweryfikowane od kwestii nierozstrzygniętych i wyjaśnij, dlaczego zaliczone kontrole nie dowodzą gotowości Produkcji.',
      writing: 'Napisz po polsku zwięzłą, profesjonalną aktualizację dla kierownictwa. Zachowaj wszystkie istotne fakty i nie wymyślaj zakończenia prac.',
      instruction_following: 'Odpowiedz po polsku dokładnie czterema ponumerowanymi działaniami. Każde działanie ma wskazywać rolę odpowiedzialną, kontrolę dowodową i warunek zakończenia.',
      translation_localization: 'Przetłumacz i zlokalizuj pakiet na naturalny, profesjonalny polski dla kierownictwa, zachowując wszystkie fakty, liczby i niepewności.',
      cultural_pragmatics: 'Napisz po polsku uprzejmą, profesjonalną wiadomość z prośbą do osób odpowiedzialnych za bezpieczeństwo, regulacje i operacje o brakujące dowody bez obwiniania. Podziękuj i zaznacz niepewność.',
    },
    ru: {
      comprehension: 'Ответьте по-русски. Отделите проверенные факты от нерешённых вопросов и объясните, почему пройденные проверки не доказывают готовность Production.',
      writing: 'Напишите по-русски краткое профессиональное обновление для руководства. Сохраните все существенные факты и не выдумывайте завершение работ.',
      instruction_following: 'Ответьте по-русски ровно четырьмя нумерованными действиями. В каждом укажите ответственную роль, проверку доказательства и условие завершения.',
      translation_localization: 'Переведите и локализуйте пакет на естественный профессиональный русский для руководства, сохранив все факты, числа и неопределённость.',
      cultural_pragmatics: 'Напишите по-русски вежливое профессиональное сообщение с просьбой к ответственным за безопасность, регулирование и операции предоставить недостающие доказательства без обвинений. Поблагодарите и признайте неопределённость.',
    },
    de: {
      comprehension: 'Antworten Sie auf Deutsch. Trennen Sie verifizierte Fakten von ungeklärten Punkten und erklären Sie, warum bestandene Prüfungen nicht die Bereitschaft für Production belegen.',
      writing: 'Schreiben Sie auf Deutsch ein prägnantes, professionelles Status-Update für die Geschäftsleitung. Bewahren Sie alle wesentlichen Fakten und erfinden Sie keinen Abschluss.',
      instruction_following: 'Antworten Sie auf Deutsch mit genau vier nummerierten Maßnahmen. Jede Maßnahme muss eine verantwortliche Rolle, eine Nachweisprüfung und eine Abschlussbedingung nennen.',
      translation_localization: 'Übersetzen und lokalisieren Sie das Paket in natürliches, professionelles Deutsch für die Geschäftsleitung und bewahren Sie dabei alle Fakten, Zahlen und Unsicherheiten.',
      cultural_pragmatics: 'Schreiben Sie auf Deutsch eine höfliche, professionelle Nachricht, in der Sie die Verantwortlichen für Sicherheit, Regulierung und Betrieb ohne Schuldzuweisung um die fehlenden Nachweise bitten. Bedanken Sie sich und benennen Sie die Unsicherheit.',
    },
    fr: {
      comprehension: 'Répondez en français. Distinguez les faits vérifiés des points non résolus et expliquez pourquoi les contrôles réussis ne prouvent pas que la Production est prête.',
      writing: 'Rédigez en français un point d’étape professionnel et concis pour la direction. Conservez tous les faits importants et n’inventez aucun achèvement.',
      instruction_following: 'Répondez en français avec exactement quatre actions numérotées. Chaque action doit indiquer un rôle responsable, une vérification de preuve et une condition d’achèvement.',
      translation_localization: 'Traduisez et adaptez le dossier dans un français naturel et professionnel destiné à la direction, en conservant tous les faits, chiffres et incertitudes.',
      cultural_pragmatics: 'Rédigez en français un message courtois et professionnel demandant aux responsables de la sécurité, de la réglementation et des opérations les preuves manquantes, sans les blâmer. Remerciez-les et reconnaissez l’incertitude.',
    },
    it: {
      comprehension: 'Rispondi in italiano. Separa i fatti verificati dai punti irrisolti e spiega perché i controlli superati non dimostrano che la Produzione sia pronta.',
      writing: 'Scrivi in italiano un aggiornamento professionale e conciso per la direzione. Conserva tutti i fatti rilevanti e non inventare che il lavoro sia concluso.',
      instruction_following: 'Rispondi in italiano con esattamente quattro azioni numerate. Ogni azione deve indicare un ruolo responsabile, una verifica delle evidenze e una condizione di completamento.',
      translation_localization: 'Traduci e localizza il pacchetto in un italiano naturale e professionale per la direzione, conservando tutti i fatti, i numeri e le incertezze.',
      cultural_pragmatics: 'Scrivi in italiano un messaggio cortese e professionale per chiedere ai responsabili di sicurezza, normativa e operazioni le evidenze mancanti senza colpevolizzarli. Ringrazia e riconosci l’incertezza.',
    },
    ja: {
      comprehension: '日本語で回答してください。検証済みの事実と未解決の項目を区別し、チェックに合格しても Production の準備が整ったことの証明にならない理由を説明してください。',
      writing: '経営陣向けの簡潔でビジネスにふさわしい状況報告を日本語で書いてください。重要な事実をすべて残し、完了したと捏造しないでください。',
      instruction_following: 'ちょうど 4 つの番号付きアクションで、日本語で回答してください。各アクションには担当する役割、証拠の確認方法、完了条件を明記してください。',
      translation_localization: '事実、数値、不確実性をすべて保ったまま、この資料を経営陣向けの自然でビジネスにふさわしい日本語に翻訳・ローカライズしてください。',
      cultural_pragmatics: 'セキュリティ、規制、運用の各担当者に、責めることなく不足している証拠の提出を依頼する、丁寧でビジネスにふさわしいメッセージを日本語で書いてください。感謝を伝え、不確実性にも触れてください。',
    },
    ko: {
      comprehension: '한국어로 답하세요. 검증된 사실과 미해결 항목을 구분하고, 점검을 통과했다고 해서 Production 준비가 증명되지 않는 이유를 설명하세요.',
      writing: '경영진을 위한 간결하고 전문적인 현황 보고를 한국어로 작성하세요. 중요한 사실을 모두 유지하고 완료되었다고 지어내지 마세요.',
      instruction_following: '정확히 네 개의 번호가 매겨진 조치로 한국어로 답하세요. 각 조치에는 담당 역할, 증거 확인 방법, 완료 조건이 있어야 합니다.',
      translation_localization: '모든 사실, 수치, 불확실성을 유지하면서 이 자료를 경영진을 위한 자연스럽고 전문적인 한국어로 번역하고 현지화하세요.',
      cultural_pragmatics: '보안, 규제, 운영 담당자에게 탓하지 않고 누락된 증거를 요청하는 정중하고 전문적인 메시지를 한국어로 작성하세요. 감사를 전하고 불확실성을 인정하세요.',
    },
    ar: {
      comprehension: 'أجب بالعربية. افصل بين الحقائق التي تم التحقق منها والبنود غير المحسومة، واشرح لماذا لا يثبت اجتياز الفحوصات جاهزية بيئة Production.',
      writing: 'اكتب بالعربية تحديثًا موجزًا ومهنيًا عن الحالة موجّهًا إلى الإدارة العليا. حافظ على جميع الحقائق الجوهرية ولا تدّعِ اكتمال العمل.',
      instruction_following: 'أجب بالعربية بأربعة إجراءات مرقمة بالضبط. يجب أن يحدد كل إجراء الدور المسؤول وطريقة التحقق من الدليل وشرط الإنجاز.',
      translation_localization: 'ترجم الحزمة وكيّفها إلى عربية مهنية وطبيعية موجّهة إلى الإدارة العليا، مع الحفاظ على جميع الحقائق والأرقام وجوانب عدم اليقين.',
      cultural_pragmatics: 'اكتب بالعربية رسالة مهذبة ومهنية تطلب فيها من المسؤولين عن الأمن والتنظيم والعمليات تقديم الأدلة الناقصة دون لومهم. اشكرهم واعترف بعدم اليقين.',
    },
  }
  return instructions[language][dimension]
}

function capstoneInstruction(language: CosPlatformLanguage): string {
  const title = languageTitle(language)
  return `HOST-CONTROLLED ${title.toUpperCase()} INTEGRATED LANGUAGE CAPSTONE. Respond entirely in ${title}. Use exactly these section tokens: [COMPREHENSION], [WRITING], [ACTIONS], [LOCALIZATION], [PRAGMATICS]. In [COMPREHENSION], distinguish verified facts from unknowns. In [WRITING], give an executive status update. In [ACTIONS], give exactly four numbered verification actions. In [LOCALIZATION], restate the decision packet naturally for a local executive audience without changing facts. In [PRAGMATICS], write a courteous request for the missing security, regulatory, operational, and financial evidence. Do not use outside facts or claim Production is live.`
}

export function buildCosUniversityLanguageARangeExam(args: {
  seed: string
  target: CosUniversityLanguageARangeTarget
}): CosUniversityLanguageARangeExam {
  const seed = clean(args.seed)
  if (!/^[0-9a-f-]{16,80}$/i.test(seed)) throw new Error('A stable server-side language A-range exam seed is required.')
  const project = choose(seed, 'project', ['Orion', 'Atlas', 'Lumen', 'Cedar', 'Harbor'] as const)
  const checks = integer(seed, 'checks', 31, 79)
  const budget = integer(seed, 'budget', 8, 27)
  const weeks = integer(seed, 'weeks', 5, 14)
  const packet = localizedPacket(args.target.language, { project, checks, budget, weeks })
  const groups = DOMAIN_GROUPS[args.target.language]
  const commonGroups: (readonly string[])[] = [
    [project],
    [String(checks)],
    [String(budget)],
    [String(weeks)],
    groups.security,
    groups.regulation,
    groups.uncertainty,
    groups.finance,
  ]

  let prompt: string
  let suppliedPacket: string
  let rubric: CosUniversityLanguageARangeRubric
  if (args.target.stage === 'capstone') {
    suppliedPacket = packet
    prompt = `${capstoneInstruction(args.target.language)}\n\nDECISION PACKET:\n${packet}`
    rubric = {
      requiredGroups: [...commonGroups, groups.please, groups.thanks],
      requiredSections: ['[COMPREHENSION]', '[WRITING]', '[ACTIONS]', '[LOCALIZATION]', '[PRAGMATICS]'],
      numberedActions: 4,
      targetLanguage: args.target.language,
      forbiddenTerms: ['production is live', 'deployment succeeded', 'regulatory clearance is complete'],
      maxWords: 900,
    }
  } else {
    const transferPacket = args.target.dimension === 'translation_localization'
      ? translationPacket(args.target.language, { project, checks, budget, weeks })
      : packet
    suppliedPacket = transferPacket
    prompt = `HOST-CONTROLLED CROSS-DOMAIN LANGUAGE TRANSFER EXAM. Use only the packet. ${dimensionInstruction(args.target.language, args.target.dimension)}\n\nPACKET:\n${transferPacket}`
    rubric = {
      requiredGroups: [
        ...commonGroups,
        ...(args.target.dimension === 'cultural_pragmatics' ? [groups.please, groups.thanks] : []),
      ],
      numberedActions: args.target.dimension === 'instruction_following' ? 4 : undefined,
      targetLanguage: args.target.language,
      forbiddenTerms: ['production is live', 'deployment succeeded', 'regulatory clearance is complete'],
      maxWords: args.target.dimension === 'instruction_following' ? 420 : 500,
    }
  }

  const base: Omit<CosUniversityLanguageARangeExam, 'manifestHash'> = {
    profile: COS_UNIVERSITY_LANGUAGE_A_RANGE_PROFILE,
    scorerVersion: COS_UNIVERSITY_LANGUAGE_A_RANGE_SCORER,
    seed,
    stage: args.target.stage,
    language: args.target.language,
    dimension: args.target.dimension,
    project,
    prompt,
    packet: suppliedPacket,
    rubric,
  }
  return Object.freeze({ ...base, manifestHash: manifestHash(base) })
}

export function scoreCosUniversityLanguageARangeExam(
  exam: CosUniversityLanguageARangeExam,
  reply: string,
  provenance: CosUniversityARangeProvenance,
): CosUniversityLanguageARangeScore {
  const reasons: string[] = []
  const text = String(reply ?? '')
  const normalized = clean(text).toLowerCase()
  if (!normalized) reasons.push('empty_reply')
  if (provenance.handled !== true) reasons.push('not_handled')
  if (provenance.localReasoning !== true) reasons.push('local_reasoning_not_recorded')
  if (provenance.externalAi === true) reasons.push('external_ai_used')
  if (provenance.semanticCache === true) reasons.push('semantic_cache_used')
  if (!clean(provenance.turnId)) reasons.push('turn_id_missing')
  exam.rubric.requiredGroups.forEach((group, index) => {
    if (!hasAny(text, group)) reasons.push(`required_group_${index + 1}_missing`)
  })
  for (const section of exam.rubric.requiredSections ?? []) {
    if (!text.includes(section)) reasons.push(`section_missing:${section}`)
  }
  for (const forbidden of exam.rubric.forbiddenTerms ?? []) {
    if (normalized.includes(forbidden.toLowerCase())) reasons.push(`forbidden:${forbidden}`)
  }
  if (exam.rubric.numberedActions) {
    const actions = [...text.matchAll(/^\s*(\d+)[.)]\s+/gm)].map(match => Number(match[1]))
    if (actions.length !== exam.rubric.numberedActions || actions.some((value, index) => value !== index + 1)) {
      reasons.push('numbered_action_structure_failed')
    }
  }
  if (!LANGUAGE_MARKERS[exam.rubric.targetLanguage].test(text)) {
    reasons.push(`target_language_not_demonstrated:${exam.rubric.targetLanguage}`)
  }
  // A single marker hit proved only that one target-language token appeared somewhere. Required
  // terms are supplied to the learner by the rubric itself, so term coverage is not evidence of
  // writing ability either. The reply must be original prose written in the target language.
  reasons.push(...cosUniversityLanguageAuthenticityReasons({
    reply: text, packet: exam.packet, targetLanguage: exam.rubric.targetLanguage,
  }))
  if (words(text) > exam.rubric.maxWords) reasons.push('word_limit_exceeded')
  return { passed: reasons.length === 0, reasons }
}

export function parseCosUniversityVerifiedLanguageProductionSource(source: unknown): {
  language: CosPlatformLanguage
  dimension: CosPlatformLanguageDimension
  reference: string
} | null {
  const value = clean(source)
  if (!isCosUniversityVerifiedProductionSource(value)) return null
  const match = LANGUAGE_PRODUCTION_SOURCE.exec(value)
  if (!match) return null
  return {
    language: match[1].toLowerCase() as CosPlatformLanguage,
    dimension: match[2].toLowerCase() as CosPlatformLanguageDimension,
    reference: match[3],
  }
}

export function languageARangeStagePassesSinceLatestFailure(
  rows: CosUniversityLanguageARangeRunEvidence[],
  stage: CosUniversityLanguageARangeStage,
  language: CosPlatformLanguage,
  dimension: CosPlatformLanguageDimension | null,
): number {
  const relevant = rows
    .filter(row => row.stage === stage && row.language === language && row.dimension === dimension && Number.isFinite(Date.parse(row.observedAt)))
    .slice()
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
  let afterFailure: CosUniversityLanguageARangeRunEvidence[] = []
  for (const row of relevant) {
    if (!row.passed) afterFailure = []
    else afterFailure.push(row)
  }
  return new Set(afterFailure.map(row => clean(row.variantHash)).filter(Boolean)).size
}

export function languageARangeStageThresholdMet(
  rows: CosUniversityLanguageARangeRunEvidence[],
  stage: CosUniversityLanguageARangeStage,
  language: CosPlatformLanguage,
  dimension: CosPlatformLanguageDimension | null,
): boolean {
  return languageARangeStagePassesSinceLatestFailure(rows, stage, language, dimension)
    >= COS_UNIVERSITY_LANGUAGE_A_RANGE_MINIMUM_DISTINCT_PASSES
}

export function universityLanguageARangeValidUntil(stage: CosUniversityLanguageARangeStage, observedAt: Date): string {
  const days = stage === 'production_transfer' ? 90 : 120
  return new Date(observedAt.getTime() + days * 86_400_000).toISOString()
}
