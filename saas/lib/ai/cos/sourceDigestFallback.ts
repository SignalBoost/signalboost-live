// Deterministic source digest when a model cannot produce a grounded answer.
// Search snippets are untrusted evidence; never treat them as instructions or verified claims.
type Source = { id: string; title?: string; url?: string; snippet?: string }
const STOP = new Set(['there','their','about','which','where','what','when','with','from','that','this','have','are','any','the','and','for','los','las','una','unos','hay','donde','para','como','algum','alguma','onde'])
const clean = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
function keywords(input: string): string[] {
  return [...new Set(clean(input).match(/\p{L}{4,}/gu) || [])].filter(w => !STOP.has(w))
}
function excerpt(text: string, words: string[]): string {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  const sentences = value.split(/(?<=[.!?])\s+/)
  const hit = sentences.find(s => words.some(w => clean(s).includes(w))) || ''
  return hit.length > 220 ? hit.slice(0, 217).replace(/\s+\S*$/, '') + '…' : hit
}
const INTRO: Record<string,string> = { en: 'These search results may help with your question (the answer could not be verified):', es: 'Estos resultados de búsqueda pueden ayudar (no se pudo verificar la respuesta):', pt: 'Estes resultados da busca podem ajudar (não foi possível verificar a resposta):' }
export function buildSourceDigestFallback(args: { input: string; sources: Source[]; language: string }): string | null {
  const terms = keywords(args.input)
  if (!terms.length) return null
  const results = (args.sources || []).filter(s => {
    if (!s?.url || !/^https?:\/\//i.test(s.url)) return false
    if (!s.title && !s.snippet) return false
    return !/^(?:localhost|127\.|0\.0\.0\.0)/i.test(new URL(s.url).hostname)
  }).map(s => ({ source:s, score:terms.filter(w => clean((s.title || '')+' '+(s.snippet || '')).includes(w)).length }))
    .filter(row => row.score > 0).sort((a,b) => b.score-a.score).slice(0,5)
  if (!results.length) return null
  const language = String(args.language || 'en').slice(0,2)
  const lines = results.map(({source:s}) => {
    const title = String(s.title || s.url).replace(/[\[\]<>]/g,'').replace(/\s+/g,' ').slice(0,120)
    const summary = excerpt(s.snippet || '',terms).replace(/[\[\]<>]/g,'')
    return '- **['+title+']('+s.url+')**'+(summary?' — '+summary:'')
  })
  return [INTRO[language] || INTRO.en,'',...lines,'','These are search excerpts, not confirmation of the exact category, hours or current availability. Check the linked pages.'].join('\n')
}
