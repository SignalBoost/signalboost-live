import {
  criticalLanguageTokens,
  preservesExplicitlyRequestedCriticalTokens,
  type ConciergeLanguage,
} from './conciergeLanguageQuality.ts'

export type ConciergeLanguageAcceptanceCategory = 'conversation' | 'operational' | 'transformation' | 'reasoning' | 'fallback'
export type ConciergeLanguageAcceptanceMode = 'cos' | 'deterministic_fallback'

export type ConciergeLanguageAcceptanceCase = Readonly<{
  key: string
  title: string
  language: ConciergeLanguage
  category: ConciergeLanguageAcceptanceCategory
  mode: ConciergeLanguageAcceptanceMode
  prompt: string
  preserveCriticalTokens?: boolean
}>

export type ConciergeLanguageAcceptanceVerdicts = Readonly<{
  handled: boolean
  selectedLanguage: boolean
  noEnglishLeakage: boolean
  criticalTokensPreserved: boolean
  routingHealthy: boolean
  latencyHealthy: boolean
}>

export type ConciergeLanguageAcceptanceExecution = Readonly<{
  test: ConciergeLanguageAcceptanceCase
  reply: string
  responseSource: string
  localModelInvoked: boolean
  externalAiInvoked: boolean
  latencyMs: number
  nativeReviewConfidence: number | null
  nativeReviewerUsed: boolean
  verdicts: ConciergeLanguageAcceptanceVerdicts
  passed: boolean
}>

export const ACCEPTANCE_LANGUAGES: readonly ConciergeLanguage[] = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar']
const COS_MAX_LATENCY_MS = 150_000
const FALLBACK_MAX_LATENCY_MS = 2_000

