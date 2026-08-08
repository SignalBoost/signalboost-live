// saas/lib/outreach/prospectCampaignRequest.ts
// Deterministic recognition for owner requests that should become a durable
// background prospect-campaign job instead of one long chat/model request.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS FILE DOES NOT DECIDE WHICH PIPELINE A BRIEF BELONGS TO. campaignIntent DOES.
//
// It used to decide, by asking only "is this prospect-shaped?" — a question with no way to
// answer "no, it is press". A press brief that forbade sales prospecting three times was
// executed as a sales campaign, because the forbidding sentences were the only place the
// words "outreach campaign" appeared and this file read them as a request.
//
// The concierge route calls parseProspectCampaignRequest DIRECTLY, before any model runs,
// and returns immediately if it parses. So the guard cannot live in a route: whichever
// route is bypassed is the one where the guard was. It lives here, at the parser, which is
// the last thing every path goes through.

import { classifyCampaignIntent, campaignIntentAllows } from '@/lib/outreach/campaignIntent'

export type ParsedProspectCampaignRequest = {
  offer: string
  targetCriteria: string
  region: string | null
  requestedCount: number
  language: 'en' | 'es' | 'pt' | 'pl' | 'ru'
}

const COUNT_PATTERN = /\b(?:find|get|build|list|source|research|identify|locate|encontr\w*|busca\w*|lista\w*|pesquis\w*|znajd\w*|wyszuk\w*|найд\w*|исслед\w*)\D{0,28}(\d{1,3})\b|\b(\d{1,3})\s*(?:companies|company|prospects?|leads?|targets?|accounts?|empresas?|firmas?|firmy|prospek\w*|компани\w*|лид\w*)/i

const CAMPAIGN_INTENT = /\b(?:run|start|create|launch|build|prepare|generate|draft|execute|set up|iniciar|criar|lan[çc]ar|preparar|gerar|executar|crear|lanzar|ejecutar|uruchom|stw[oó]rz|przygotuj|wygeneruj|запусти|создай|подготовь|сгенерируй)\b[\s\S]{0,120}\b(?:email outreach|outreach campaign|email campaign|prospect campaign|cold emails?|outreach emails?|sales campaign|campanha de prospec[çc][aã]o|campanha de e-?mail|campa[ñn]a de prospecci[oó]n|campa[ñn]a de correo|kampani\w* outreach|kampani\w* e-?mail|кампани\w* аутрич|почтов\w* кампани\w*)\b/i

const SECONDARY_INTENT = /\b(?:email outreach|outreach campaign|email campaign|prospect campaign|cold emails?|outreach emails?|sales campaign)\b[\s\S]{0,160}\b(?:sell|market|promote|target|find|source|research|draft)/i

// THIRD FORM — A BRIEF, NOT A SENTENCE.
//
// The two patterns above both expect an instruction: a verb ("run", "launch") near a noun
// phrase ("outreach campaign"). A real brief does not read like that. This one did not:
//
//   Campaign: enterprise outreach, portable software products.
//   AUDIENCE … Region: USA — Language: English — Find 30 companies
//
// There is no verb, and "enterprise outreach" is the words in the other order, so neither
// pattern matched and the request was silently treated as a question. The operator got a
// research answer, no job was created, and nothing said the campaign had not started —
// which is the worst of the three possible outcomes.
//
// A brief is recognised by its SHAPE instead: a campaign word, an outreach word, and a
// count. The count is what keeps this tight — "how does the outreach campaign work?" has
// two of the three and is correctly still a question, because the count gate below
// requires a number of at least three.
const BRIEF_CAMPAIGN_WORD = /\b(?:campaign|campanha|campa[ñn]a|kampania|кампания)\b/i
const BRIEF_OUTREACH_WORD = /\b(?:outreach|prospect\w*|cold email\w*|lead gen\w*|leads?|prospec[çc][aã]o|prospecci[oó]n|аутрич|лид\w*)\b/i
const BRIEF_INTENT_WORD = /\b(?:promote|sell|market|target|audience|find|source|identify|p[uú]blico|audiencia|odbiorcy|целевая)\b/i

