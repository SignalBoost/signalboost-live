import {
  detectConciergeVisualIntent,
  extractNamedPeople,
  type ConciergeVisualIntent,
} from './intent.ts'

export type VisualRequestType =
  | 'generic-scene'
  | 'named-person'
  | 'multiple-named-people'
  | 'official-mark'
  | 'user-reference-edit'

export type VisualRequestClassification = Readonly<{
  requestType: VisualRequestType
  confidence: number
  filename: string
  intent: ConciergeVisualIntent | null
  referencePeople: readonly string[]
  referenceQuery?: string
  requiresUserReferenceImage: boolean
  userReferenceImagePresent: boolean
}>

const COMBINING_MARK = /\p{M}/u
const LATIN_CHARACTER = /\p{Script=Latin}/u

const EDIT_ACTION_TOKENS = new Set([
  // English
  'edit', 'modify', 'change', 'alter', 'retouch', 'enhance', 'restore', 'upscale', 'remove', 'replace', 'add', 'crop', 'recolor', 'redraw', 'transform', 'fix',
  // Portuguese
  'edite', 'editar', 'modifique', 'modificar', 'altere', 'alterar', 'retoque', 'retocar', 'melhore', 'melhorar', 'restaure', 'restaurar',
  'amplie', 'ampliar', 'remova', 'remover', 'substitua', 'substituir', 'adicione', 'adicionar', 'recorte', 'recortar', 'recolora', 'recolorir', 'mude', 'mudar',
  // Spanish
  'edita', 'editar', 'modifica', 'modificar', 'cambia', 'cambiar', 'altera', 'alterar', 'retoca', 'retocar', 'mejora', 'mejorar',
  'restaura', 'restaurar', 'amplia', 'ampliar', 'elimina', 'eliminar', 'quita', 'quitar', 'reemplaza', 'reemplazar', 'anade', 'anadir', 'recorta', 'recortar',
  // Polish
  'edytuj', 'zmien', 'zmienic', 'popraw', 'ulepsz', 'odnow', 'przywroc', 'powieksz', 'usun', 'zastap', 'zamien', 'dodaj', 'przytnij', 'przekoloruj',
  // Russian
  'отредактируй', 'отредактируйте', 'измени', 'измените', 'улучши', 'улучшите', 'восстанови', 'восстановите', 'увеличь', 'увеличьте',
  'удали', 'удалите', 'замени', 'замените', 'добавь', 'добавьте', 'обрежь', 'обрежьте', 'перекрась', 'перекрасьте',
])

const REFERENCE_TRANSFORM_ACTION_TOKENS = new Set([
  // Natural deictic commands such as “make this photo brighter”.
  'make', 'create', 'render', 'turn', 'convert', 'stylize', 'style', 'colorize', 'colourize',
  'faca', 'fazer', 'crie', 'criar', 'transforme', 'transformar', 'converta', 'converter', 'estilize', 'estilizar', 'colorize', 'colorir',
  'haz', 'hacer', 'crea', 'crear', 'transforma', 'transformar', 'convierte', 'convertir', 'estiliza', 'estilizar', 'colorea', 'colorear',
  'zrob', 'stworz', 'przeksztalc', 'zamien', 'wystylizuj', 'pokoloruj',
  'сделай', 'сделайте', 'создай', 'создайте', 'преобразуй', 'преобразуйте', 'стилизуй', 'стилизуйте', 'раскрась', 'раскрасьте',
])

const EDIT_SUBJECT_TOKENS = new Set([
  // English
  'image', 'photo', 'picture', 'photograph', 'portrait', 'logo', 'badge', 'crest', 'background', 'foreground', 'face', 'faces', 'visual',
  // Portuguese
  'imagem', 'foto', 'fotografia', 'retrato', 'logotipo', 'logo', 'distintivo', 'brasao', 'fundo', 'rosto', 'rostos', 'visual',
  // Spanish
  'imagen', 'foto', 'fotografia', 'retrato', 'logotipo', 'logo', 'insignia', 'escudo', 'fondo', 'rostro', 'rostros', 'visual',
  // Polish
  'obraz', 'zdjecie', 'fotografia', 'portret', 'logo', 'odznaka', 'herb', 'tlo', 'twarz', 'twarze', 'wizualizacja',
  // Russian
  'изображение', 'картинка', 'фото', 'фотография', 'портрет', 'логотип', 'эмблема', 'герб', 'фон', 'лицо', 'лица', 'визуализация',
])

