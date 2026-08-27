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

export function extractPublicRecordedProvenance(provenance: any): PublicRecordedProvenance {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    return { recordAvailable: false, fromCache: false, liveEvidenceUsed: false, sources: [] }
  }

  const rawSources: any[] = []
  for (const candidate of [
    provenance?.live_external_evidence?.sources,
    provenance?.fresh_evidence?.sources,
    provenance?.freshEvidence?.sources,
    provenance?.live_evidence_sources,
    provenance?.answer_origin?.live_evidence_sources,
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
      || provenance?.autonomous_research?.used
      || provenance?.autonomous_research_attempted
      || sources.length,
  )

  return {
    recordAvailable: true,
    fromCache: Boolean(provenance?.answer_origin?.from_cache),
    liveEvidenceUsed,
    sources,
  }
}

function sourceLines(sources: PublicRecordedSource[]): string {
  return sources.map(source => `- ${source.title}: ${source.url}`).join('\n')
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

  if (facts.sources.length) {
    const lines = sourceLines(facts.sources)
    if (lang === 'es') return `${facts.fromCache ? 'El registro indica que esa respuesta fue reutilizada de una respuesta anterior y conserva evidencia pública registrada.' : 'El registro de esa respuesta muestra que se utilizó evidencia pública consultada en vivo.'}\n\nFuentes registradas:\n${lines}\n\nEsta lista proviene del registro real de la respuesta; no fue reconstruida de memoria.`
    if (lang === 'pt') return `${facts.fromCache ? 'O registro indica que essa resposta foi reutilizada de uma resposta anterior e preserva evidência pública registrada.' : 'O registro dessa resposta mostra que foram usadas evidências públicas consultadas ao vivo.'}\n\nFontes registradas:\n${lines}\n\nEsta lista vem do registro real da resposta; não foi reconstruída de memória.`
    if (lang === 'pl') return `${facts.fromCache ? 'Zapis wskazuje, że ta odpowiedź została ponownie użyta z wcześniejszej odpowiedzi i zachowuje zarejestrowane publiczne dowody.' : 'Zapis tej odpowiedzi pokazuje, że użyto publicznych źródeł sprawdzonych na żywo.'}\n\nZarejestrowane źródła:\n${lines}\n\nTa lista pochodzi z rzeczywistego zapisu odpowiedzi; nie została odtworzona z pamięci.`
    if (lang === 'ru') return `${facts.fromCache ? 'Запись показывает, что этот ответ был повторно использован из более раннего ответа и сохраняет зарегистрированные публичные источники.' : 'Запись этого ответа показывает, что использовались публичные источники, проверенные в реальном времени.'}\n\nЗарегистрированные источники:\n${lines}\n\nЭтот список взят из фактической записи ответа, а не восстановлен по памяти.`
    return `${facts.fromCache ? 'The record shows that this answer was reused from an earlier response and retains recorded public evidence.' : 'The recorded turn shows that live public evidence was used for this answer.'}\n\nRecorded sources:\n${lines}\n\nThis source list comes from the actual turn record; it was not reconstructed from model memory.`
  }

  if (facts.liveEvidenceUsed) {
    if (lang === 'es') return 'El registro muestra que se utilizó evidencia pública en vivo, pero no contiene URL de fuentes que pueda citar. No voy a inventarlas.'
    if (lang === 'pt') return 'O registro mostra que foi usada evidência pública ao vivo, mas não contém URLs de fontes que eu possa citar. Não vou inventá-las.'
    if (lang === 'pl') return 'Zapis pokazuje, że użyto publicznych dowodów na żywo, ale nie zawiera adresów URL źródeł, które mógłbym podać. Nie będę ich wymyślać.'
    if (lang === 'ru') return 'Запись показывает, что использовались актуальные публичные источники, но в ней нет URL, которые я мог бы привести. Я не буду их выдумывать.'
    return "The recorded turn shows that live public evidence was used, but it does not contain source URLs I can cite. I won't invent them."
  }

  if (facts.fromCache) {
    if (lang === 'es') return 'El registro muestra que la respuesta fue reutilizada de una respuesta anterior, pero no registra fuentes públicas externas para este turno. No voy a atribuirle otras fuentes.'
    if (lang === 'pt') return 'O registro mostra que a resposta foi reutilizada de uma resposta anterior, mas não registra fontes públicas externas para este turno. Não vou atribuir outras fontes a ela.'
    if (lang === 'pl') return 'Zapis pokazuje, że odpowiedź została ponownie użyta z wcześniejszej odpowiedzi, ale dla tego przebiegu nie zapisano zewnętrznych źródeł publicznych. Nie będę przypisywać jej innych źródeł.'
    if (lang === 'ru') return 'Запись показывает, что ответ был повторно использован из более раннего ответа, но для этого хода внешние публичные источники не зафиксированы. Я не буду приписывать ему другие источники.'
    return "The recorded turn shows that the answer was reused from an earlier response, but it records no external public sources for this turn. I won't attribute other sources to it."
  }

  if (lang === 'es') return 'El registro de esa respuesta no muestra fuentes externas en vivo. No voy a afirmar que provino de entrenamiento, memoria u otra fuente a menos que el registro lo demuestre.'
  if (lang === 'pt') return 'O registro dessa resposta não mostra fontes externas ao vivo. Não vou afirmar que ela veio de treinamento, memória ou outra fonte a menos que o registro demonstre isso.'
  if (lang === 'pl') return 'Zapis tej odpowiedzi nie pokazuje zewnętrznych źródeł na żywo. Nie będę twierdzić, że pochodziła z treningu, pamięci ani innego źródła, jeśli zapis tego nie potwierdza.'
  if (lang === 'ru') return 'Запись этого ответа не показывает внешних источников в реальном времени. Я не буду утверждать, что он получен из обучения, памяти или другого источника, если запись этого не подтверждает.'
  return "The recorded turn shows no live external sources for that answer. I won't claim it came from training, memory, or any other source unless the record says so."
}
