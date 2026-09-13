// Public-safe provenance rendering for the Concierge channel.
//
// This module is intentionally pure and deterministic. A provenance question is about what the
// server actually recorded for the preceding turn, so a reasoning model must never reconstruct
// or narrate that history from memory. If the record is unavailable, fail closed instead of
// inventing an origin.

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

function publicToolNames(provenance: any): string[] {
  const values = Array.isArray(provenance?.tools_used) ? provenance.tools_used : []
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
    provenance?.fresh_evidence?.sources,
    provenance?.freshEvidence?.sources,
    provenance?.live_evidence_sources,
    provenance?.answer_origin?.live_evidence_sources,
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
      || provenance?.fresh_evidence?.used
      || provenance?.freshEvidence?.used
      || provenance?.live_evidence?.used
      || provenance?.autonomous_research?.used
      || provenance?.autonomous_research_attempted
      || sources.length,
  )

  return {
    recordAvailable: true,
    fromCache: Boolean(provenance?.answer_origin?.from_cache || provenance?.semantic_cache?.used || provenance?.cache?.used),
    liveEvidenceUsed,
    sources,
    responseSource: cleanText(provenance?.response_source ?? provenance?.responseSource ?? provenance?.answer_origin?.response_source, 180),
    lineageCompleteness: cleanText(provenance?.lineage_completeness, 100),
    localReasoning: {
      invoked: Boolean(provenance?.local_reasoning?.invoked),
      model: cleanText(provenance?.local_reasoning?.model, 140),
    },
    externalAi: {
      invoked: Boolean(provenance?.external_ai?.invoked),
      provider: cleanText(provenance?.external_ai?.provider, 100),
      model: cleanText(provenance?.external_ai?.model, 140),
    },
    deterministicUtility: {
      used: Boolean(provenance?.deterministic_utility?.used),
      utility: cleanText(provenance?.deterministic_utility?.utility, 160),
    },
    toolsUsed: publicToolNames(provenance),
  }
}

function sourceLines(sources: PublicRecordedSource[]): string {
  return sources.map(source => `- ${source.title}: ${source.url}`).join('\n')
}

function quoted(value: string | null): string {
  return value ? `“${value}”` : ''
}

