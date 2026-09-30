// PICK THE POOL ITEMS THAT ANSWER THE QUESTION, NOT THE ONES THAT MERELY SHARE ITS TOPIC (2026-09-30).

export const COVERAGE_WEIGHT = 1.0

function stem(term: string): string {
  const lower = term.toLowerCase()
  return lower.length > 6 ? lower.slice(0, 6) : lower.replace(/(?:es|s)$/u, '')
}
function textStems(text: string): Set<string> {
  const stems = new Set<string>()
  for (const token of String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (token.length >= 3) stems.add(stem(token))
  return stems
}
export function coverageScores(terms: readonly string[], rowTexts: readonly string[]): number[] {
  const termStems = [...new Set(terms.map(stem).filter(value => value.length >= 3))]
  const rowStemSets = rowTexts.map(textStems)
  const discriminating = termStems.filter(term => rowStemSets.length < 2 || !rowStemSets.every(stems => stems.has(term)))
  if (!discriminating.length) return rowTexts.map(() => 0)
  return rowStemSets.map(stems => discriminating.filter(term => stems.has(term)).length / discriminating.length)
}
export function rerankLearnedRowsForQuestion<T>(terms: readonly string[], rows: readonly T[], textOf: (row:T)=>string, similarityOf:(row:T)=>number):T[] {
  if (rows.length < 2 || !terms.length) return [...rows]
  const coverage = coverageScores(terms, rows.map(textOf))
  return rows.map((row,index)=>({row,index,score:(Number(similarityOf(row))||0)+COVERAGE_WEIGHT*coverage[index]})).sort((a,b)=>b.score-a.score||a.index-b.index).map(x=>x.row)
}
