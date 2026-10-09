// saas/lib/ai/cos/freshVerificationUnavailableReply.ts
//
// WHAT THE READER SEES WHEN A CURRENT FACT COULD NOT BE VERIFIED.
//
// Production, 2026-08-26. A visitor asked "are there direct flights from Paramaribo to Sao Paulo?"
// and received:
//
//   "COS retrieved live evidence, but the synthesis did not prove that its current-fact answer was
//    grounded in that evidence. The answer was rejected instead of guessing."
//
// The decision behind that message is right — flight routes change, and answering from memory
// would be a guess. The message is not. It reports internal machinery ("synthesis", "grounded in
// that evidence", "rejected") to someone who asked a simple question, gives them nothing to act
// on, and reads as a malfunction rather than as care.
//
// This module replaces it with the same decision stated in the reader's terms: what could not be
// confirmed, why answering from memory would be unreliable for this kind of fact, and where the
// answer actually lives. No internal vocabulary — this text ships to anonymous visitors.
//
// The category hint is deliberately coarse. It is derived from the question's own words, never
// from anything retrieved, so it cannot leak and cannot be wrong about a source it never saw.
//
// Zero imports.

export type VerificationLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

/** Coarse classes of current fact, each with an obvious authoritative place to look. */
type FactClass = 'travel' | 'price' | 'hours' | 'role' | 'status' | 'generic'

const TRAVEL = /(?<![\p{L}\p{N}_])(?:flight|flights|airline|airlines|fly|flying|route|routes|departure|arrival|train|ferry|bus|schedule[sd]?|timetable|vuelo|vuelos|aerol[ií]nea|voo|voos|companhia\s+a[eé]rea|lot|loty|рейс|рейсы|авиакомпани)(?![\p{L}\p{N}_])/iu
const PRICE = /(?<![\p{L}\p{N}_])(?:price|prices|pricing|cost|costs|fare|fares|rate|rates|tariff|precio|precios|tarifa|pre[çc]o|pre[çc]os|cena|ceny|цена|цены|стоимост)(?![\p{L}\p{N}_])/iu
const HOURS = /(?<![\p{L}\p{N}_])(?:open|opening|closing|hours|closed|horario|horarios|abierto|hor[áa]rio|aberto|godziny|otwart|часы\s+работы|открыт)(?![\p{L}\p{N}_])/iu
const ROLE = /(?<![\p{L}\p{N}_])(?:who\s+is|current\s+(?:ceo|president|prime\s+minister|director|head)|qui[eé]n\s+es|quem\s+[ée]|kto\s+jest|кто\s+(?:сейчас|является))(?![\p{L}\p{N}_])/iu
const STATUS = /(?<![\p{L}\p{N}_])(?:still\s+(?:open|running|available|operating)|available\s+now|in\s+stock|sigue\s+(?:abierto|disponible)|ainda\s+(?:aberto|dispon[íi]vel)|nadal\s+dost[ęe]pn|ещ[её]\s+(?:работает|доступ))(?![\p{L}\p{N}_])/iu

function classify(prompt: string): FactClass {
  const text = String(prompt ?? '')
  if (TRAVEL.test(text)) return 'travel'
  if (PRICE.test(text)) return 'price'
  if (HOURS.test(text)) return 'hours'
  if (ROLE.test(text)) return 'role'
  if (STATUS.test(text)) return 'status'
  return 'generic'
}

