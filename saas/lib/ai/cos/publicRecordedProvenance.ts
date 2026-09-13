// Public-safe provenance rendering for the Concierge channel.
//
// A provenance question is about what the server actually recorded for the preceding turn.
// The full record may contain private implementation identifiers (model/provider names, routes,
// utilities and tool ids). Keep those fields available to internal audit code, but never echo them
// through the public renderer. Public provenance reports only high-level origin categories plus
// recorded public source URLs. If the record is unavailable, fail closed instead of inventing it.

export type PublicRecordedSource = { title: string; url: string }

export type PublicRecordedProvenance = {
  recordAvailable: boolean
  fromCache: boolean
  liveEvidenceUsed: boolean
  sources: PublicRecordedSource[]
  responseSource: string | null
  lineageCompleteness: string | null
  localReasoning: { invoked: boolean; model: string | null }
  externalAi: { invoked: boolean; provider: string | null; model: string | null }
  deterministicUtility: { used: boolean; utility: string | null }
  toolsUsed: string[]
}

const MAX_PUBLIC_SOURCES = 12

function validHttpUrl(value: unknown): string | null {
  const url = String(value ?? '').trim()
  return /^https?:\/\/\S+$/i.test(url) ? url : null
}

function cleanTitle(value: unknown, fallback: string): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return fallback
  return text.length > 160 ? `${text.slice(0, 159)}…` : text
}

function cleanText(value: unknown, max = 160): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, max) : null
}

function recordedToolNames(provenance: any): string[] {
  const values = Array.isArray(provenance?.tools_used)
    ? provenance.tools_used
    : Array.isArray(provenance?.toolsUsed) ? provenance.toolsUsed : []
  const names = new Set<string>()
  for (const item of values) {
    const name = cleanText(typeof item === 'string' ? item : item?.name ?? item?.tool ?? item?.function?.name, 120)
    if (name) names.add(name)
    if (names.size >= 16) break
  }
  return [...names]
}

export function extractPublicRecordedProvenance(provenance: any): PublicRecordedProvenance {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    return {
      recordAvailable: false,
      fromCache: false,
      liveEvidenceUsed: false,
      sources: [],
      responseSource: null,
      lineageCompleteness: null,
      localReasoning: { invoked: false, model: null },
      externalAi: { invoked: false, provider: null, model: null },
      deterministicUtility: { used: false, utility: null },
      toolsUsed: [],
    }
  }

  const rawSources: any[] = []
  for (const candidate of [
    provenance?.live_external_evidence?.sources,
    provenance?.liveExternalEvidence?.sources,
    provenance?.fresh_evidence?.sources,
    provenance?.freshEvidence?.sources,
    provenance?.live_evidence_sources,
    provenance?.liveEvidenceSources,
    provenance?.answer_origin?.live_evidence_sources,
    provenance?.answerOrigin?.liveEvidenceSources,
    provenance?.live_evidence?.sources,
  ]) {
    if (Array.isArray(candidate)) rawSources.push(...candidate)
  }

  const seen = new Set<string>()
  const sources: PublicRecordedSource[] = []
  for (const source of rawSources) {
    const url = validHttpUrl(source?.url)
    if (!url || seen.has(url)) continue
    seen.add(url)
    sources.push({ title: cleanTitle(source?.title, url), url })
    if (sources.length >= MAX_PUBLIC_SOURCES) break
  }

  const liveEvidenceUsed = Boolean(
    provenance?.live_external_evidence?.used
      || provenance?.liveExternalEvidence?.used
      || provenance?.fresh_evidence?.used
      || provenance?.freshEvidence?.used
      || provenance?.live_evidence?.used
      || provenance?.autonomous_research?.used
      || provenance?.autonomous_research_attempted
      || provenance?.autonomousResearchAttempted
      || sources.length,
  )

  const localInvoked = Boolean(provenance?.local_reasoning?.invoked || provenance?.localModelInvoked)
  const externalInvoked = Boolean(provenance?.external_ai?.invoked || provenance?.externalAiInvoked)

  return {
    recordAvailable: true,
    fromCache: Boolean(
      provenance?.answer_origin?.from_cache
        || provenance?.answerOrigin?.fromCache
        || provenance?.semantic_cache?.used
        || provenance?.cache?.used,
    ),
    liveEvidenceUsed,
    sources,
    responseSource: cleanText(provenance?.response_source ?? provenance?.responseSource ?? provenance?.answer_origin?.response_source, 180),
    lineageCompleteness: cleanText(provenance?.lineage_completeness ?? provenance?.lineageCompleteness, 100),
    localReasoning: {
      invoked: localInvoked,
      model: cleanText(provenance?.local_reasoning?.model ?? provenance?.reasonerLabel, 140),
    },
    externalAi: {
      invoked: externalInvoked,
      provider: cleanText(provenance?.external_ai?.provider ?? provenance?.externalAiProvider, 100),
      model: cleanText(provenance?.external_ai?.model ?? provenance?.externalAiModel, 140),
    },
    deterministicUtility: {
      used: Boolean(provenance?.deterministic_utility?.used || provenance?.deterministicFreshFactUsed),
      utility: cleanText(provenance?.deterministic_utility?.utility, 160),
    },
    toolsUsed: recordedToolNames(provenance),
  }
}