const MAINTENANCE_ACTION_TOKENS = new Set([
  'fix', 'debug', 'test', 'repair', 'update', 'modify', 'change', 'implement', 'refactor', 'patch',
  'corrija', 'corrigir', 'depure', 'depurar', 'teste', 'testar', 'atualize', 'atualizar', 'modifique', 'modificar', 'implemente', 'implementar', 'refatore', 'refatorar',
  'corrige', 'corregir', 'depura', 'depurar', 'prueba', 'probar', 'actualiza', 'actualizar', 'modifica', 'modificar', 'implementa', 'implementar', 'refactoriza', 'refactorizar',
  'napraw', 'debuguj', 'testuj', 'zaktualizuj', 'zmien', 'zaimplementuj', 'refaktoryzuj',
  'исправь', 'исправьте', 'отладь', 'отладьте', 'протестируй', 'протестируйте', 'обнови', 'обновите', 'измени', 'измените', 'реализуй', 'реализуйте',
])

const TECHNICAL_CONTEXT_TOKENS = new Set([
  'bug', 'code', 'pipeline', 'generation', 'generator', 'api', 'route', 'endpoint', 'test', 'tests', 'error', 'upload', 'renderer', 'rendering', 'timeout', 'model', 'component', 'implementation', 'repo', 'repository',
  'erro', 'codigo', 'pipeline', 'geracao', 'gerador', 'api', 'rota', 'endpoint', 'teste', 'testes', 'upload', 'renderizador', 'timeout', 'modelo', 'componente', 'implementacao', 'repositorio',
  'error', 'codigo', 'pipeline', 'generacion', 'generador', 'api', 'ruta', 'endpoint', 'prueba', 'pruebas', 'carga', 'renderizador', 'timeout', 'modelo', 'componente', 'implementacion', 'repositorio',
  'blad', 'kod', 'potok', 'generowanie', 'generator', 'api', 'trasa', 'endpoint', 'test', 'testy', 'upload', 'renderer', 'limit', 'model', 'komponent', 'implementacja', 'repozytorium',
  'ошибка', 'код', 'конвейер', 'генерация', 'генератор', 'api', 'маршрут', 'эндпоинт', 'тест', 'тесты', 'загрузка', 'рендерер', 'таймаут', 'модель', 'компонент', 'реализация', 'репозиторий',
])

const DEICTIC_REFERENCE_PATTERNS = [
  /\b(?:this|the attached|my)\s+(?:image|photo|picture|photograph|portrait|logo)\b/i,
  /\b(?:esta|essa|minha|a imagem anexada|a foto anexada)\s+(?:imagem|foto|fotografia|retrato|logo)?\b/i,
  /\b(?:esta|esa|mi|la imagen adjunta|la foto adjunta)\s+(?:imagen|foto|fotografia|retrato|logo)?\b/i,
  /\b(?:to|zalaczone|moje)\s+(?:zdjecie|obraz|fotografie|portret|logo)\b/i,
  /(?:это|эту|прикрепленное|мо[её])\s+(?:изображение|картинку|фото|фотографию|портрет|логотип)/i,
]

const LATIN_VISUAL_DISCUSSION_PATTERNS = [
  /\bhow\s+(?:do|can|should|would)\s+(?:i|we|someone)\s+(?:draw|create|make|generate|edit|modify|design|render)\b/i,
  /\bhow\s+to\s+(?:draw|create|make|generate|edit|modify|design|render)\b/i,
  /\b(?:explain|teach|show)\s+(?:me\s+)?how\s+to\s+(?:draw|create|make|generate|edit|modify|design|render)\b/i,
  /\bcomo\s+(?:eu\s+)?(?:desenhar|criar|fazer|gerar|editar|modificar|projetar|renderizar)\b/i,
  /\bcomo\s+(?:dibujar|crear|hacer|generar|editar|modificar|disenar|renderizar)\b/i,
  /\bjak\s+(?:narysowac|stworzyc|zrobic|wygenerowac|edytowac|zmodyfikowac|zaprojektowac|renderowac)\b/i,
]

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