function originLine(facts: PublicRecordedProvenance, lang: string): string {
  const route = facts.responseSource ? quoted(facts.responseSource) : ''
  const utility = facts.deterministicUtility.utility ? quoted(facts.deterministicUtility.utility) : ''

  // Public provenance reports the execution class, never internal provider/model identifiers.
  // The durable internal record still retains those identifiers for authorized diagnostics/audit.
  if (facts.externalAi.invoked) {
    if (lang === 'pt') return `Origem registrada: um provedor externo de IA participou desta resposta${route ? ` pela rota ${route}` : ''}.`
    if (lang === 'es') return `Origen registrado: un proveedor externo de IA participó en esta respuesta${route ? ` por la ruta ${route}` : ''}.`
    if (lang === 'pl') return `Zarejestrowane pochodzenie: zewnętrzny dostawca AI uczestniczył w tej odpowiedzi${route ? ` przez ścieżkę ${route}` : ''}.`
    if (lang === 'ru') return `Зафиксированное происхождение: внешний провайдер ИИ участвовал в формировании ответа${route ? ` через маршрут ${route}` : ''}.`
    return `Recorded origin: an external AI provider contributed to this answer${route ? ` through route ${route}` : ''}.`
  }

  if (facts.localReasoning.invoked) {
    if (lang === 'pt') return `Origem registrada: o raciocinador local gerou ou sintetizou esta resposta${route ? ` pela rota ${route}` : ''}.`
    if (lang === 'es') return `Origen registrado: el razonador local generó o sintetizó esta respuesta${route ? ` por la ruta ${route}` : ''}.`
    if (lang === 'pl') return `Zarejestrowane pochodzenie: lokalny model rozumujący wygenerował lub zsyntetyzował tę odpowiedź${route ? ` przez ścieżkę ${route}` : ''}.`
    if (lang === 'ru') return `Зафиксированное происхождение: локальная модель рассуждения сгенерировала или синтезировала ответ${route ? ` через маршрут ${route}` : ''}.`
    return `Recorded origin: the local reasoner generated or synthesized this answer${route ? ` through route ${route}` : ''}.`
  }

  if (facts.deterministicUtility.used) {
    if (lang === 'pt') return `Origem registrada: lógica determinística do servidor${utility ? ` (${utility})` : ''} produziu esta resposta; nenhum modelo de raciocínio foi registrado como invocado.`
    if (lang === 'es') return `Origen registrado: lógica determinista del servidor${utility ? ` (${utility})` : ''} produjo esta respuesta; no se registró ningún modelo de razonamiento como invocado.`
    if (lang === 'pl') return `Zarejestrowane pochodzenie: deterministyczna logika serwera${utility ? ` (${utility})` : ''} utworzyła tę odpowiedź; nie odnotowano wywołania modelu rozumującego.`
    if (lang === 'ru') return `Зафиксированное происхождение: детерминированная серверная логика${utility ? ` (${utility})` : ''} сформировала ответ; вызов модели рассуждения не зафиксирован.`
    return `Recorded origin: deterministic server logic${utility ? ` (${utility})` : ''} produced this answer; no reasoning model was recorded as invoked.`
  }

  if (lang === 'pt') return `Origem registrada: a resposta foi entregue pela rota do servidor ${route || 'não especificada'}; o registro não identifica um modelo de raciocínio como responsável.`
  if (lang === 'es') return `Origen registrado: la respuesta fue entregada por la ruta del servidor ${route || 'no especificada'}; el registro no identifica un modelo de razonamiento como responsable.`
  if (lang === 'pl') return `Zarejestrowane pochodzenie: odpowiedź dostarczono przez ścieżkę serwera ${route || 'nieokreśloną'}; zapis nie wskazuje modelu rozumującego jako źródła.`
  if (lang === 'ru') return `Зафиксированное происхождение: ответ был доставлен серверным маршрутом ${route || 'не указан'}; запись не указывает модель рассуждения как источник.`
  return `Recorded origin: the answer was delivered by server route ${route || 'unspecified'}; the record does not identify a reasoning model as its source.`
}