function sourceLines(sources: PublicRecordedSource[]): string {
  return sources.map(source => `- ${source.title}: ${source.url}`).join('\n')
}

// Public disclosure deliberately omits the recorded model/provider, route, utility and tool names.
// Those identifiers remain in the internal record for owner/admin audit and troubleshooting.
function publicOriginLine(facts: PublicRecordedProvenance, lang: string): string {
  if (facts.externalAi.invoked) {
    if (lang === 'pt') return 'Origem registrada: um provedor externo de IA participou desta resposta.'
    if (lang === 'es') return 'Origen registrado: un proveedor externo de IA participó en esta respuesta.'
    if (lang === 'pl') return 'Zarejestrowane pochodzenie: zewnętrzny dostawca AI uczestniczył w tej odpowiedzi.'
    if (lang === 'ru') return 'Зафиксированное происхождение: внешний провайдер ИИ участвовал в формировании ответа.'
    return 'Recorded origin: an external AI provider contributed to this answer.'
  }

  if (facts.localReasoning.invoked) {
    if (lang === 'pt') return 'Origem registrada: o raciocinador local gerou ou sintetizou esta resposta.'
    if (lang === 'es') return 'Origen registrado: el razonador local generó o sintetizó esta respuesta.'
    if (lang === 'pl') return 'Zarejestrowane pochodzenie: lokalny model rozumujący wygenerował lub zsyntetyzował tę odpowiedź.'
    if (lang === 'ru') return 'Зафиксированное происхождение: локальная модель рассуждения сгенерировала или синтезировала ответ.'
    return 'Recorded origin: the local reasoner generated or synthesized this answer.'
  }

  if (facts.deterministicUtility.used) {
    if (lang === 'pt') return 'Origem registrada: lógica determinística do servidor produziu esta resposta; nenhum modelo de raciocínio foi registrado como invocado.'
    if (lang === 'es') return 'Origen registrado: lógica determinista del servidor produjo esta respuesta; no se registró ningún modelo de razonamiento como invocado.'
    if (lang === 'pl') return 'Zarejestrowane pochodzenie: deterministyczna logika serwera utworzyła tę odpowiedź; nie odnotowano wywołania modelu rozumującego.'
    if (lang === 'ru') return 'Зафиксированное происхождение: детерминированная серверная логика сформировала ответ; вызов модели рассуждения не зафиксирован.'
    return 'Recorded origin: deterministic server logic produced this answer; no reasoning model was recorded as invoked.'
  }

  if (lang === 'pt') return 'Origem registrada: a resposta foi entregue pelo servidor; o registro público não identifica um modelo de raciocínio como responsável.'
  if (lang === 'es') return 'Origen registrado: la respuesta fue entregada por el servidor; el registro público no identifica un modelo de razonamiento como responsable.'
  if (lang === 'pl') return 'Zarejestrowane pochodzenie: odpowiedź dostarczył serwer; publiczny zapis nie wskazuje modelu rozumującego jako źródła.'
  if (lang === 'ru') return 'Зафиксированное происхождение: ответ был доставлен сервером; публичная запись не указывает модель рассуждения как источник.'
  return 'Recorded origin: the answer was delivered by the server; the public record does not identify a reasoning model as its source.'
}

