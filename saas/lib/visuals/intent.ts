export type ConciergeVisualMode = 'generate' | 'reference-mark' | 'reference-people'

export type ConciergeVisualIntent = Readonly<{
  filename: string
  mode: ConciergeVisualMode
  referenceQuery?: string
  referencePeople?: readonly string[]
}>

const VISUAL_ACTION_TOKENS = new Set([
  // English
  'sketch', 'draw', 'illustrate', 'visualize', 'visualise', 'generate', 'create', 'make', 'design', 'render', 'paint', 'depict',
  // Portuguese
  'desenhe', 'desenhar', 'desenha', 'desenhem', 'crie', 'criar', 'cria', 'criem', 'gere', 'gerar', 'gera', 'gerem',
  'ilustre', 'ilustrar', 'ilustra', 'ilustrem', 'visualize', 'visualizar', 'visualiza', 'visualizem', 'faca', 'fazer',
  'projete', 'projetar', 'projeta', 'projetem', 'renderize', 'renderizar', 'renderiza', 'renderizem', 'pinte', 'pintar',
  // Spanish
  'dibuja', 'dibujar', 'dibuje', 'dibujen', 'crea', 'crear', 'cree', 'creen', 'genera', 'generar', 'genere', 'generen',
  'ilustra', 'ilustrar', 'ilustre', 'ilustren', 'visualiza', 'visualizar', 'visualice', 'visualicen', 'disena', 'disenar',
  'disene', 'disenen', 'haz', 'hacer', 'haga', 'hagan', 'renderiza', 'renderizar', 'renderice', 'rendericen', 'pinta', 'pintar',
  // Polish
  'narysuj', 'rysuj', 'stworz', 'zrob', 'zaprojektuj', 'wygeneruj', 'zilustruj', 'zwizualizuj', 'wykonaj', 'utworz', 'namaluj',
  // Russian
  'нарисуй', 'нарисуйте', 'создай', 'создайте', 'сгенерируй', 'сгенерируйте', 'проиллюстрируй', 'проиллюстрируйте',
  'визуализируй', 'визуализируйте', 'сделай', 'сделайте', 'спроектируй', 'спроектируйте', 'изобрази', 'изобразите',
])

const REFERENCE_MARK_TOKENS = new Set([
  'logo', 'logotype', 'emblem', 'badge', 'crest', 'insignia', 'icon', 'symbol', 'mark', 'shield',
  'logotipo', 'emblema', 'distintivo', 'escudo', 'brasao', 'icone', 'simbolo', 'marca',
  'insignia', 'blason', 'icono',
  'logotyp', 'emblemat', 'odznaka', 'herb', 'ikona', 'symbol', 'znak',
  'логотип', 'эмблема', 'эмблему', 'значок', 'герб', 'иконка', 'иконку', 'символ',
])

const VISUAL_SUBJECT_TOKENS = new Set([
  // English
  'image', 'picture', 'illustration', 'drawing', 'sketch', 'diagram', 'scene', 'visual', 'rendering', 'poster', 'infographic', 'portrait', 'photo',
  ...REFERENCE_MARK_TOKENS,
  'mascot',
  // Portuguese and Spanish (diacritics are removed before matching)
  'imagem', 'figura', 'ilustracao', 'desenho', 'esboco', 'diagrama', 'cena', 'renderizacao', 'cartaz', 'infografico', 'infografica',
  'mascote', 'imagen', 'foto', 'fotografia', 'ilustracion', 'dibujo', 'boceto', 'escena', 'renderizado', 'cartel', 'infografia', 'mascota', 'retrato',
  // Polish
  'obraz', 'ilustracja', 'rysunek', 'szkic', 'scena', 'grafika', 'wizualizacja', 'render', 'plakat', 'infografika', 'maskotka', 'portret',
  // Russian
  'изображение', 'картинка', 'картинку', 'иллюстрация', 'иллюстрацию', 'рисунок', 'эскиз', 'диаграмма', 'диаграмму',
  'схема', 'схему', 'сцена', 'сцену', 'визуализация', 'визуализацию', 'рендер', 'постер', 'плакат', 'инфографика',
  'инфографику', 'талисман', 'маскот', 'портрет', 'фото',
])

const VISUAL_SUBJECT_PHRASES = ['coat of arms']

const ORIGINAL_MARK_TOKENS = new Set([
  'original', 'new', 'custom', 'invented', 'fictional', 'inspired', 'reimagined',
  'novo', 'nova', 'original', 'personalizado', 'personalizada', 'inventado', 'inventada', 'inspirado', 'inspirada',
  'nuevo', 'nueva', 'personalizado', 'personalizada', 'inventado', 'inventada', 'inspirado', 'inspirada',
  'nowy', 'nowa', 'nowe', 'oryginalny', 'oryginalna', 'niestandardowy', 'fikcyjny', 'inspirowany',
  'новый', 'новая', 'новое', 'оригинальный', 'оригинальная', 'вымышленный', 'вымышленная', 'вдохновленный',
])

