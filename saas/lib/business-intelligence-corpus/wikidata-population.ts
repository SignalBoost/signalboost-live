export const WIKIDATA_POPULATION_BATCH_SIZE = 100
export const WIKIDATA_POPULATION_OFFSET_LIMIT = 100_000

export function normalizeWikidataPopulationOffset(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.min(WIKIDATA_POPULATION_OFFSET_LIMIT - 1, Math.floor(parsed))
}

export function nextWikidataPopulationOffset(currentOffset: unknown, requested: unknown): number {
  const current = normalizeWikidataPopulationOffset(currentOffset)
  const step = Math.max(1, Math.min(250, Math.floor(Number(requested) || WIKIDATA_POPULATION_BATCH_SIZE)))
  const next = current + step
  return next >= WIKIDATA_POPULATION_OFFSET_LIMIT ? 0 : next
}
