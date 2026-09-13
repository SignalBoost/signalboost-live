type Entry = [string, string]

const entries: Entry[] = [
  ['co powinnam zrobić', 'what should i do'],
  ['co powinienem zrobić', 'what should i do'],
  ['zmieniłam nazwisko', 'i changed name'],
  ['zmieniłem nazwisko', 'i changed name'],
  ['dokumenty', 'documents'],
  ['instytucje', 'institutions'],
  ['urzędy', 'offices'],
  ['przepisy', 'regulations'],
  ['prawo', 'law'],
  ['wiza', 'visa'],
  ['paszport', 'passport'],
  ['obecnie', 'currently'],
  ['aktualnie', 'currently'],
  ['dzisiaj', 'today'],
  ['teraz', 'now'],
  ['kto jest', 'who is'],
  ['jakie', 'which'],
  ['jaki', 'which'],
  ['który', 'which'],
  ['która', 'which'],
  ['które', 'which'],
  ['którzy', 'which'],
  ['czy', 'is'],
  ['qué debo hacer', 'what should i do'],
  ['quién es', 'who is'],
  ['quien es', 'who is'],
  ['cuál es', 'which is'],
  ['cual es', 'which is'],
  ['cuáles', 'which'],
  ['cuales', 'which'],
  ['cuál', 'which'],
  ['cual', 'which'],
  ['documentos', 'documents'],
  ['instituciones', 'institutions'],
  ['regulaciones', 'regulations'],
  ['ley', 'law'],
  ['hoy', 'today'],
  ['ahora', 'now'],
  ['actualmente', 'currently'],
  ['o que devo fazer', 'what should i do'],
  ['quem é', 'who is'],
  ['quem e', 'who is'],
  ['qual é', 'which is'],
  ['qual e', 'which is'],
  ['quais', 'which'],
  ['qual', 'which'],
  ['regulamentos', 'regulations'],
  ['lei', 'law'],
  ['hoje', 'today'],
  ['agora', 'now'],
  ['atualmente', 'currently'],
  ['что мне делать', 'what should i do'],
  ['кто сейчас', 'who is currently'],
  ['кто', 'who'],
  ['какой', 'which'],
  ['какая', 'which'],
  ['какие', 'which'],
  ['документы', 'documents'],
  ['учреждения', 'institutions'],
  ['правила', 'rules'],
  ['закон', 'law'],
  ['сегодня', 'today'],
  ['сейчас', 'currently'],
  ['виза', 'visa'],
  ['паспорт', 'passport'],
  ['прямой', 'direct'],
  ['прямые', 'direct'],
  ['рейс', 'flight'],
  ['рейсы', 'flights'],
  ['поезд', 'train'],
  ['поезда', 'trains'],
  ['wczoraj', 'yesterday'],
  ['ayer', 'yesterday'],
  ['ontem', 'yesterday'],
  ['вчера', 'yesterday'],
  ['wyjaśnij', 'explain'],
  ['explica', 'explain'],
  ['объясни', 'explain'],
  ['moja', 'my'],
  ['nasza', 'our'],
  ['meu', 'my'],
  ['nosso', 'our'],
  ['мой', 'my'],
  ['наш', 'our'],
  ['kampania', 'campaign'],
  ['campaña', 'campaign'],
  ['campanha', 'campaign'],
  ['кампания', 'campaign'],
]

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const before = '(?<![\\p{L}\\p{M}])'
const after = '(?![\\p{L}\\p{M}])'
const compiled = [...entries]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([from, english]) => [new RegExp(`${before}${escape(from)}${after}`, 'giu'), english] as const)

// ASCII Portuguese/Spanish lookup openers must trigger normalization too. Without this signal,
// "qual e ..." bypassed the stale-world guard entirely because it contains no accented character.
const signal = /[\u00c0-\u024f\u0400-\u04ff]|(?:^|\s)(?:czy|jaki|jakie|który|która|które|którzy|kto|gdzie|cuando|donde|quien|cual|cuál|cuales|cuáles|quanto|quem|qual|quais|hoje|hoy)(?:\s|$|[?,.!])/i

export function englishNormalizedForClassification(input: string) {
  const text = String(input || '')
  if (!text || !signal.test(text)) return text
  const original = text.toLowerCase().replace(/[¿¡]/g, ' ')
  let out = original
  for (const [pattern, english] of compiled) out = out.replace(pattern, english)
  return `${out} ${original}`.replace(/\s+/g, ' ').trim()
}
