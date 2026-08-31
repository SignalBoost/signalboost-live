export type ConciergeVisualMode = 'generate' | 'reference-mark'

export type ConciergeVisualIntent = Readonly<{
  filename: string
  mode: ConciergeVisualMode
  referenceQuery?: string
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
  'image', 'picture', 'illustration', 'drawing', 'sketch', 'diagram', 'scene', 'visual', 'rendering', 'poster', 'infographic',
  ...REFERENCE_MARK_TOKENS,
  'mascot',
  // Portuguese and Spanish (diacritics are removed before matching)
  'imagem', 'figura', 'ilustracao', 'desenho', 'esboco', 'diagrama', 'cena', 'renderizacao', 'cartaz', 'infografico', 'infografica',
  'mascote', 'imagen', 'foto', 'fotografia', 'ilustracion', 'dibujo', 'boceto', 'escena', 'renderizado', 'cartel', 'infografia', 'mascota',
  // Polish
  'obraz', 'ilustracja', 'rysunek', 'szkic', 'scena', 'grafika', 'wizualizacja', 'render', 'plakat', 'infografika', 'maskotka',
  // Russian
  'изображение', 'картинка', 'картинку', 'иллюстрация', 'иллюстрацию', 'рисунок', 'эскиз', 'диаграмма', 'диаграмму',
  'схема', 'схему', 'сцена', 'сцену', 'визуализация', 'визуализацию', 'рендер', 'постер', 'плакат', 'инфографика',
  'инфографику', 'талисман', 'маскот',
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
  'a', 'an', 'the', 'of', 'for', 'from', 'please', 'current', 'official', 'team', 'football', 'soccer', 'club', 'fc',
  // Portuguese
  'o', 'a', 'os', 'as', 'um', 'uma', 'do', 'da', 'dos', 'das', 'de', 'para', 'por', 'favor', 'atual', 'oficial', 'time', 'equipe', 'clube', 'futebol',
  // Spanish
  'el', 'la', 'los', 'las', 'un', 'una', 'del', 'de', 'para', 'por', 'favor', 'actual', 'oficial', 'equipo', 'club', 'futbol',
  // Polish
  'proszę', 'prosze', 'aktualny', 'oficjalny', 'druzyny', 'druzyna', 'pilkarskiej', 'pilkarski', 'klubu', 'klub',
  // Russian
  'пожалуйста', 'текущий', 'официальный', 'футбольной', 'футбольный', 'команды', 'команда', 'клуба', 'клуб',
])

const COMBINING_MARK = /\p{M}/u
const LATIN_CHARACTER = /\p{Script=Latin}/u

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
  return folded.normalize('NFC')
}

function normalizedTokens(prompt: string): string[] {
  return foldLatinDiacritics(String(prompt || '').toLowerCase()).match(/[\p{L}\p{N}]+/gu) || []
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

  return Object.freeze({ filename: 'visual.png', mode: 'generate' })
}