const COPY: Record<VerificationLanguage, { opening: string; where: Record<FactClass, string> }> = {
  en: {
    opening: 'I could not confirm this against a current source just now, and this is the kind of detail that changes, so I would rather not answer from memory and risk being out of date.',
    where: {
      travel: 'The operator\'s own site or a live booking search will have today\'s routes and times.',
      price: 'The provider\'s own pricing page will have the current figure.',
      hours: 'The venue\'s own listing or site will have today\'s hours.',
      role: 'The organisation\'s own site is the reliable place for who currently holds the position.',
      status: 'The provider\'s own page will show the current status.',
      generic: 'A primary source on the subject will have the current answer.',
    },
  },
  es: {
    opening: 'No pude confirmarlo con una fuente actual en este momento, y es un dato que cambia, así que prefiero no responder de memoria y arriesgarme a estar desactualizado.',
    where: {
      travel: 'El sitio del operador o una búsqueda de reservas en vivo tendrá las rutas y horarios de hoy.',
      price: 'La página de precios del proveedor tendrá la cifra actual.',
      hours: 'La ficha o el sitio del establecimiento tendrá el horario de hoy.',
      role: 'El sitio de la organización es el lugar fiable para saber quién ocupa el cargo actualmente.',
      status: 'La página del proveedor mostrará el estado actual.',
      generic: 'Una fuente primaria sobre el tema tendrá la respuesta actual.',
    },
  },
  pt: {
    opening: 'Não consegui confirmar isto numa fonte atual agora, e é o tipo de detalhe que muda, por isso prefiro não responder de memória e arriscar estar desatualizado.',
    where: {
      travel: 'O site da operadora ou uma busca de reservas ao vivo terá as rotas e horários de hoje.',
      price: 'A página de preços do fornecedor terá o valor atual.',
      hours: 'A ficha ou o site do estabelecimento terá o horário de hoje.',
      role: 'O site da organização é o lugar confiável para saber quem ocupa o cargo atualmente.',
      status: 'A página do fornecedor mostrará o estado atual.',
      generic: 'Uma fonte primária sobre o assunto terá a resposta atual.',
    },
  },
  pl: {
    opening: 'Nie udało mi się teraz potwierdzić tego w aktualnym źródle, a to szczegół, który się zmienia — wolę nie odpowiadać z pamięci i ryzykować nieaktualnej informacji.',
    where: {
      travel: 'Strona przewoźnika lub wyszukiwarka rezerwacji poda dzisiejsze trasy i godziny.',
      price: 'Strona cennika dostawcy poda aktualną kwotę.',
      hours: 'Wizytówka lub strona lokalu poda dzisiejsze godziny otwarcia.',
      role: 'Strona organizacji to wiarygodne miejsce, by sprawdzić, kto obecnie pełni tę funkcję.',
      status: 'Strona dostawcy pokaże bieżący status.',
      generic: 'Źródło pierwotne w tej sprawie poda aktualną odpowiedź.',
    },
  },
  ru: {
    opening: 'Сейчас я не смог подтвердить это по актуальному источнику, а такие сведения меняются — поэтому не буду отвечать по памяти и рисковать устаревшими данными.',
    where: {
      travel: 'Сайт перевозчика или живой поиск билетов покажет сегодняшние маршруты и время.',
      price: 'Страница с ценами поставщика покажет актуальную сумму.',
      hours: 'Карточка или сайт заведения покажет сегодняшние часы работы.',
      role: 'Сайт организации — надёжное место, чтобы узнать, кто сейчас занимает должность.',
      status: 'Страница поставщика покажет текущий статус.',
      generic: 'Первичный источник по теме даст актуальный ответ.',
    },
  },
  de: {
    opening: 'Ich konnte dies gerade nicht anhand einer aktuellen Quelle bestätigen, und es handelt sich um eine Angabe, die sich ändert. Daher antworte ich lieber nicht aus dem Gedächtnis und riskiere, veraltet zu sein.',
    where: {
      travel: 'Die Website des Betreibers oder eine Live-Buchungssuche zeigt die heutigen Verbindungen und Zeiten.',
      price: 'Die Preisseite des Anbieters nennt den aktuellen Betrag.',
      hours: 'Der Eintrag oder die Website des Veranstaltungsorts nennt die heutigen Öffnungszeiten.',
      role: 'Die Website der Organisation ist die verlässliche Quelle dafür, wer die Position derzeit innehat.',
      status: 'Die Seite des Anbieters zeigt den aktuellen Status.',
      generic: 'Eine Primärquelle zum Thema liefert die aktuelle Antwort.',
    },
  },
  fr: {
    opening: 'Je n’ai pas pu le confirmer auprès d’une source récente pour le moment, et c’est le genre d’information qui change ; je préfère donc ne pas répondre de mémoire au risque d’être dépassé.',
    where: {
      travel: 'Le site de l’opérateur ou une recherche de réservation en direct indiquera les itinéraires et horaires du jour.',
      price: 'La page de tarifs du fournisseur indiquera le montant actuel.',
      hours: 'La fiche ou le site de l’établissement indiquera les horaires du jour.',
      role: 'Le site de l’organisation est la source fiable pour savoir qui occupe actuellement ce poste.',
      status: 'La page du fournisseur affichera le statut actuel.',
      generic: 'Une source primaire sur le sujet fournira la réponse actuelle.',
    },
  },
  it: {
    opening: 'Non sono riuscito a confermarlo con una fonte aggiornata in questo momento, ed è un tipo di dato che cambia, quindi preferisco non rispondere a memoria rischiando di essere superato.',
    where: {
      travel: 'Il sito dell’operatore o una ricerca di prenotazione in tempo reale riporterà le tratte e gli orari di oggi.',
      price: 'La pagina dei prezzi del fornitore riporterà la cifra attuale.',
      hours: 'La scheda o il sito del locale riporterà gli orari di oggi.',
      role: 'Il sito dell’organizzazione è la fonte affidabile per sapere chi ricopre attualmente la posizione.',
      status: 'La pagina del fornitore mostrerà lo stato attuale.',
      generic: 'Una fonte primaria sull’argomento fornirà la risposta aggiornata.',
    },
  },
  ja: {
    opening: '現時点では最新の情報源で確認できませんでした。この種の情報は変わるため、記憶に頼って回答し、情報が古くなるリスクは避けたいと思います。',
    where: {
      travel: '運行会社の公式サイトやリアルタイムの予約検索で、本日の路線と時刻を確認できます。',
      price: 'プロバイダーの料金ページで現在の金額を確認できます。',
      hours: '施設の掲載情報や公式サイトで本日の営業時間を確認できます。',
      role: '現在その役職に就いている人物については、その組織の公式サイトが信頼できる情報源です。',
      status: 'プロバイダーの公式ページで現在のステータスを確認できます。',
      generic: 'このテーマに関する一次情報源で最新の回答を確認できます。',
    },
  },
  ko: {
    opening: '지금은 최신 출처로 이를 확인할 수 없었고, 이런 정보는 바뀌기 쉬우므로 기억에 의존해 답변했다가 오래된 정보가 될 위험을 감수하지 않겠습니다.',
    where: {
      travel: '운영사 공식 사이트나 실시간 예약 검색에서 오늘의 노선과 시간을 확인할 수 있습니다.',
      price: '제공업체의 요금 페이지에서 현재 금액을 확인할 수 있습니다.',
      hours: '해당 장소의 등록 정보나 사이트에서 오늘의 영업시간을 확인할 수 있습니다.',
      role: '현재 해당 직책을 맡고 있는 사람은 그 조직의 공식 사이트에서 확인하는 것이 가장 신뢰할 수 있습니다.',
      status: '제공업체의 페이지에서 현재 상태를 확인할 수 있습니다.',
      generic: '해당 주제의 1차 출처에서 최신 답변을 확인할 수 있습니다.',
    },
  },
  ar: {
    opening: 'لم أتمكن من التحقق من ذلك عبر مصدر حديث الآن، وهذا من نوع المعلومات التي تتغير، لذا أفضّل ألا أجيب من الذاكرة وأخاطر بتقديم معلومات قديمة.',
    where: {
      travel: 'سيعرض موقع المشغّل نفسه أو بحث الحجز المباشر مسارات ومواعيد اليوم.',
      price: 'ستعرض صفحة الأسعار الخاصة بالمزوّد الرقم الحالي.',
      hours: 'ستعرض صفحة المكان أو موقعه مواعيد العمل لهذا اليوم.',
      role: 'موقع المنظمة نفسها هو المصدر الموثوق لمعرفة من يشغل المنصب حاليًا.',
      status: 'ستعرض صفحة المزوّد الحالة الراهنة.',
      generic: 'سيقدّم مصدر أولي حول الموضوع الإجابة الحالية.',
    },
  },
}

function normalize(language: string | null | undefined): VerificationLanguage {
  const code = String(language ?? 'en').trim().slice(0, 2).toLowerCase()
  return code === 'es' || code === 'pt' || code === 'pl' || code === 'ru' || code === 'de' || code === 'fr' || code === 'it' || code === 'ja' || code === 'ko' || code === 'ar' ? code : 'en'
}

/**
 * The reply shipped when a current fact could not be verified.
 *
 * Contains no reference to retrieval, evidence, synthesis, grounding, confidence or any internal
 * component — it is safe on the public surface as written.
 */
export function buildFreshVerificationUnavailableReply(args: {
  prompt?: string | null
  language?: string | null
}): string {
  const language = normalize(args.language)
  const copy = COPY[language]
  return `${copy.opening} ${copy.where[classify(args.prompt ?? '')]}`
}

/** Exposed for tests: which coarse class a question falls into. */
export function factClassOf(prompt: string): string {
  return classify(prompt)
}
