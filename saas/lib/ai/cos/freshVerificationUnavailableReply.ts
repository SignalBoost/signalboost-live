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

export type VerificationLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

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
}

function normalize(language: string | null | undefined): VerificationLanguage {
  const code = String(language ?? 'en').trim().slice(0, 2).toLowerCase()
  return code === 'es' || code === 'pt' || code === 'pl' || code === 'ru' ? code : 'en'
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