function noLiveVerificationLine(facts: PublicRecordedProvenance, lang: string): string {
  if (facts.localReasoning.invoked) {
    if (lang === 'pt') return 'Nenhuma pesquisa web ao vivo nem URL de fonte externa foi registrada para essa resposta. Portanto, qualquer afirmação factual atual ou mutável nela não foi verificada ao vivo e não deve ser tratada como sustentada por fontes web.'
    if (lang === 'es') return 'No se registró ninguna búsqueda web en vivo ni URL de fuente externa para esa respuesta. Por lo tanto, cualquier afirmación factual actual o cambiante no fue verificada en vivo y no debe tratarse como respaldada por fuentes web.'
    if (lang === 'pl') return 'Dla tej odpowiedzi nie zarejestrowano wyszukiwania na żywo ani adresów URL zewnętrznych źródeł. Dlatego wszelkie aktualne lub zmienne twierdzenia faktyczne nie zostały zweryfikowane na żywo i nie powinny być traktowane jako poparte źródłami internetowymi.'
    if (lang === 'ru') return 'Для этого ответа не зафиксированы веб-поиск в реальном времени или URL внешних источников. Поэтому любые актуальные или изменяемые фактические утверждения не были проверены в реальном времени и не должны считаться подтверждёнными веб-источниками.'
    return 'No live web search or external source URL was recorded for this answer. Therefore, any current or changeable factual claims in it were not live-verified and should not be treated as supported by web sources.'
  }

  if (lang === 'pt') return 'Não foram registradas fontes externas ao vivo para esta resposta.'
  if (lang === 'es') return 'No se registraron fuentes externas en vivo para esta respuesta.'
  if (lang === 'pl') return 'Dla tej odpowiedzi nie zarejestrowano zewnętrznych źródeł na żywo.'
  if (lang === 'ru') return 'Для этого ответа внешние источники в реальном времени не зафиксированы.'
  return 'No live external sources were recorded for this answer.'
}

