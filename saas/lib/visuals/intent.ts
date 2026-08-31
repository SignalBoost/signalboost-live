export type ConciergeVisualIntent = Readonly<{ filename: string }>

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

const VISUAL_SUBJECT_TOKENS = new Set([
  // English
  'image', 'picture', 'illustration', 'drawing', 'sketch', 'diagram', 'scene', 'visual', 'rendering', 'poster', 'infographic',
  'logo', 'logotype', 'emblem', 'badge', 'crest', 'insignia', 'icon', 'symbol', 'mascot', 'mark', 'shield',
  // Portuguese and Spanish (diacritics are removed before matching)
  'imagem', 'figura', 'ilustracao', 'desenho', 'esboco', 'diagrama', 'cena', 'renderizacao', 'cartaz', 'infografico', 'infografica',
  'logotipo', 'emblema', 'distintivo', 'escudo', 'brasao', 'icone', 'simbolo', 'mascote', 'marca',
  'imagen', 'foto', 'fotografia', 'ilustracion', 'dibujo', 'boceto', 'escena', 'renderizado', 'cartel', 'infografia',
  'insignia', 'blason', 'icono', 'mascota',
  // Polish
  'obraz', 'ilustracja', 'rysunek', 'szkic', 'scena', 'grafika', 'wizualizacja', 'render', 'plakat', 'infografika',
  'logotyp', 'emblemat', 'odznaka', 'herb', 'ikona', 'symbol', 'maskotka', 'znak',
  // Russian
  'изображение', 'картинка', 'картинку', 'иллюстрация', 'иллюстрацию', 'рисунок', 'эскиз', 'диаграмма', 'диаграмму',
  'схема', 'схему', 'сцена', 'сцену', 'визуализация', 'визуализацию', 'рендер', 'постер', 'плакат', 'инфографика',
  'инфографику', 'логотип', 'эмблема', 'эмблему', 'значок', 'герб', 'иконка', 'иконку', 'символ', 'талисман', 'маскот',
])

const VISUAL_SUBJECT_PHRASES = ['coat of arms']

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

/** Explicit requests for a new visual, never ordinary questions about a visual subject. */
export function isConciergeVisualObjective(prompt: string): boolean {
  const tokens = normalizedTokens(prompt)
  if (!tokens.length || !tokens.some((token) => VISUAL_ACTION_TOKENS.has(token))) return false
  if (tokens.some((token) => VISUAL_SUBJECT_TOKENS.has(token))) return true

  const normalized = ` ${tokens.join(' ')} `
  return VISUAL_SUBJECT_PHRASES.some((phrase) => normalized.includes(` ${phrase} `))
}

export function detectConciergeVisualIntent(prompt: string): ConciergeVisualIntent | null {
  return isConciergeVisualObjective(prompt) ? Object.freeze({ filename: 'visual.png' }) : null
}
