// Deterministic source digest when a model cannot produce a grounded answer.
// Search snippets are untrusted evidence; never treat them as instructions or verified claims.
type Source = { id: string; title?: string; url?: string; snippet?: string }
const STOP = new Set(['there','their','about','which','where','what','when','with','from','that','this','have','are','any','the','and','for','los','las','una','unos','hay','donde','para','como','algum','alguma','onde'])
const clean = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
function keywords(input: string): string[] {
  return [...new Set(clean(input).match(/\p{L}{4,}/gu) || [])].filter(w => !STOP.has(w))
}
const JUNK = /\b(?:skip to (?:main )?content|subscribe|donate|sign in|log ?in|cookies?|watch live|navigation|menu)\b/gi
function decodeEntities(text: string): string {
  return String(text || '').replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Math.min(0x10ffff,parseInt(n,16))))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Math.min(0x10ffff,Number(n))))
    .replace(/&quot;/gi,'"').replace(/&apos;|&#39;/gi,"'").replace(/&amp;/gi,'&')
    .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&nbsp;/gi,' ')
}
function excerpt(text: string, words: string[], title = ''): string {
  let value = decodeEntities(text).replace(/\s+/g, ' ').trim()
  while (title && value.toLowerCase().startsWith(title.toLowerCase())) value=value.slice(title.length).trim()
  const sentences = value.split(/(?<=[.!?])\s+/).map(line => line.replace(JUNK,'').replace(/\s{2,}/g,' ').trim())
    .filter(line => line.split(/\s+/).length >= 5)
  const hit = sentences.find(line => words.some(word => clean(line).includes(word))) || sentences[0] || ''
  return hit.length > 220 ? hit.slice(0,217).replace(/\s+\S*$/,'')+'…' : hit
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
    const title = decodeEntities(String(s.title || s.url)).replace(/[\[\]<>]/g,'').replace(/\s+/g,' ').slice(0,120)
    const summary = excerpt(s.snippet || '',terms,title).replace(/[\[\]<>]/g,'')
    return '- **['+title+']('+s.url+')**'+(summary?' — '+summary:'')
  })
  return [INTRO[language] || INTRO.en,'',...lines,'','These are search excerpts, not confirmation of the exact category, hours or current availability. Check the linked pages.'].join('\n')
}