const casesByLanguage: Record<ConciergeLanguage, readonly Omit<ConciergeLanguageAcceptanceCase, 'language' | 'key'>[]> = {
  en: [
    { title: 'English ordinary conversation', category: 'conversation', mode: 'cos', prompt: 'Our internal pilot is called ALPHA-42. In two or three natural sentences, explain why a short pilot can reduce implementation risk without claiming that ALPHA-42 has already succeeded. Keep ALPHA-42 unchanged.' },
    { title: 'English operational guidance', category: 'operational', mode: 'cos', prompt: 'I want to use SignalBoost Concierge to improve a customer email for project ALPHA-42. Give me three concise steps. Keep ALPHA-42 unchanged and do not claim the email has already been sent.' },
    { title: 'English writing transformation', category: 'transformation', mode: 'cos', prompt: 'Rewrite this as a natural professional message while preserving ALPHA-42 and https://example.com/plan exactly: “hi team alpha-42 is ready for review please look at https://example.com/plan and send comments tomorrow thanks”.' },
    { title: 'English reasoning', category: 'reasoning', mode: 'cos', prompt: 'Project ALPHA-42 has two options. Option A uses the existing team for a 14-day pilot. Option B requires a new vendor and a 45-day pilot. Recommend one option, explain the trade-off, and keep ALPHA-42 unchanged. Do not invent costs.' },
    { title: 'English deterministic fallback', category: 'fallback', mode: 'deterministic_fallback', preserveCriticalTokens: false, prompt: 'How do I export my finished video to MP4?' },
  ],
  es: [
    { title: 'Spanish ordinary conversation', category: 'conversation', mode: 'cos', prompt: 'Nuestro piloto interno se llama ALPHA-42. Explica en dos o tres frases naturales por qué un piloto corto puede reducir el riesgo de implantación, sin afirmar que ALPHA-42 ya haya tenido éxito. Mantén ALPHA-42 sin cambios.' },
    { title: 'Spanish operational guidance', category: 'operational', mode: 'cos', prompt: 'Quiero usar SignalBoost Concierge para mejorar un correo a un cliente sobre el proyecto ALPHA-42. Dame tres pasos breves. Mantén ALPHA-42 sin cambios y no digas que el correo ya fue enviado.' },
    { title: 'Spanish writing transformation', category: 'transformation', mode: 'cos', prompt: 'Reescribe este mensaje con un tono profesional y natural, conservando ALPHA-42 y https://example.com/plan exactamente: “hola equipo alpha-42 está listo para revisión miren https://example.com/plan y manden comentarios mañana gracias”.' },
    { title: 'Spanish reasoning', category: 'reasoning', mode: 'cos', prompt: 'El proyecto ALPHA-42 tiene dos opciones. La opción A usa el equipo actual para un piloto de 14 días. La opción B requiere un proveedor nuevo y un piloto de 45 días. Recomienda una opción, explica la compensación y mantén ALPHA-42 sin cambios. No inventes costes.' },
    { title: 'Spanish deterministic fallback', category: 'fallback', mode: 'deterministic_fallback', preserveCriticalTokens: false, prompt: '¿Cómo exporto mi vídeo terminado a MP4?' },
  ],
  pt: [
    { title: 'Portuguese ordinary conversation', category: 'conversation', mode: 'cos', prompt: 'Nosso piloto interno se chama ALPHA-42. Explique em duas ou três frases naturais por que um piloto curto pode reduzir o risco de implementação, sem afirmar que o ALPHA-42 já deu certo. Mantenha ALPHA-42 sem alterações.' },
    { title: 'Portuguese operational guidance', category: 'operational', mode: 'cos', prompt: 'Quero usar o SignalBoost Concierge para melhorar um e-mail para um cliente sobre o projeto ALPHA-42. Dê três passos curtos. Mantenha ALPHA-42 sem alterações e não diga que o e-mail já foi enviado.' },
    { title: 'Portuguese writing transformation', category: 'transformation', mode: 'cos', prompt: 'Reescreva esta mensagem em português brasileiro natural e profissional, preservando ALPHA-42 e https://example.com/plan exatamente: “oi equipe alpha-42 está pronto para revisão vejam https://example.com/plan e mandem comentários amanhã obrigado”.' },
    { title: 'Portuguese reasoning', category: 'reasoning', mode: 'cos', prompt: 'O projeto ALPHA-42 tem duas opções. A opção A usa a equipe atual em um piloto de 14 dias. A opção B exige um novo fornecedor e um piloto de 45 dias. Recomende uma opção, explique o equilíbrio entre elas e mantenha ALPHA-42 sem alterações. Não invente custos.' },
    { title: 'Portuguese deterministic fallback', category: 'fallback', mode: 'deterministic_fallback', preserveCriticalTokens: false, prompt: 'Como exporto meu vídeo final para MP4?' },
  ],
  pl: [
    { title: 'Polish ordinary conversation', category: 'conversation', mode: 'cos', prompt: 'Nasz wewnętrzny pilotaż nazywa się ALPHA-42. W dwóch lub trzech naturalnych zdaniach wyjaśnij, dlaczego krótki pilotaż może ograniczyć ryzyko wdrożenia, ale nie twierdź, że ALPHA-42 już zakończył się sukcesem. Zachowaj ALPHA-42 bez zmian.' },
    { title: 'Polish operational guidance', category: 'operational', mode: 'cos', prompt: 'Chcę użyć SignalBoost Concierge do poprawienia wiadomości e-mail do klienta dotyczącej projektu ALPHA-42. Podaj trzy krótkie kroki. Zachowaj ALPHA-42 bez zmian i nie pisz, że wiadomość została już wysłana.' },
    { title: 'Polish writing transformation', category: 'transformation', mode: 'cos', prompt: 'Przeredaguj tę wiadomość na naturalny, profesjonalny polski, zachowując dokładnie ALPHA-42 i https://example.com/plan: „cześć zespół alpha-42 jest gotowy do przeglądu zobaczcie https://example.com/plan i wyślijcie uwagi jutro dzięki”.' },
    { title: 'Polish reasoning', category: 'reasoning', mode: 'cos', prompt: 'Projekt ALPHA-42 ma dwie opcje. Opcja A wykorzystuje obecny zespół w 14-dniowym pilotażu. Opcja B wymaga nowego dostawcy i 45-dniowego pilotażu. Zarekomenduj jedną opcję, wyjaśnij kompromis i zachowaj ALPHA-42 bez zmian. Nie wymyślaj kosztów.' },
    { title: 'Polish deterministic fallback', category: 'fallback', mode: 'deterministic_fallback', preserveCriticalTokens: false, prompt: 'Jak wyeksportować gotowy film do MP4?' },
  ],
  ru: [
    { title: 'Russian ordinary conversation', category: 'conversation', mode: 'cos', prompt: 'Наш внутренний пилот называется ALPHA-42. В двух-трёх естественных предложениях объясни, почему короткий пилот может снизить риск внедрения, но не утверждай, что ALPHA-42 уже завершился успешно. Сохрани ALPHA-42 без изменений.' },
    { title: 'Russian operational guidance', category: 'operational', mode: 'cos', prompt: 'Я хочу использовать SignalBoost Concierge, чтобы улучшить письмо клиенту о проекте ALPHA-42. Дай три коротких шага. Сохрани ALPHA-42 без изменений и не утверждай, что письмо уже отправлено.' },
    { title: 'Russian writing transformation', category: 'transformation', mode: 'cos', prompt: 'Перепиши это сообщение на естественном профессиональном русском языке, сохранив ALPHA-42 и https://example.com/plan без изменений: «привет команда alpha-42 готов к проверке посмотрите https://example.com/plan и пришлите комментарии завтра спасибо».' },
    { title: 'Russian reasoning', category: 'reasoning', mode: 'cos', prompt: 'У проекта ALPHA-42 есть два варианта. Вариант A использует текущую команду для 14-дневного пилота. Вариант B требует нового поставщика и 45-дневного пилота. Рекомендуй один вариант, объясни компромисс и сохрани ALPHA-42 без изменений. Не придумывай стоимость.' },
    { title: 'Russian deterministic fallback', category: 'fallback', mode: 'deterministic_fallback', preserveCriticalTokens: false, prompt: 'Как экспортировать готовое видео в MP4?' },
  ],
  de: [
    { title: 'German ordinary conversation', category: 'conversation', mode: 'cos', prompt: 'Unser interner Pilot heißt ALPHA-42. Erklären Sie in zwei oder drei natürlichen Sätzen, warum ein kurzer Pilot das Einführungsrisiko senken kann, ohne zu behaupten, dass ALPHA-42 bereits erfolgreich war. Lassen Sie ALPHA-42 unverändert.' },
    { title: 'German operational guidance', category: 'operational', mode: 'cos', prompt: 'Ich möchte SignalBoost Concierge nutzen, um eine Kunden-E-Mail zum Projekt ALPHA-42 zu verbessern. Nennen Sie mir drei kurze Schritte. Lassen Sie ALPHA-42 unverändert und behaupten Sie nicht, dass die E-Mail bereits gesendet wurde.' },
    { title: 'German writing transformation', category: 'transformation', mode: 'cos', prompt: 'Formulieren Sie diese Nachricht in natürliches, professionelles Deutsch um und übernehmen Sie ALPHA-42 und https://example.com/plan genau so: „hallo team alpha-42 ist bereit zur prüfung schaut euch https://example.com/plan an und schickt morgen kommentare danke“.' },
    { title: 'German reasoning', category: 'reasoning', mode: 'cos', prompt: 'Für das Projekt ALPHA-42 gibt es zwei Optionen. Option A nutzt das bestehende Team für einen 14-tägigen Pilot. Option B erfordert einen neuen Anbieter und einen 45-tägigen Pilot. Empfehlen Sie eine Option, erläutern Sie die Abwägung und lassen Sie ALPHA-42 unverändert. Erfinden Sie keine Kosten.' },
    { title: 'German deterministic fallback', category: 'fallback', mode: 'deterministic_fallback', preserveCriticalTokens: false, prompt: 'Wie exportiere ich mein fertiges Video als MP4?' },
  ],
  fr: [
    { title: 'French ordinary conversation', category: 'conversation', mode: 'cos', prompt: 'Notre pilote interne s’appelle ALPHA-42. Expliquez en deux ou trois phrases naturelles pourquoi un pilote court peut réduire le risque de déploiement, sans affirmer qu’ALPHA-42 a déjà réussi. Gardez ALPHA-42 inchangé.' },
    { title: 'French operational guidance', category: 'operational', mode: 'cos', prompt: 'Je veux utiliser SignalBoost Concierge pour améliorer un e-mail client concernant le projet ALPHA-42. Donnez-moi trois étapes concises. Gardez ALPHA-42 inchangé et n’affirmez pas que l’e-mail a déjà été envoyé.' },
    { title: 'French writing transformation', category: 'transformation', mode: 'cos', prompt: 'Réécrivez ce message dans un français naturel et professionnel, en conservant exactement ALPHA-42 et https://example.com/plan : « salut l’équipe alpha-42 est prêt pour la relecture regardez https://example.com/plan et envoyez vos commentaires demain merci ».' },
    { title: 'French reasoning', category: 'reasoning', mode: 'cos', prompt: 'Le projet ALPHA-42 a deux options. L’option A s’appuie sur l’équipe actuelle pour un pilote de 14 jours. L’option B exige un nouveau fournisseur et un pilote de 45 jours. Recommandez une option, expliquez le compromis et gardez ALPHA-42 inchangé. N’inventez pas de coûts.' },
    { title: 'French deterministic fallback', category: 'fallback', mode: 'deterministic_fallback', preserveCriticalTokens: false, prompt: 'Comment exporter ma vidéo terminée en MP4 ?' },
  ],
  it: [
    { title: 'Italian ordinary conversation', category: 'conversation', mode: 'cos', prompt: 'Il nostro pilota interno si chiama ALPHA-42. Spiega in due o tre frasi naturali perché un pilota breve può ridurre il rischio di implementazione, senza affermare che ALPHA-42 abbia già avuto successo. Mantieni ALPHA-42 invariato.' },
    { title: 'Italian operational guidance', category: 'operational', mode: 'cos', prompt: 'Voglio usare SignalBoost Concierge per migliorare un’e-mail a un cliente sul progetto ALPHA-42. Dammi tre passaggi brevi. Mantieni ALPHA-42 invariato e non dire che l’e-mail è già stata inviata.' },
    { title: 'Italian writing transformation', category: 'transformation', mode: 'cos', prompt: 'Riscrivi questo messaggio in un italiano naturale e professionale, conservando esattamente ALPHA-42 e https://example.com/plan: «ciao team alpha-42 è pronto per la revisione guardate https://example.com/plan e mandate commenti domani grazie».' },
    { title: 'Italian reasoning', category: 'reasoning', mode: 'cos', prompt: 'Il progetto ALPHA-42 ha due opzioni. L’opzione A usa il team attuale per un pilota di 14 giorni. L’opzione B richiede un nuovo fornitore e un pilota di 45 giorni. Consiglia un’opzione, spiega il compromesso e mantieni ALPHA-42 invariato. Non inventare costi.' },
    { title: 'Italian deterministic fallback', category: 'fallback', mode: 'deterministic_fallback', preserveCriticalTokens: false, prompt: 'Come esporto il mio video finito in MP4?' },
  ],
  ja: [
    { title: 'Japanese ordinary conversation', category: 'conversation', mode: 'cos', prompt: '社内パイロットの名前は ALPHA-42 です。ALPHA-42 がすでに成功したとは言わずに、短いパイロットが導入リスクを下げられる理由を自然な文 2〜3 文で説明してください。ALPHA-42 はそのまま残してください。' },
    { title: 'Japanese operational guidance', category: 'operational', mode: 'cos', prompt: 'SignalBoost Concierge を使って、プロジェクト ALPHA-42 に関する顧客向けメールを改善したいです。簡潔な手順を 3 つ教えてください。ALPHA-42 はそのまま残し、メールがすでに送信されたとは言わないでください。' },
    { title: 'Japanese writing transformation', category: 'transformation', mode: 'cos', prompt: '次のメッセージを自然でビジネスにふさわしい日本語に書き直してください。ALPHA-42 と https://example.com/plan は変更せずそのまま残してください:「みんな alpha-42 レビューの準備できた https://example.com/plan 見て 明日までにコメントちょうだい ありがと」。' },
    { title: 'Japanese reasoning', category: 'reasoning', mode: 'cos', prompt: 'プロジェクト ALPHA-42 には 2 つの選択肢があります。選択肢 A は既存のチームで 14 日間のパイロットを行います。選択肢 B は新しいベンダーと 45 日間のパイロットが必要です。どちらかを推奨し、トレードオフを説明してください。ALPHA-42 はそのまま残し、費用をでっち上げないでください。' },
    { title: 'Japanese deterministic fallback', category: 'fallback', mode: 'deterministic_fallback', preserveCriticalTokens: false, prompt: '完成した動画を MP4 で書き出すにはどうすればよいですか?' },
  ],
  ko: [
    { title: 'Korean ordinary conversation', category: 'conversation', mode: 'cos', prompt: '저희 내부 파일럿의 이름은 ALPHA-42입니다. ALPHA-42가 이미 성공했다고 주장하지 말고, 짧은 파일럿이 도입 위험을 줄일 수 있는 이유를 자연스러운 두세 문장으로 설명해 주세요. ALPHA-42는 그대로 유지해 주세요.' },
    { title: 'Korean operational guidance', category: 'operational', mode: 'cos', prompt: 'SignalBoost Concierge를 사용해 프로젝트 ALPHA-42에 관한 고객 이메일을 개선하고 싶습니다. 간결한 단계 세 가지를 알려 주세요. ALPHA-42는 그대로 유지하고, 이메일이 이미 발송되었다고 말하지 마세요.' },
    { title: 'Korean writing transformation', category: 'transformation', mode: 'cos', prompt: '다음 메시지를 자연스럽고 전문적인 한국어로 다시 작성해 주세요. ALPHA-42와 https://example.com/plan은 변경 없이 그대로 유지해 주세요: "팀 안녕 alpha-42 검토 준비됐어 https://example.com/plan 보고 내일 의견 보내줘 고마워".' },
    { title: 'Korean reasoning', category: 'reasoning', mode: 'cos', prompt: '프로젝트 ALPHA-42에는 두 가지 옵션이 있습니다. 옵션 A는 기존 팀으로 14일간 파일럿을 진행합니다. 옵션 B는 새 공급업체와 45일간의 파일럿이 필요합니다. 한 가지를 추천하고 장단점을 설명하되 ALPHA-42는 그대로 유지해 주세요. 비용을 지어내지 마세요.' },
    { title: 'Korean deterministic fallback', category: 'fallback', mode: 'deterministic_fallback', preserveCriticalTokens: false, prompt: '완성된 동영상을 MP4로 내보내려면 어떻게 하나요?' },
  ],
  ar: [
    { title: 'Arabic ordinary conversation', category: 'conversation', mode: 'cos', prompt: 'اسم مشروعنا التجريبي الداخلي ALPHA-42. اشرح في جملتين أو ثلاث جمل طبيعية لماذا يمكن لتجربة قصيرة أن تقلل مخاطر التنفيذ، دون الادعاء بأن ALPHA-42 قد نجح بالفعل. أبقِ ALPHA-42 دون تغيير.' },
    { title: 'Arabic operational guidance', category: 'operational', mode: 'cos', prompt: 'أريد استخدام SignalBoost Concierge لتحسين رسالة بريد إلكتروني إلى عميل بشأن المشروع ALPHA-42. أعطني ثلاث خطوات موجزة. أبقِ ALPHA-42 دون تغيير ولا تقل إن الرسالة قد أُرسلت بالفعل.' },
    { title: 'Arabic writing transformation', category: 'transformation', mode: 'cos', prompt: 'أعد صياغة هذه الرسالة بعربية طبيعية ومهنية، مع الإبقاء على ALPHA-42 و https://example.com/plan كما هي بالضبط: «مرحبا يا فريق alpha-42 جاهز للمراجعة شوفوا https://example.com/plan وابعثوا ملاحظاتكم بكرة شكرا».' },
    { title: 'Arabic reasoning', category: 'reasoning', mode: 'cos', prompt: 'لدى المشروع ALPHA-42 خياران. الخيار A يستخدم الفريق الحالي في تجربة مدتها 14 يومًا. الخيار B يتطلب موردًا جديدًا وتجربة مدتها 45 يومًا. أوصِ بخيار واحد، واشرح المفاضلة بينهما، وأبقِ ALPHA-42 دون تغيير. لا تخترع تكاليف.' },
    { title: 'Arabic deterministic fallback', category: 'fallback', mode: 'deterministic_fallback', preserveCriticalTokens: false, prompt: 'كيف أصدّر الفيديو النهائي بصيغة MP4؟' },
  ],
}

