// saas/lib/ai/cos/namedCatalogResearch.ts
// Pure helpers for evidence-grounded real-world catalog/list research.
//
// A catalog request such as "50 times da várzea de São Paulo" is not a current-score lookup,
// but it is still an external-fact request: COS must discover public pages and may release only
// names that are materially present in those pages. This module deliberately contains no network
// or model calls so the anti-invention boundary can be tested deterministically.

export type CatalogEvidenceSource = {
  id: string
  title: string
  url: string
  snippet: string
}

export type CatalogCandidate = {
  name: string
  sourceIds: string[]
}

export type ValidatedCatalogItem = {
  name: string
  sourceIds: string[]
}

function collapse(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function fold(value: unknown): string {
  return collapse(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function requestedCatalogCount(prompt: unknown, fallback = 25): number {
  const text = collapse(prompt)
  const explicit = text.match(/(?:\blista\b|\blist\b|\bgive\s+me\b|\bme\s+d[eê]\b)?[^\d]{0,24}\b(\d{1,3})\b/i)
  const parsed = explicit ? Number(explicit[1]) : fallback
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(100, Math.trunc(parsed)))
}

export function namedCatalogSearchQueries(prompt: unknown): string[] {
  const base = collapse(prompt).slice(0, 260)
  if (!base) return []
  const variants = [
    base,
    `${base} nomes lista história bairro tradicional`,
    `${base} clubes equipes associações páginas públicas`,
  ]
  const seen = new Set<string>()
  return variants
    .map(value => collapse(value).slice(0, 360))
    .filter(value => {
      const key = fold(value)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function sourceSupportsName(source: CatalogEvidenceSource, name: string): boolean {
  const needle = fold(name)
  if (needle.length < 3) return false
  const haystack = fold(`${source.title} ${source.snippet}`)
  return haystack.includes(needle)
}

export function validateCatalogCandidates(
  candidates: CatalogCandidate[],
  sources: CatalogEvidenceSource[],
  limit: number,
): ValidatedCatalogItem[] {
  const sourceById = new Map(sources.map(source => [source.id, source]))
  const seen = new Set<string>()
  const accepted: ValidatedCatalogItem[] = []

  for (const raw of Array.isArray(candidates) ? candidates : []) {
    const name = collapse(raw?.name).replace(/^[\d.)\-\s]+/, '').trim()
    const key = fold(name)
    if (!key || key.length < 3 || seen.has(key)) continue

    const sourceIds = [...new Set((Array.isArray(raw?.sourceIds) ? raw.sourceIds : [])
      .map(value => collapse(value))
      .filter(Boolean))]
      .filter(sourceId => {
        const source = sourceById.get(sourceId)
        return Boolean(source && sourceSupportsName(source, name))
      })

    if (!sourceIds.length) continue
    seen.add(key)
    accepted.push({ name, sourceIds })
    if (accepted.length >= Math.max(1, Math.min(100, limit))) break
  }

  return accepted
}

function languageCode(language?: string | null): string {
  return collapse(language || 'en').slice(0, 2).toLowerCase()
}

export function formatCatalogReferenceReply(args: {
  items: ValidatedCatalogItem[]
  requested: number
  language?: string | null
}): string {
  const count = args.items.length
  const requested = Math.max(1, args.requested)
  const code = languageCode(args.language)
  const complete = count >= requested

  const intro = code === 'pt'
    ? (complete
      ? `Lista de referência/estudo com ${count} nomes sustentados por páginas públicas. Não é uma relação oficial de inscritos para este fim de semana.`
      : `Consegui sustentar ${count} dos ${requested} nomes pedidos em páginas públicas. Não completei a lista inventando nomes. Isto é uma lista de referência/estudo, não uma relação oficial de inscritos para este fim de semana.`)
    : code === 'es'
      ? (complete
        ? `Lista de referencia/estudio con ${count} nombres respaldados por páginas públicas. No es una lista oficial de inscritos para este fin de semana.`
        : `Pude respaldar ${count} de los ${requested} nombres solicitados en páginas públicas. No completé la lista inventando nombres. Es una lista de referencia/estudio, no una lista oficial de inscritos para este fin de semana.`)
      : code === 'pl'
        ? (complete
          ? `Lista referencyjna do nauki: ${count} nazw potwierdzonych na publicznych stronach. To nie jest oficjalna lista zgłoszeń na ten weekend.`
          : `Na publicznych stronach udało się potwierdzić ${count} z ${requested} żądanych nazw. Nie uzupełniałem listy wymyślonymi nazwami. To lista referencyjna do nauki, a nie oficjalna lista zgłoszeń na ten weekend.`)
        : code === 'ru'
          ? (complete
            ? `Справочный список: ${count} названий подтверждены публичными страницами. Это не официальный список участников на эти выходные.`
            : `По публичным страницам удалось подтвердить ${count} из ${requested} запрошенных названий. Я не дополнял список вымышленными названиями. Это справочный список, а не официальный список участников на эти выходные.`)
          : (complete
            ? `Reference/study list with ${count} names supported by public pages. This is not an official entrant list for this weekend.`
            : `I could support ${count} of the ${requested} requested names from public pages. I did not pad the list with invented names. This is a reference/study list, not an official entrant list for this weekend.`)

  const lines = args.items.map((item, index) => `${index + 1}. ${item.name}`)
  return [intro, '', ...lines].join('\n').trim()
}