const REFERENCE_STOP_TOKENS = new Set([
  ...VISUAL_ACTION_TOKENS,
  ...VISUAL_SUBJECT_TOKENS,
  ...ORIGINAL_MARK_TOKENS,
  // English
  'a', 'an', 'the', 'of', 'for', 'from', 'please', 'current', 'official', 'team', 'football', 'soccer', 'club', 'fc', 'coat', 'arms',
  // Portuguese
  'o', 'a', 'os', 'as', 'um', 'uma', 'do', 'da', 'dos', 'das', 'de', 'para', 'por', 'favor', 'atual', 'oficial', 'time', 'equipe', 'clube', 'futebol',
  // Spanish
  'el', 'la', 'los', 'las', 'un', 'una', 'del', 'de', 'para', 'por', 'favor', 'actual', 'oficial', 'equipo', 'club', 'futbol',
  // Polish
  'prosze', 'aktualny', 'oficjalny', 'druzyny', 'druzyna', 'pilkarskiej', 'pilkarski', 'klubu', 'klub',
  // Russian
  'пожалуйста', 'текущий', 'официальный', 'футбольной', 'футбольный', 'команды', 'команда', 'клуба', 'клуб',
])

const PUBLIC_PERSON_ALIASES: readonly Readonly<{
  canonicalName: string
  aliases: readonly (readonly string[])[]
}>[] = [
  {
    canonicalName: 'Luiz Inácio Lula da Silva',
    aliases: [
      ['luiz', 'inacio', 'lula', 'da', 'silva'],
      ['luiz', 'inacio', 'lula'],
      ['presidente', 'lula'],
      ['president', 'lula'],
      ['lula'],
    ],
  },
  {
    canonicalName: 'Donald Trump',
    aliases: [
      ['donald', 'j', 'trump'],
      ['donald', 'trump'],
      ['presidente', 'trump'],
      ['president', 'trump'],
      ['trump'],
    ],
  },
]

const PERSON_TITLE_TOKENS = new Set([
  'president', 'presidente', 'presidenta', 'prime', 'minister', 'premier', 'chancellor', 'governor', 'senator',
  'rei', 'rainha', 'king', 'queen', 'papież', 'prezydent', 'premier', 'presidente', 'президент', 'премьер',
])
const PERSON_LEADING_TOKENS = new Set(['the', 'o', 'a', 'do', 'da', 'de', 'del', 'la', 'el', 'von', 'van'])
const PERSON_CONNECTOR_TOKENS = new Set(['da', 'de', 'do', 'dos', 'das', 'del', 'della', 'di', 'van', 'von', 'bin', 'ibn', 'al'])
const PERSON_CONJUNCTION_TOKENS = new Set(['and', 'e', 'y', 'i', 'or', 'ou', 'o', 'lub', 'и', 'или'])
const PERSON_SCENE_STOP_TOKENS = new Set([
  'walking', 'walk', 'standing', 'stand', 'sitting', 'sit', 'talking', 'talk', 'speaking', 'meeting', 'shaking', 'holding',
  'next', 'beside', 'together', 'each', 'other', 'wearing', 'looking', 'facing', 'with', 'without', 'inside', 'outside',
  'caminhando', 'caminhar', 'andando', 'andar', 'lado', 'juntos', 'juntas', 'conversando', 'falando', 'sentados', 'sentado', 'em', 'com',
  'caminando', 'juntos', 'juntas', 'hablando', 'sentados', 'depie',
  'idacy', 'idaca', 'razem', 'obok', 'rozmawiajacy',
  'идущие', 'идущий', 'рядом', 'вместе', 'разговаривающие',
])
const FICTIONAL_PERSON_TOKENS = new Set([
  'fictional', 'imaginary', 'invented', 'madeup', 'lookalike', 'character',
  'ficticio', 'ficticia', 'imaginario', 'imaginaria', 'inventado', 'inventada', 'personagem',
  'ficticio', 'ficticia', 'imaginario', 'imaginaria', 'personaje',
  'fikcyjny', 'fikcyjna', 'wymyslony', 'wymyslona', 'postac',
  'вымышленный', 'вымышленная', 'воображаемый', 'персонаж',
])
const GENERIC_PERSON_TOKENS = new Set([
  'man', 'men', 'woman', 'women', 'person', 'people', 'child', 'children', 'kid', 'kids', 'boy', 'boys', 'girl', 'girls',
  'homem', 'homens', 'mulher', 'mulheres', 'pessoa', 'pessoas', 'crianca', 'criancas', 'menino', 'menina',
  'hombre', 'hombres', 'mujer', 'mujeres', 'persona', 'personas', 'nino', 'nina',
])