export const CONCIERGE_LANGUAGE_ACCEPTANCE_CASES: readonly ConciergeLanguageAcceptanceCase[] = Object.freeze(
  ACCEPTANCE_LANGUAGES.flatMap(language => casesByLanguage[language].map((test, index) => ({ ...test, language, key: `${language}-${index + 1}-${test.category}` }))),
)

const STOPWORDS: Record<ConciergeLanguage, readonly string[]> = {
  en: ['the', 'and', 'to', 'of', 'is', 'are', 'you', 'your', 'for', 'with', 'that', 'this', 'can', 'should'],
  es: ['de', 'la', 'el', 'que', 'y', 'para', 'en', 'con', 'una', 'un', 'por', 'puede', 'puedes', 'debe'],
  pt: ['de', 'o', 'a', 'que', 'e', 'para', 'em', 'com', 'uma', 'um', 'por', 'você', 'pode', 'deve'],
  pl: ['i', 'w', 'na', 'do', 'z', 'że', 'jest', 'nie', 'dla', 'można', 'aby', 'się', 'oraz', 'powinien'],
  ru: ['и', 'в', 'на', 'что', 'это', 'не', 'для', 'с', 'как', 'можно', 'чтобы', 'по', 'из', 'нужно'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'für', 'sie', 'ein', 'eine', 'zu', 'den', 'von', 'kann', 'auf', 'in', 'des', 'dem', 'werden', 'oder', 'auch'],
  fr: ['le', 'la', 'les', 'de', 'des', 'du', 'et', 'est', 'un', 'une', 'en', 'que', 'pour', 'avec', 'vous', 'dans', 'pas', 'qui', 'sur', 'peut', 'il', 'a', 'au', 'y', 'non', 'ce'],
  it: ['il', 'lo', 'la', 'gli', 'di', 'che', 'e', 'è', 'per', 'un', 'una', 'con', 'non', 'della', 'del', 'può', 'sono', 'nel', 'alla', 'anche'],
  // Japanese is written without spaces, so word tokens are not meaningful; the kana check below carries the signal.
  ja: [],
  ko: ['수', '있습니다', '및', '또는', '그리고', '위해', '있는', '하는', '것', '더', '할', '합니다'],
  ar: ['في', 'من', 'على', 'إلى', 'أن', 'هذا', 'هذه', 'مع', 'عن', 'التي', 'الذي', 'يمكن', 'لا', 'ما', 'أو', 'قبل', 'بعد', 'كل'],
}