function looksLikeBrief(input: string): boolean {
  return BRIEF_CAMPAIGN_WORD.test(input) && BRIEF_OUTREACH_WORD.test(input) && BRIEF_INTENT_WORD.test(input)
}

// This blocks only an explicit instruction not to create/draft the campaign.
// Safety language such as "do not contact anyone" does not block the job because
// the worker only creates pending drafts and never sends them.
const CAMPAIGN_NEGATION = /\b(?:do not|don't|never|no)\s+(?:run|start|create|launch|build|prepare|generate|draft|execute)\b[\s\S]{0,80}\b(?:campaign|outreach|email)/i

// A brief writes "AUDIENCE" as a heading on its own line, with no colon after it. Without
// this the whole brief became the offer and the target criteria came back empty, which is a
// second, quieter way the same request gets rejected.
const TARGET_MARKER = /\b(?:target|targets|target audience|ideal customers?|ideal buyers?|prospects?|p[uú]blico[- ]alvo|alvo|audiencia|clientes ideales|grupa docelowa|odbiorcy|целевая аудитория|клиенты)\s*:\s*|(?:^|\n)\s*(?:AUDIENCE|TARGET AUDIENCE|AUDIÊNCIA|AUDIENCIA|PÚBLICO[- ]ALVO|ODBIORCY|ЦЕЛЕВАЯ АУДИТОРИЯ)\s*(?:\n|:)/i

function clean(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}

function normalizeLanguage(value: string): ParsedProspectCampaignRequest['language'] {
  const language = String(value || 'en').toLowerCase()
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(language)
    ? language as ParsedProspectCampaignRequest['language']
    : 'en'
}

// The language of the DASHBOARD is not the language of the recipient. Before this
// existed, parseProspectCampaignRequest simply stored the caller's UI language and
// ignored lines such as "Language: Polish" or "The email should be in Spanish". Brazil
// happened to look correct because the later website-language detector often rescued
// Portuguese; Spanish, Polish and Russian did not. The campaign brief is authoritative.
function languageCodeFromText(value: string): ParsedProspectCampaignRequest['language'] | null {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (/\b(?:english|ingles|angielski|английск(?:ий|ом)|en)\b/i.test(normalized)) return 'en'
  if (/\b(?:spanish|espanol|español|hiszpanski|испанск(?:ий|ом)|es)\b/i.test(normalized)) return 'es'
  if (/\b(?:portuguese|portugues|português|brazilian portuguese|portugues brasileiro|pt-br|pt)\b/i.test(normalized)) return 'pt'
  if (/\b(?:polish|polski|polsku|польск(?:ий|ом)|pl)\b/i.test(normalized)) return 'pl'
  if (/\b(?:russian|rosyjski|rosyjsku|русск(?:ий|ом)|ru)\b/i.test(normalized)) return 'ru'
  return null
}

function languageFromRegion(region: string | null): ParsedProspectCampaignRequest['language'] | null {
  const value = String(region || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (/\b(?:brazil|brasil|portugal)\b/.test(value)) return 'pt'
  if (/\b(?:mexico|spain|espana|argentina|colombia|chile|peru|ecuador|uruguay|paraguay|venezuela|costa rica|panama)\b/.test(value)) return 'es'
  if (/\b(?:poland|polska)\b/.test(value)) return 'pl'
  if (/\b(?:russia|россия)\b/.test(value)) return 'ru'
  return null
}

function extractRequestedLanguage(
  text: string,
  fallback: string,
  region: string | null,
): ParsedProspectCampaignRequest['language'] {
  // Structured briefs: "Language: Polish", "Idioma: Español", "Język: polski".
  const labelled = text.match(/\b(?:language|idioma|j[eę]zyk|язык)\s*:\s*([^\n.;|—–]{1,50})/i)
  const labelledCode = labelled?.[1] ? languageCodeFromText(labelled[1]) : null
  if (labelledCode) return labelledCode

  // Natural requests: "the email should be in Portuguese", "write the drafts in Polish".
  const natural = text.match(/\b(?:email|emails|draft|drafts|message|messages|copy|outreach|correo|correos|wiadomo(?:ść|ści)|черновик\w*|письм\w*)\b[^\n.!?]{0,80}\b(?:in|em|en|po|на)\s+([^\n,.;!?—–]{2,40})/i)
  const naturalCode = natural?.[1] ? languageCodeFromText(natural[1]) : null
  if (naturalCode) return naturalCode

  // When the brief names a market but omits a language, use that market's ordinary
  // outreach language for the regions SignalBoost explicitly supports. The caller/UI
  // language is only the final fallback, never a substitute for the recipient's market.
  return languageFromRegion(region) || normalizeLanguage(fallback)
}

/**
 * A brief writes its settings on one line: "Region: USA - Language: English - Find 30
 * companies". Reading to the end of the line captured all of it as the region, and a region
 * of "USA - Language: English - Find 30 companies" is not a place. It happened to still match
 * the US profile by substring, which is worse than failing — it worked by luck and would have
 * silently mis-targeted any country whose name is not inside the tail.
 *
 * So a region stops at the first separator that starts another setting.
 */
function trimRegion(value: string): string {
  return clean(
    String(value || '')
      .split(/\s+[-—–|]\s+/)[0]
      .split(/\b(?:language|idioma|j[eę]zyk|язык|find|encontr\w*|busca\w*)\b/i)[0],
    80,
  )
}

function extractRegion(text: string): string | null {
  const explicit = text.match(/\b(?:region|geography|market|country|regi[aã]o|regi[oó]n|kraj|region|страна|регион)\s*:\s*([^\n.;]{2,80})/i)
  if (explicit?.[1]) return trimRegion(explicit[1]) || null

  const startIn = text.match(/\b(?:start|begin|launch|iniciar|come[çc]ar|empezar|comenzar|zacznij|rozpocznij|начни|запусти)\s+(?:in|with|em|en|w|od|в|с)\s+([^\n.;]{2,80})/i)
  if (startIn?.[1]) return trimRegion(startIn[1]) || null

  return null
}

function removeOperationalTail(value: string): string {
  return clean(value, 2_000)
    .replace(/\b(?:start|begin|launch|iniciar|come[çc]ar|empezar|comenzar|zacznij|rozpocznij|начни|запусти)\s+(?:in|with|em|en|w|od|в|с)\s+[^\n.;]{2,80}[.;]?/gi, ' ')
    .replace(/\b(?:find|get|build|list|source|research|identify|locate|encontr\w*|busca\w*|lista\w*|pesquis\w*|znajd\w*|wyszuk\w*|найд\w*|исслед\w*)\D{0,28}\d{1,3}\b[.!]?/gi, ' ')
    .replace(/\b(?:do not|don't|never)\s+(?:contact|send|submit|message|email)[^.!?]*[.!?]?/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function extractOffer(beforeTarget: string, fullText: string): string {
  const direct = beforeTarget.match(/\b(?:to\s+)?(?:sell|market|promote|offer)\s+([\s\S]+)$/i)
  if (direct?.[1]) return clean(direct[1], 2_000)

  const withoutPreamble = beforeTarget
    .replace(/^\s*you are my ai chief of staff[^.]*\.\s*/i, '')
    .replace(/^\s*(?:please\s+)?(?:run|start|create|launch|build|prepare|execute)\s+(?:an?\s+)?(?:email\s+)?outreach campaign\s*(?:to\s+)?/i, '')

  return clean(withoutPreamble || fullText, 2_000)
}

export function parseProspectCampaignRequest(
  text: string,
  language = 'en',
): ParsedProspectCampaignRequest | null {
  const input = clean(text, 8_000)

  // THE INTENT GATE COMES FIRST AND IT IS ABSOLUTE. Everything below only refines a brief
  // the classifier has already confirmed is a SALES PROSPECTING brief with sales
  // prospecting not forbidden anywhere in it. A press, advertising or social brief, an
  // ambiguous one, or one asking for a count of publications never reaches this parser's
  // own patterns — which is the point, because those patterns cannot tell the difference.
  if (!campaignIntentAllows(classifyCampaignIntent(input), 'prospect')) return null

  if (!input || CAMPAIGN_NEGATION.test(input)) return null
  if (!CAMPAIGN_INTENT.test(input) && !SECONDARY_INTENT.test(input) && !looksLikeBrief(input)) return null

  const countMatch = input.match(COUNT_PATTERN)
  const rawCount = countMatch ? Number(countMatch[1] || countMatch[2] || 0) : 0
  if (!Number.isFinite(rawCount) || rawCount < 3) return null

  const marker = TARGET_MARKER.exec(input)
  const beforeTarget = marker ? input.slice(0, marker.index) : input
  const afterTarget = marker ? input.slice(marker.index + marker[0].length) : input

  const offer = extractOffer(beforeTarget, input)
  const targetCriteria = removeOperationalTail(afterTarget)
  if (!offer || !targetCriteria) return null

  const region = extractRegion(input)

  return {
    offer,
    targetCriteria,
    region,
    // NO SILENT CAP. This clamped every request to 25, so "find 30 companies" became a
    // 25-company job and nothing said so — the operator watched a campaign work towards a
    // number they had never asked for. The worker applies its own sanity bound and RECORDS
    // it when it applies, which is the difference between a limit and a lie.
    requestedCount: rawCount,
    // Recipient language comes from the brief first, then the target market. The dashboard
    // language is only a fallback. This prevents Polish/Russian/Spanish campaigns from
    // silently becoming English jobs.
    language: extractRequestedLanguage(input, language, region),
  }
}

export function prospectCampaignQueuedReply(params: {
  jobId: string
  requestedCount: number
  region: string | null
  language: string
}): string {
  const location = params.region ? ` in ${params.region}` : ''
  const messages: Record<string, string> = {
    en: `Prospect campaign queued (job ${params.jobId}) for ${params.requestedCount} pending outreach drafts${location}. Discovery and drafting are running in the background. Nothing has been sent and no company has been contacted. Drafts will appear in the Outreach console for your approval.`,
    es: `Campaña de prospección en cola (trabajo ${params.jobId}) para ${params.requestedCount} borradores de difusión pendientes${location}. El descubrimiento y la redacción se ejecutan en segundo plano. No se envió nada ni se contactó a ninguna empresa. Los borradores aparecerán en la consola de Outreach para su aprobación.`,
    pt: `Campanha de prospecção enfileirada (tarefa ${params.jobId}) para ${params.requestedCount} rascunhos de outreach pendentes${location}. A descoberta e a redação estão sendo executadas em segundo plano. Nada foi enviado e nenhuma empresa foi contatada. Os rascunhos aparecerão no console de Outreach para sua aprovação.`,
    pl: `Kampania prospectingowa została dodana do kolejki (zadanie ${params.jobId}) dla ${params.requestedCount} oczekujących wersji wiadomości${location}. Wyszukiwanie i przygotowanie treści działają w tle. Nic nie zostało wysłane i nie skontaktowano się z żadną firmą. Wersje robocze pojawią się w konsoli Outreach do zatwierdzenia.`,
    ru: `Кампания поиска потенциальных клиентов поставлена в очередь (задание ${params.jobId}) для ${params.requestedCount} черновиков${location}. Поиск и подготовка текстов выполняются в фоновом режиме. Ничего не отправлено, и ни с одной компанией не связывались. Черновики появятся в консоли Outreach для вашего одобрения.`,
  }
  return messages[params.language] || messages.en
}

export function prospectCampaignQueueError(error: string, language: string): string {
  const detail = clean(error || 'unknown error', 400)
  const messages: Record<string, string> = {
    en: `I recognized this as a background prospect campaign, but I could not queue the job. Nothing was sent and no company was contacted. Owner diagnostic: ${detail}`,
    es: `Reconocí esto como una campaña de prospección en segundo plano, pero no pude poner el trabajo en cola. No se envió nada ni se contactó a ninguna empresa. Diagnóstico del propietario: ${detail}`,
    pt: `Reconheci isto como uma campanha de prospecção em segundo plano, mas não consegui enfileirar a tarefa. Nada foi enviado e nenhuma empresa foi contatada. Diagnóstico do proprietário: ${detail}`,
    pl: `Rozpoznałem to jako kampanię prospectingową w tle, ale nie udało się dodać zadania do kolejki. Nic nie zostało wysłane i nie skontaktowano się z żadną firmą. Diagnostyka właściciela: ${detail}`,
    ru: `Запрос распознан как фоновая кампания поиска клиентов, но поставить задание в очередь не удалось. Ничего не отправлено, и ни с одной компанией не связывались. Диагностика владельца: ${detail}`,
  }
  return messages[language] || messages.en
}

/**
 * Why a campaign-shaped message did NOT become a campaign.
 *
 * THE SILENT FALL-THROUGH IS THE REAL DEFECT. When parsing fails the concierge returns null
 * and the message is answered as an ordinary question — so a brief that was meant to start
 * thirty outreach drafts produced a thoughtful essay instead, with no job, no id, and nothing
 * saying the campaign had not started. The operator only found out by going to look for
 * drafts that did not exist.
 *
 * Returns null when the message was never campaign-shaped at all (an ordinary question, which
 * SHOULD be answered normally), and a plain sentence naming the missing piece when it was.
 */
export function campaignBriefMiss(text: string): string | null {
  const input = clean(text, 8_000)
  if (!input) return null

  // THE CLASSIFIER ANSWERS BEFORE THIS FUNCTION GUESSES.
  //
  // A refusal is reported verbatim: it already names the real cause, which is the thing
  // the operator needs. And a brief belonging to ANOTHER pipeline returns null so it can
  // be handled by that pipeline — reporting a sales-shaped miss at a press brief is how
  // the operator was previously told to add "Find 30 companies" to a request for thirty
  // publications, and then followed that advice.
  const intent = classifyCampaignIntent(input)
  if (intent.decision === 'refuse') return intent.reason
  if (intent.pipeline && intent.pipeline !== 'prospect') return null

  // Not campaign-shaped: say nothing, answer it as the question it is.
  if (!looksLikeBrief(input) && !CAMPAIGN_INTENT.test(input) && !SECONDARY_INTENT.test(input)) return null

  // Already parses — no miss to report.
  if (parseProspectCampaignRequest(input)) return null

  if (CAMPAIGN_NEGATION.test(input)) {
    return 'This reads as an instruction NOT to run a campaign, so no job was created. Remove the negation if you meant to start one.'
  }

  const countMatch = input.match(COUNT_PATTERN)
  const rawCount = countMatch ? Number(countMatch[1] || countMatch[2] || 0) : 0
  if (!Number.isFinite(rawCount) || rawCount < 3) {
    return 'No campaign was started: I could not find how many companies to find. Add a line like "Find 30 companies" and send it again.'
  }

  const marker = TARGET_MARKER.exec(input)
  const afterTarget = marker ? input.slice(marker.index + marker[0].length) : input
  if (!removeOperationalTail(afterTarget)) {
    return 'No campaign was started: I could not find who to target. Add an AUDIENCE section, or a line starting "Target:", and send it again.'
  }

  const beforeTarget = marker ? input.slice(0, marker.index) : input
  if (!extractOffer(beforeTarget, input)) {
    return 'No campaign was started: I could not find what is being offered. Say what you are promoting above the audience section.'
  }

  return 'No campaign was started: I recognised this as a campaign brief but could not read it. Include what you are promoting, an AUDIENCE section, and a count such as "Find 30 companies".'
}
