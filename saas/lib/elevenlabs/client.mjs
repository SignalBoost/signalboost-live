// saas/lib/elevenlabs/client.mjs
// JavaScript-compatible server-side TTS client for Node .mjs workers.
// Keep behavior aligned with client.ts, but avoid TypeScript loader requirements.

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1'
const OPENAI_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000
const GENERATE_SPEECH_TIMEOUT_MS = 15_000
const OPENAI_TTS_HD_MODEL = 'tts-1-hd'
export const DEFAULT_MODEL_ID = 'eleven_multilingual_v2'

const CURATED_VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', locale: 'en', gender: 'female' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', locale: 'en', gender: 'male' },
  { id: 'XB0fDUnXU5powFXDhCwa', locale: 'pt-BR', gender: 'female' },
  { id: 'iP95p4xoKVk53GoZ742B', locale: 'pt-BR', gender: 'male' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', locale: 'pt-PT', gender: 'female' },
  { id: 'pqHfZKP75CvOlQylNhV4', locale: 'pt-PT', gender: 'male' },
  { id: '9BWtsMINqrJLrRacOk9x', locale: 'es-LATAM', gender: 'female' },
  { id: 'cgSgspJ2msm6clMCkdW9', locale: 'es-LATAM', gender: 'female' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', locale: 'es-ES', gender: 'male' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', locale: 'es-ES', gender: 'female' },
  { id: 'ThT5KcBeYPX3keUQqHPh', locale: 'pl', gender: 'female' },
  { id: 'onwK4e9ZLuTAKqWW03F9', locale: 'pl', gender: 'male' },
  { id: 'z9fAnlkpzviPz146aGWa', locale: 'ru', gender: 'female' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', locale: 'ru', gender: 'male' },
]

function getElevenLabsApiKey() {
  return process.env.ELEVENLABS_API_KEY?.trim() || null
}

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() || null
}

function getProviderTimeoutMs(envName) {
  const configured = Number(process.env[envName])
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, DEFAULT_PROVIDER_TIMEOUT_MS)
    : DEFAULT_PROVIDER_TIMEOUT_MS
}

export async function generateSpeech(opts) {
  return await withTimeout(
    generateSpeechFromProviders(opts),
    GENERATE_SPEECH_TIMEOUT_MS,
    `Speech generation timed out after ${Math.round(GENERATE_SPEECH_TIMEOUT_MS / 1000)} seconds`,
  )
}

async function generateSpeechFromProviders(opts) {
  const elevenLabsKey = getElevenLabsApiKey()
  const openAiKey = getOpenAiApiKey()
  const fallbackToOpenAI = opts?.fallbackToOpenAI !== false
  let elevenLabsError = null

  if (elevenLabsKey) {
    try {
      return await generateSpeechWithElevenLabs(opts, elevenLabsKey)
    } catch (err) {
      elevenLabsError = err
      console.warn(`[TTS Warning] ElevenLabs failed (${diagnoseProviderError(err)}).`, sanitizeProviderError(err))
    }
  } else {
    elevenLabsError = new Error('ELEVENLABS_API_KEY is not set')
    console.warn('[TTS Warning] ElevenLabs skipped because ELEVENLABS_API_KEY is not set.')
  }

  if (!fallbackToOpenAI) {
    throw new Error(`ElevenLabs speech generation failed: ${sanitizeProviderError(elevenLabsError)}`)
  }

  if (!openAiKey) {
    const message = `Speech generation failed. ElevenLabs: ${sanitizeProviderError(elevenLabsError)}. OPENAI_API_KEY is not set for fallback.`
    console.error(`[TTS Error] ${message}`)
    throw new Error(message)
  }

  console.warn('[TTS Warning] ElevenLabs failed. Falling back to OpenAI tts-1-hd...')
  try {
    return await generateSpeechWithOpenAI(opts, openAiKey)
  } catch (openAiError) {
    const message = `Speech generation failed. ElevenLabs: ${sanitizeProviderError(elevenLabsError)}. OpenAI tts-1-hd fallback: ${sanitizeProviderError(openAiError)}`
    console.error(`[TTS Error] ${message}`)
    throw new Error(message)
  }
}

async function generateSpeechWithElevenLabs(opts, apiKey) {
  const {
    text,
    voiceId,
    modelId = DEFAULT_MODEL_ID,
    stability = 0.5,
    similarityBoost = 0.75,
    style = 0,
  } = opts
  const timeoutMs = getProviderTimeoutMs('ELEVENLABS_TIMEOUT_MS')
  const res = await fetchWithTimeout(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey, Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: { stability, similarity_boost: similarityBoost, style, use_speaker_boost: true },
    }),
  }, timeoutMs, `ElevenLabs request timed out after ${Math.round(timeoutMs / 1000)} seconds`)
  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    throw new Error(`ElevenLabs ${describeHttpStatus(res.status)}: ${errorText || res.statusText}`)
  }
  return await res.arrayBuffer()
}

async function generateSpeechWithOpenAI(opts, apiKey) {
  const timeoutMs = getProviderTimeoutMs('OPENAI_TTS_TIMEOUT_MS')
  const res = await fetchWithTimeout(`${OPENAI_BASE_URL}/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: OPENAI_TTS_HD_MODEL, voice: mapOpenAiVoice(opts.voiceId), input: opts.text, response_format: 'mp3' }),
  }, timeoutMs, `OpenAI tts-1-hd request timed out after ${Math.round(timeoutMs / 1000)} seconds`)
  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    throw new Error(`OpenAI tts-1-hd ${describeHttpStatus(res.status)}: ${errorText || res.statusText}`)
  }
  return await res.arrayBuffer()
}

async function fetchWithTimeout(url, init, timeoutMs, timeoutMessage) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw new Error(timeoutMessage)
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

async function withTimeout(promise, ms, message) {
  let timeout
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(message)), ms) })])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function findVoice(voiceId) {
  return CURATED_VOICES.find(v => v.id === voiceId)
}

function mapOpenAiVoice(voiceId) {
  const voice = findVoice(voiceId)
  if (!voice) return 'alloy'
  if (voice.gender === 'male') return voice.locale === 'en' ? 'onyx' : 'echo'
  return voice.locale === 'en' ? 'nova' : 'shimmer'
}

function describeHttpStatus(status) {
  if (status === 401) return 'error 401 (unauthorized - check API key)'
  if (status === 429) return 'error 429 (rate limited or quota exceeded)'
  if (status >= 500) return `error ${status} (provider server error)`
  return `error ${status}`
}

function diagnoseProviderError(error) {
  const message = sanitizeProviderError(error).toLowerCase()
  if (message.includes('401') || message.includes('unauthorized')) return '401 unauthorized'
  if (message.includes('429') || message.includes('rate limit') || message.includes('quota')) return '429 rate limit or quota'
  if (message.includes('timed out') || message.includes('abort')) return 'timeout'
  return 'provider error'
}

function sanitizeProviderError(error) {
  if (!error) return 'unknown'
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/xi-api-key[^,}\n]*/gi, 'xi-api-key redacted')
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/g, 'Bearer redacted')
    .slice(0, 800)
}