const COMBINING_MARK = /\p{M}/u
const LATIN_CHARACTER = /\p{Script=Latin}/u

type WordToken = Readonly<{ raw: string; folded: string; index: number }>

function foldLatinDiacritics(value: string): string {
  let folded = ''
  let previousBaseWasLatin = false
  for (const character of value.normalize('NFKD')) {
    if (COMBINING_MARK.test(character)) {
      if (!previousBaseWasLatin) folded += character
      continue
    }
    folded += character
    previousBaseWasLatin = LATIN_CHARACTER.test(character)
  }
  return folded
    .normalize('NFC')
    .replace(/ł/g, 'l')
    .replace(/đ/g, 'd')
    .replace(/ð/g, 'd')
    .replace(/þ/g, 'th')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ø/g, 'o')
}

function wordTokens(prompt: string): WordToken[] {
  const words = String(prompt || '').match(/[\p{L}\p{N}'’.-]+/gu) || []
  return words.map((raw, index) => ({ raw, index, folded: foldLatinDiacritics(raw.toLowerCase()) }))
}

function normalizedTokens(prompt: string): string[] {
  return wordTokens(prompt).map((token) => token.folded)
}

function isOriginalMarkRequest(tokens: string[]): boolean {
  if (tokens.some((token) => ORIGINAL_MARK_TOKENS.has(token))) return true
  const normalized = ` ${tokens.join(' ')} `
  const patterns = [
    /\b(?:design|create|make|draw|sketch)\s+(?:a|an)\s+(?:logo|logotype|emblem|badge|crest|icon|mark|coat of arms)\s+for\b/,
    /\b(?:crie|criar|faca|fazer|desenhe|desenhar|projete|projetar)\s+(?:um|uma)\s+(?:logo|logotipo|emblema|distintivo|escudo|brasao|icone|marca)\s+para\b/,
    /\b(?:crea|crear|haz|hacer|dibuja|dibujar|disena|disenar)\s+(?:un|una)\s+(?:logo|logotipo|emblema|insignia|escudo|blason|icono|marca)\s+para\b/,
  ]
  return patterns.some((pattern) => pattern.test(normalized))
}

function referenceQuery(tokens: string[]): string {
  return tokens.filter((token) => !REFERENCE_STOP_TOKENS.has(token)).join(' ').trim()
}

function filenameForReference(query: string): string {
  const slug = foldLatinDiacritics(query)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
  return slug ? `${slug}-mark.png` : 'visual.png'
}

function sequenceIndex(tokens: readonly string[], alias: readonly string[]): number {
  if (!alias.length || alias.length > tokens.length) return -1
  for (let index = 0; index <= tokens.length - alias.length; index += 1) {
    if (alias.every((token, offset) => tokens[index + offset] === token)) return index
  }
  return -1
}

function canonicalKnownPerson(value: string): string {
  const tokens = normalizedTokens(value)
  for (const entry of PUBLIC_PERSON_ALIASES) {
    if (entry.aliases.some((alias) => sequenceIndex(tokens, alias) >= 0)) return entry.canonicalName
  }
  return value.replace(/\s+/g, ' ').trim()
}

function startsWithUppercase(value: string): boolean {
  const first = Array.from(value)[0] || ''
  return /\p{Lu}/u.test(first)
}

function addPerson(found: Map<string, { name: string; index: number }>, candidate: string, index: number): void {
  const cleaned = candidate.replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return
  const canonical = canonicalKnownPerson(cleaned)
  const key = foldLatinDiacritics(canonical.toLowerCase())
  if (!key || GENERIC_PERSON_TOKENS.has(key)) return
  const existing = found.get(key)
  if (!existing || index < existing.index) found.set(key, { name: canonical, index })
}

function knownPeople(tokens: readonly WordToken[]): Array<{ name: string; index: number }> {
  const folded = tokens.map((token) => token.folded)
  const matches: Array<{ name: string; index: number }> = []
  for (const entry of PUBLIC_PERSON_ALIASES) {
    let earliest = Number.POSITIVE_INFINITY
    for (const alias of entry.aliases) {
      const index = sequenceIndex(folded, alias)
      if (index < 0) continue
      if (alias.length === 1 && !startsWithUppercase(tokens[index]?.raw || '')) continue
      earliest = Math.min(earliest, index)
    }
    if (Number.isFinite(earliest)) matches.push({ name: entry.canonicalName, index: earliest })
  }
  return matches
}

function titledPeople(tokens: readonly WordToken[]): Array<{ name: string; index: number }> {
  const matches: Array<{ name: string; index: number }> = []
  for (let index = 0; index < tokens.length; index += 1) {
    if (!PERSON_TITLE_TOKENS.has(tokens[index].folded)) continue
    let cursor = index + 1
    while (cursor < tokens.length && PERSON_LEADING_TOKENS.has(tokens[cursor].folded)) cursor += 1
    const words: string[] = []
    while (cursor < tokens.length && words.length < 6) {
      const token = tokens[cursor]
      if (PERSON_CONJUNCTION_TOKENS.has(token.folded) || PERSON_SCENE_STOP_TOKENS.has(token.folded)) break
      if (VISUAL_ACTION_TOKENS.has(token.folded) || VISUAL_SUBJECT_TOKENS.has(token.folded)) break
      if (GENERIC_PERSON_TOKENS.has(token.folded)) break
      words.push(token.raw)
      cursor += 1
    }
    while (words.length > 1 && PERSON_CONNECTOR_TOKENS.has(foldLatinDiacritics(words.at(-1)!.toLowerCase()))) words.pop()
    if (words.length) matches.push({ name: words.join(' '), index })
  }
  return matches
}

function capitalizedPeople(tokens: readonly WordToken[]): Array<{ name: string; index: number }> {
  const matches: Array<{ name: string; index: number }> = []
  for (let index = 0; index < tokens.length; index += 1) {
    const first = tokens[index]
    if (!startsWithUppercase(first.raw)) continue
    if (VISUAL_ACTION_TOKENS.has(first.folded) || VISUAL_SUBJECT_TOKENS.has(first.folded) || PERSON_TITLE_TOKENS.has(first.folded)) continue
    if (GENERIC_PERSON_TOKENS.has(first.folded)) continue

    const words = [first.raw]
    let properWordCount = 1
    let cursor = index + 1
    while (cursor < tokens.length && words.length < 7) {
      const token = tokens[cursor]
      if (PERSON_CONJUNCTION_TOKENS.has(token.folded) || PERSON_SCENE_STOP_TOKENS.has(token.folded)) break
      if (PERSON_CONNECTOR_TOKENS.has(token.folded)) {
        words.push(token.raw)
        cursor += 1
        continue
      }
      if (!startsWithUppercase(token.raw) || PERSON_TITLE_TOKENS.has(token.folded)) break
      words.push(token.raw)
      properWordCount += 1
      cursor += 1
    }
    if (properWordCount >= 2) matches.push({ name: words.join(' '), index })
  }
  return matches
}

export function extractNamedPeople(prompt: string): string[] {
  const tokens = wordTokens(prompt)
  if (!tokens.length || tokens.some((token) => FICTIONAL_PERSON_TOKENS.has(token.folded))) return []

  const found = new Map<string, { name: string; index: number }>()
  for (const candidate of [...knownPeople(tokens), ...titledPeople(tokens), ...capitalizedPeople(tokens)]) {
    addPerson(found, candidate.name, candidate.index)
  }

  return [...found.values()]
    .sort((a, b) => a.index - b.index || a.name.localeCompare(b.name))
    .slice(0, 4)
    .map((candidate) => candidate.name)
}

function filenameForPeople(people: readonly string[]): string {
  const slug = foldLatinDiacritics(people.join('-'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
  return slug ? `${slug}-illustration.png` : 'people-illustration.png'
}

/** Explicit requests for a new visual, never ordinary questions about a visual subject. */
export function isConciergeVisualObjective(prompt: string): boolean {
  const tokens = normalizedTokens(prompt)
  if (!tokens.length || !tokens.some((token) => VISUAL_ACTION_TOKENS.has(token))) return false
  if (tokens.some((token) => VISUAL_SUBJECT_TOKENS.has(token))) return true

  const normalized = ` ${tokens.join(' ')} `
  return VISUAL_SUBJECT_PHRASES.some((phrase) => normalized.includes(` ${phrase} `))
}

export function detectConciergeVisualIntent(prompt: string): ConciergeVisualIntent | null {
  if (!isConciergeVisualObjective(prompt)) return null

  const tokens = normalizedTokens(prompt)
  const asksForMark = tokens.some((token) => REFERENCE_MARK_TOKENS.has(token))
    || VISUAL_SUBJECT_PHRASES.some((phrase) => ` ${tokens.join(' ')} `.includes(` ${phrase} `))
  const query = asksForMark ? referenceQuery(tokens) : ''

  if (asksForMark && query && !isOriginalMarkRequest(tokens)) {
    return Object.freeze({ filename: filenameForReference(query), mode: 'reference-mark', referenceQuery: query })
  }

  const people = extractNamedPeople(prompt)
  if (people.length) {
    return Object.freeze({ filename: filenameForPeople(people), mode: 'reference-people', referencePeople: Object.freeze(people) })
  }

  return Object.freeze({ filename: 'visual.png', mode: 'generate' })
}