function normalizedTokens(value: string): string[] {
  return (String(value || '').match(/[\p{L}\p{N}'’.-]+/gu) || [])
    .map((token) => foldLatinDiacritics(token.toLowerCase()))
}

function hasDeicticReference(objective: string): boolean {
  return DEICTIC_REFERENCE_PATTERNS.some((pattern) => pattern.test(String(objective || '')))
}

function isVisualInstructionDiscussion(objective: string): boolean {
  const folded = foldLatinDiacritics(String(objective || '').toLowerCase())
  return LATIN_VISUAL_DISCUSSION_PATTERNS.some((pattern) => pattern.test(folded))
    || /как\s+(?:нарисовать|создать|сгенерировать|редактировать|изменить|спроектировать|отрендерить)/i.test(objective)
}

function isTechnicalVisualMaintenance(objective: string): boolean {
  if (hasDeicticReference(objective)) return false
  const tokens = normalizedTokens(objective)
  return tokens.some((token) => MAINTENANCE_ACTION_TOKENS.has(token))
    && tokens.some((token) => EDIT_SUBJECT_TOKENS.has(token))
    && tokens.some((token) => TECHNICAL_CONTEXT_TOKENS.has(token))
}

export function isUserReferenceEditObjective(objective: string): boolean {
  const tokens = normalizedTokens(objective)
  const deicticReference = hasDeicticReference(objective)
  const hasEditAction = tokens.some((token) => EDIT_ACTION_TOKENS.has(token))
  if (hasEditAction && (deicticReference || tokens.some((token) => EDIT_SUBJECT_TOKENS.has(token)))) return true

  // “Make/create/turn this photo …” is an edit only when it explicitly points to a source image.
  return deicticReference && tokens.some((token) => REFERENCE_TRANSFORM_ACTION_TOKENS.has(token))
}

/**
 * Deterministic request classifier used by every visual ingress.
 * Explicit reference edits route even when the attachment is missing so the visual tool can return
 * a precise missing-reference error instead of silently falling through to ordinary text answers.
 */
export function classifyVisualRequest(input: {
  objective: string
  hasUserReferenceImage?: boolean
}): VisualRequestClassification | null {
  const objective = String(input.objective || '').trim()
  const hasUserReferenceImage = input.hasUserReferenceImage === true

  // Tutorials, explanatory questions, and engineering maintenance stay in ordinary COS reasoning.
  // This prevents keyword-only routing such as “how do I draw a logo?” or “fix image generation bug”.
  if (isVisualInstructionDiscussion(objective) || isTechnicalVisualMaintenance(objective)) return null

  const intent = detectConciergeVisualIntent(objective)
  const referencePeople = Object.freeze(extractNamedPeople(objective))

  if (isUserReferenceEditObjective(objective)) {
    return Object.freeze({
      requestType: 'user-reference-edit',
      confidence: hasUserReferenceImage ? 1 : 0.98,
      filename: 'edited-visual.png',
      intent,
      referencePeople,
      requiresUserReferenceImage: true,
      userReferenceImagePresent: hasUserReferenceImage,
    })
  }

  if (!intent) return null

  if (intent.mode === 'reference-mark') {
    return Object.freeze({
      requestType: 'official-mark',
      confidence: 1,
      filename: intent.filename,
      intent,
      referencePeople: Object.freeze([]),
      referenceQuery: intent.referenceQuery,
      requiresUserReferenceImage: false,
      userReferenceImagePresent: hasUserReferenceImage,
    })
  }

  if (intent.mode === 'reference-people') {
    const people = Object.freeze([...(intent.referencePeople || [])])
    return Object.freeze({
      requestType: people.length > 1 ? 'multiple-named-people' : 'named-person',
      confidence: people.length ? 1 : 0.6,
      filename: intent.filename,
      intent,
      referencePeople: people,
      requiresUserReferenceImage: false,
      userReferenceImagePresent: hasUserReferenceImage,
    })
  }

  return Object.freeze({
    requestType: 'generic-scene',
    confidence: 0.99,
    filename: intent.filename,
    intent,
    referencePeople,
    requiresUserReferenceImage: false,
    userReferenceImagePresent: hasUserReferenceImage,
  })
}

export function isClassifiedVisualRequest(input: {
  objective: string
  hasUserReferenceImage?: boolean
}): boolean {
  return classifyVisualRequest(input) !== null
}
