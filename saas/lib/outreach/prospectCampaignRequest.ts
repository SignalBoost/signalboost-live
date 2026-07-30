// Deterministic recognition for owner requests that should become a durable
// background prospect-campaign job instead of one long chat/model request.

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

// This blocks only an explicit instruction not to create/draft the campaign.
// Safety language such as "do not contact anyone" does not block the job because
// the worker only creates pending drafts and never sends them.
const CAMPAIGN_NEGATION = /\b(?:do not|don't|never|no)\s+(?:run|start|create|launch|build|prepare|generate|draft|execute)\b[\s\S]{0,80}\b(?:campaign|outreach|email)/i

const TARGET_MARKER = /\b(?:target|targets|target audience|ideal customers?|ideal buyers?|prospects?|p[uú]blico[- ]alvo|alvo|audiencia|clientes ideales|grupa docelowa|odbiorcy|целевая аудитория|клиенты)\s*:\s*/i

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

function extractRegion(text: string): string | null {
  const explicit = text.match(/\b(?:region|geography|market|country|regi[aã]o|regi[oó]n|kraj|region|страна|регион)\s*:\s*([^\n.;]{2,80})/i)
  if (explicit?.[1]) return clean(explicit[1], 80)

  const startIn = text.match(/\b(?:start|begin|launch|iniciar|come[çc]ar|empezar|comenzar|zacznij|rozpocznij|начни|запусти)\s+(?:in|with|em|en|w|od|в|с)\s+([^\n.;]{2,80})/i)
  if (startIn?.[1]) return clean(startIn[1], 80)

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
  if (!input || CAMPAIGN_NEGATION.test(input)) return null
  if (!CAMPAIGN_INTENT.test(input) && !SECONDARY_INTENT.test(input)) return null

  const countMatch = input.match(COUNT_PATTERN)
  const rawCount = countMatch ? Number(countMatch[1] || countMatch[2] || 0) : 0
  if (!Number.isFinite(rawCount) || rawCount < 3) return null

  const marker = TARGET_MARKER.exec(input)
  const beforeTarget = marker ? input.slice(0, marker.index) : input
  const afterTarget = marker ? input.slice(marker.index + marker[0].length) : input

  const offer = extractOffer(beforeTarget, input)
  const targetCriteria = removeOperationalTail(afterTarget)
  if (!offer || !targetCriteria) return null

  return {
    offer,
    targetCriteria,
    region: extractRegion(input),
    requestedCount: Math.min(rawCount, 25),
    language: normalizeLanguage(language),
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