const ENGLISH_LEAKAGE_PHRASE = /\b(?:i can|you can|your goal|your role|open the|go to|click the|start by|next step|then choose|tell me|to get started)\b/i
const NON_RELEASE_SOURCES = new Set(['external_fallback_required', 'semantic_cache', 'semantic_similarity'])

function words(text: string): string[] { return String(text || '').toLocaleLowerCase().match(/\p{L}+/gu) ?? [] }
function stopwordHits(text: string, language: ConciergeLanguage): number {
  const set = new Set(STOPWORDS[language])
  return words(text).reduce((count, token) => count + (set.has(token) ? 1 : 0), 0)
}

export function selectedLanguageSignal(text: string, language: ConciergeLanguage): boolean {
  const value = String(text || '').trim()
  if (!value) return false
  const targetHits = stopwordHits(value, language)
  if (language === 'ru') return (value.match(/[А-Яа-яЁё]/g) ?? []).length >= 12 && targetHits >= 2
  // Japanese is identified by kana, which Chinese-only text never contains; Korean and Arabic by their own scripts.
  if (language === 'ja') return (value.match(/[\u3040-\u30ff]/gu) ?? []).length >= 8
  if (language === 'ko') return (value.match(/[\uac00-\ud7af]/gu) ?? []).length >= 12
  if (language === 'ar') return (value.match(/[\u0621-\u064a]/gu) ?? []).length >= 12
  if (language === 'en') return targetHits >= 3
  if (language === 'pl') {
    const polishOrthographyHits = (value.match(/[ąćęłńóśźż]/giu) ?? []).length
    if (polishOrthographyHits >= 3 && targetHits >= 1) return true
  }
  const otherHits = ACCEPTANCE_LANGUAGES.filter(code => code !== language && code !== 'en').map(code => stopwordHits(value, code))
  return targetHits >= 2 && targetHits >= Math.max(0, ...otherHits)
}