export function renderPublicRecordedProvenance(provenance: any, language = 'en'): string {
  const facts = extractPublicRecordedProvenance(provenance)
  const lang = ['en', 'es', 'pt', 'pl', 'ru'].includes(language) ? language : 'en'

  if (!facts.recordAvailable) {
    if (lang === 'es') return 'No tengo un registro verificable de procedencia para esa respuesta, así que no voy a reconstruirlo ni adivinarlo.'
    if (lang === 'pt') return 'Não tenho um registro verificável de proveniência para essa resposta, então não vou reconstruí-lo nem adivinhá-lo.'
    if (lang === 'pl') return 'Nie mam zweryfikowanego zapisu pochodzenia tej odpowiedzi, więc nie będę go odtwarzać ani zgadywać.'
    if (lang === 'ru') return 'У меня нет проверяемой записи происхождения этого ответа, поэтому я не буду восстанавливать или угадывать её.'
    return "I don't have a verifiable provenance record for that answer, so I won't reconstruct or guess where it came from."
  }

  const origin = publicOriginLine(facts, lang)

  if (facts.sources.length) {
    const lines = sourceLines(facts.sources)
    if (lang === 'es') return `${origin}\n\n${facts.fromCache ? 'El registro indica que esa respuesta fue reutilizada de una respuesta anterior y conserva evidencia pública registrada.' : 'El registro de esa respuesta muestra que se utilizó evidencia pública consultada en vivo.'}\n\nFuentes registradas:\n${lines}\n\nEsta lista proviene del registro real de la respuesta; no fue reconstruida de memoria.`
    if (lang === 'pt') return `${origin}\n\n${facts.fromCache ? 'O registro indica que essa resposta foi reutilizada de uma resposta anterior e preserva evidência pública registrada.' : 'O registro dessa resposta mostra que foram usadas evidências públicas consultadas ao vivo.'}\n\nFontes registradas:\n${lines}\n\nEsta lista vem do registro real da resposta; não foi reconstruída de memória.`
    if (lang === 'pl') return `${origin}\n\n${facts.fromCache ? 'Zapis wskazuje, że ta odpowiedź została ponownie użyta z wcześniejszej odpowiedzi i zachowuje zarejestrowane publiczne dowody.' : 'Zapis tej odpowiedzi pokazuje, że użyto publicznych źródeł sprawdzonych na żywo.'}\n\nZarejestrowane źródła:\n${lines}\n\nTa lista pochodzi z rzeczywistego zapisu odpowiedzi; nie została odtworzona z pamięci.`
    if (lang === 'ru') return `${origin}\n\n${facts.fromCache ? 'Запись показывает, что этот ответ был повторно использован из более раннего ответа и сохраняет зарегистрированные публичные источники.' : 'Запись этого ответа показывает, что использовались публичные источники, проверенные в реальном времени.'}\n\nЗарегистрированные источники:\n${lines}\n\nЭтот список взят из фактической записи ответа, а не восстановлен по памяти.`
    return `${origin}\n\n${facts.fromCache ? 'The record shows that this answer was reused from an earlier response and retains recorded public evidence.' : 'The recorded turn shows that live public evidence was used for this answer.'}\n\nRecorded sources:\n${lines}\n\nThis source list comes from the actual turn record; it was not reconstructed from model memory.`
  }

  if (facts.liveEvidenceUsed) {
    if (lang === 'es') return `${origin}\n\nEl registro muestra que se utilizó evidencia pública en vivo, pero no contiene URL de fuentes que pueda citar. No voy a inventarlas.`
    if (lang === 'pt') return `${origin}\n\nO registro mostra que foi usada evidência pública ao vivo, mas não contém URLs de fontes que eu possa citar. Não vou inventá-las.`
    if (lang === 'pl') return `${origin}\n\nZapis pokazuje, że użyto publicznych dowodów na żywo, ale nie zawiera adresów URL źródeł, które mógłbym podać. Nie będę ich wymyślać.`
    if (lang === 'ru') return `${origin}\n\nЗапись показывает, что использовались актуальные публичные источники, но в ней нет URL, которые я мог бы привести. Я не буду их выдумывать.`
    return `${origin}\n\nThe recorded turn shows that live public evidence was used, but it does not contain source URLs I can cite. I won't invent them.`
  }

  if (facts.fromCache) {
    if (lang === 'es') return `${origin}\n\nEl registro muestra que la respuesta fue reutilizada de una respuesta anterior y no registra nuevas fuentes públicas externas para este turno.`
    if (lang === 'pt') return `${origin}\n\nO registro mostra que a resposta foi reutilizada de uma resposta anterior e não registra novas fontes públicas externas para este turno.`
    if (lang === 'pl') return `${origin}\n\nZapis pokazuje, że odpowiedź została ponownie użyta z wcześniejszej odpowiedzi i dla tego przebiegu nie zarejestrowano nowych zewnętrznych źródeł publicznych.`
    if (lang === 'ru') return `${origin}\n\nЗапись показывает, что ответ был повторно использован из более раннего ответа; для этого хода новые внешние публичные источники не зафиксированы.`
    return `${origin}\n\nThe recorded turn shows that the answer was reused from an earlier response; no new external public sources were recorded for this turn.`
  }

  return `${origin}\n\n${noLiveVerificationLine(facts, lang)}`
}
