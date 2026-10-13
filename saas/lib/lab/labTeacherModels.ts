// saas/lib/lab/labTeacherModels.ts
// Turns a provider's live model list into the models a LAB teacher can actually use: models that answer a text prompt
// with text. Provider lists also contain embedding, speech, image, moderation and rerank models; picking one of those
// as a teacher only fails later, during the run, so they are never offered.
//
// What decides, in order:
//   1. What the provider itself declares about the model (Gemini generation methods, Together model type, Mistral chat
//      capability, OpenRouter / Hugging Face output modalities).
//   2. Otherwise the model name: well-known non-text families (embeddings, whisper, tts, dall-e, moderation, ...), plus
//      OpenAI's tool-only models (computer-use, search-preview, deep-research).

const NON_TEXT_NAME_TOKENS: ReadonlySet<string> = new Set([
  'embed', 'embedding', 'embeddings', 'bge', 'rerank', 'reranker',
  'whisper', 'tts', 'transcribe', 'audio', 'realtime',
  'dall', 'image', 'sora', 'flux', 'sdxl', 'diffusion',
  'moderation', 'guard',
  // OpenAI completions-only base models: they have no chat or Responses endpoint.
  'davinci', 'babbage',
])
// OpenAI models that only run with a tool turned on (computer use, web search, deep research). A teacher sends plain
// prompts with no tools, so these fail. Other providers serve similarly named models without that requirement.
const OPENAI_TOOL_ONLY_NAME_TOKENS: ReadonlySet<string> = new Set(['computer', 'search', 'research'])
const TOGETHER_TEXT_TYPES: ReadonlySet<string> = new Set(['chat', 'language', 'code'])

const cleanId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length < 241 && /^[\w./:-]+$/.test(value)

function declaredNonText(item: Record<string, unknown>, provider: string): boolean {
  if (provider === 'gemini' && Array.isArray(item.supportedGenerationMethods)) {
    return !item.supportedGenerationMethods.includes('generateContent')
  }
  if (provider === 'together' && typeof item.type === 'string') return !TOGETHER_TEXT_TYPES.has(item.type.toLowerCase())
  const capabilities = item.capabilities as Record<string, unknown> | undefined
  if (provider === 'mistral' && capabilities && typeof capabilities === 'object' && capabilities.completion_chat === false) return true
  const architecture = item.architecture as Record<string, unknown> | undefined
  if (architecture && typeof architecture === 'object' && Array.isArray(architecture.output_modalities)) {
    return !architecture.output_modalities.includes('text')
  }
  return false
}

export function isNonTextModelName(id: string, provider = ''): boolean {
  return id.toLowerCase().split(/[^a-z0-9]+/).some(token =>
    NON_TEXT_NAME_TOKENS.has(token) || (provider === 'openai' && OPENAI_TOOL_ONLY_NAME_TOKENS.has(token)))
}

export function collectTeacherModels(payload: unknown, provider: string): string[] {
  const obj = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const rows: unknown[] = Array.isArray(payload) ? payload : Array.isArray(obj.data) ? obj.data : Array.isArray(obj.models) ? obj.models : []
  const models = rows.flatMap(row => {
    if (!row || typeof row !== 'object') return []
    const item = row as Record<string, unknown>
    const id = item.id ?? item.name
    if (!cleanId(id)) return []
    // Gemini responses often use models/model-name, while generation requires model-name.
    const name = provider === 'gemini' ? id.replace(/^models\//, '') : id
    if (!cleanId(name) || declaredNonText(item, provider) || isNonTextModelName(name, provider)) return []
    return [name]
  })
  return [...new Set(models)].sort((a, b) => a.localeCompare(b)).slice(0, 250)
}