function toolLine(facts: PublicRecordedProvenance, lang: string): string {
  if (!facts.toolsUsed.length) return ''
  const names = facts.toolsUsed.join(', ')
  if (lang === 'pt') return `Ferramentas registradas: ${names}.`
  if (lang === 'es') return `Herramientas registradas: ${names}.`
  if (lang === 'pl') return `Zarejestrowane narzędzia: ${names}.`
  if (lang === 'ru') return `Зафиксированные инструменты: ${names}.`
  return `Recorded tools: ${names}.`
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

  const origin = originLine(facts, lang)
  const tools = toolLine(facts, lang)

  if (facts.sources.length) {
    const lines = sourceLines(facts.sources)
    if (lang === 'es') return `${origin}${tools ? `\n${tools}` : ''}\n\n${facts.fromCache ? 'El registro indica que esa respuesta fue reutilizada de una respuesta anterior y conserva evidencia pública registrada.' : 'El registro de esa respuesta muestra que se utilizó evidencia pública consultada en vivo.'}\n\nFuentes registradas:\n${lines}\n\nEsta lista proviene del registro real de la respuesta; no fue reconstruida de memoria.`
    if (lang === 'pt') return `${origin}${tools ? `\n${tools}` : ''}\n\n${facts.fromCache ? 'O registro indica que essa resposta foi reutilizada de uma resposta anterior e preserva evidência pública registrada.' : 'O registro dessa resposta mostra que foram usadas evidências públicas consultadas ao vivo.'}\n\nFontes registradas:\n${lines}\n\nEsta lista vem do registro real da resposta; não foi reconstruída de memória.`
    if (lang === 'pl') return `${origin}${tools ? `\n${tools}` : ''}\n\n${facts.fromCache ? 'Zapis wskazuje, że ta odpowiedź została ponownie użyta z wcześniejszej odpowiedzi i zachowuje zarejestrowane publiczne dowody.' : 'Zapis tej odpowiedzi pokazuje, że użyto publicznych źródeł sprawdzonych na żywo.'}\n\nZarejestrowane źródła:\n${lines}\n\nTa lista pochodzi z rzeczywistego zapisu odpowiedzi; nie została odtworzona z pamięci.`
    if (lang === 'ru') return `${origin}${tools ? `\n${tools}` : ''}\n\n${facts.fromCache ? 'Запись показывает, что этот ответ был повторно использован из более раннего ответа и сохраняет зарегистрированные публичные источники.' : 'Запись этого ответа показывает, что использовались публичные источники, проверенные в реальном времени.'}\n\nЗарегистрированные источники:\n${lines}\n\nЭтот список взят из фактической записи ответа, а не восстановлен по памяти.`
    return `${origin}${tools ? `\n${tools}` : ''}\n\n${facts.fromCache ? 'The record shows that this answer was reused from an earlier response and retains recorded public evidence.' : 'The recorded turn shows that live public evidence was used for this answer.'}\n\nRecorded sources:\n${lines}\n\nThis source list comes from the actual turn record; it was not reconstructed from model memory.`
  }

  if (facts.liveEvidenceUsed) {
    if (lang === 'es') return `${origin}${tools ? `\n${tools}` : ''}\n\nEl registro muestra que se utilizó evidencia pública en vivo, pero no contiene URL de fuentes que pueda citar. No voy a inventarlas.`
    if (lang === 'pt') return `${origin}${tools ? `\n${tools}` : ''}\n\nO registro mostra que foi usada evidência pública ao vivo, mas não contém URLs de fontes que eu possa citar. Não vou inventá-las.`
    if (lang === 'pl') return `${origin}${tools ? `\n${tools}` : ''}\n\nZapis pokazuje, że użyto publicznych dowodów na żywo, ale nie zawiera adresów URL źródeł, które mógłbym podać. Nie będę ich wymyślać.`
    if (lang === 'ru') return `${origin}${tools ? `\n${tools}` : ''}\n\nЗапись показывает, что использовались актуальные публичные источники, но в ней нет URL, которые я мог бы привести. Я не буду их выдумывать.`
    return `${origin}${tools ? `\n${tools}` : ''}\n\nThe recorded turn shows that live public evidence was used, but it does not contain source URLs I can cite. I won't invent them.`
  }

  if (facts.fromCache) {
    if (lang === 'es') return `${origin}${tools ? `\n${tools}` : ''}\n\nEl registro muestra que la respuesta fue reutilizada de una respuesta anterior y no registra nuevas fuentes públicas externas para este turno.`
    if (lang === 'pt') return `${origin}${tools ? `\n${tools}` : ''}\n\nO registro mostra que a resposta foi reutilizada de uma resposta anterior e não registra novas fontes públicas externas para este turno.`
    if (lang === 'pl') return `${origin}${tools ? `\n${tools}` : ''}\n\nZapis pokazuje, że odpowiedź została ponownie użyta z wcześniejszej odpowiedzi i dla tego przebiegu nie zarejestrowano nowych zewnętrznych źródeł publicznych.`
    if (lang === 'ru') return `${origin}${tools ? `\n${tools}` : ''}\n\nЗапись показывает, что ответ был повторно использован из более раннего ответа; для этого хода новые внешние публичные источники не зафиксированы.`
    return `${origin}${tools ? `\n${tools}` : ''}\n\nThe recorded turn shows that the answer was reused from an earlier response; no new external public sources were recorded for this turn.`
  }

  if (lang === 'es') return `${origin}${tools ? `\n${tools}` : ''}\n\nNo se registraron fuentes externas en vivo para esta respuesta.`
  if (lang === 'pt') return `${origin}${tools ? `\n${tools}` : ''}\n\nNão foram registradas fontes externas ao vivo para esta resposta.`
  if (lang === 'pl') return `${origin}${tools ? `\n${tools}` : ''}\n\nDla tej odpowiedzi nie zarejestrowano zewnętrznych źródeł na żywo.`
  if (lang === 'ru') return `${origin}${tools ? `\n${tools}` : ''}\n\nДля этого ответа внешние источники в реальном времени не зафиксированы.`
  return `${origin}${tools ? `\n${tools}` : ''}\n\nNo live external sources were recorded for this answer.`
}