export function hasEnglishLeakage(text: string, language: ConciergeLanguage): boolean {
  if (language === 'en') return false
  const targetHits = stopwordHits(text, language)
  const englishHits = stopwordHits(text, 'en')
  return ENGLISH_LEAKAGE_PHRASE.test(text) || englishHits >= Math.max(7, targetHits + 4)
}

export function evaluateLanguageAcceptanceText(input: {
  test: ConciergeLanguageAcceptanceCase
  reply: string
  handled: boolean
  responseSource: string
  localModelInvoked: boolean
  externalAiInvoked: boolean
  latencyMs: number
}): ConciergeLanguageAcceptanceVerdicts {
  const criticalOk = input.test.preserveCriticalTokens === false
    ? true
    : preservesExplicitlyRequestedCriticalTokens(input.test.prompt, input.reply)
  const source = String(input.responseSource || '').trim().toLowerCase()
  const routingHealthy = input.handled && Boolean(source) && !NON_RELEASE_SOURCES.has(source) && input.externalAiInvoked === false
    && (input.test.mode === 'deterministic_fallback' || input.localModelInvoked === true || source.startsWith('deterministic_') || source.startsWith('cos_'))
  return {
    handled: input.handled,
    selectedLanguage: selectedLanguageSignal(input.reply, input.test.language),
    noEnglishLeakage: !hasEnglishLeakage(input.reply, input.test.language),
    criticalTokensPreserved: criticalOk,
    routingHealthy,
    latencyHealthy: input.latencyMs <= (input.test.mode === 'cos' ? COS_MAX_LATENCY_MS : FALLBACK_MAX_LATENCY_MS),
  }
}

export function summarizeLanguageAcceptance(rows: Array<{ language: string; passed: boolean }>) {
  return Object.fromEntries(ACCEPTANCE_LANGUAGES.map(language => {
    const items = rows.filter(row => row.language === language)
    return [language, { attempted: items.length, passed: items.filter(row => row.passed).length, automatedPassed: items.length === 5 && items.every(row => row.passed) }]
  }))
}

export function requiredNativeReviewTemplate(): Record<ConciergeLanguage, 'pending'> {
  return { en: 'pending', es: 'pending', pt: 'pending', pl: 'pending', ru: 'pending', de: 'pending', fr: 'pending', it: 'pending', ja: 'pending', ko: 'pending', ar: 'pending' }
}

export function acceptanceCriticalTokens(test: ConciergeLanguageAcceptanceCase): string[] {
  return test.preserveCriticalTokens === false ? [] : criticalLanguageTokens(test.prompt)
}
