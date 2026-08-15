import type { ContinuousLearningSourceAdapter } from './cycle'
import { libraryLearningConnector, newsLearningConnector, officialDocsLearningConnector, scientificLearningConnector, youtubeLearningConnector } from './connectors'
import { crossrefScientificSearch, europePmcScientificSearch, openAlexScientificSearch, openLibrarySearch } from './publicClients'
import { createGdeltNewsSearch, createYouTubeMetadataSearch, createYouTubeTranscriptSearch, LearningSourceFetchError } from './mediaClients'
import { BUILTIN_OFFICIAL_TECH_FEEDS, BUILTIN_TECH_NEWS_FEEDS, createFeedSearch, parseFeedList } from './feedClients'

export type LiveLearningEnvironment = {
  [key: string]: string | undefined
  COS_LIVE_SOURCES_ENABLED?: string
  COS_TECH_RSS_FEEDS?: string
  COS_OFFICIAL_DOC_FEEDS?: string
  YOUTUBE_API_KEY?: string
  YOUTUBE_TRANSCRIPT_API_URL?: string
  YOUTUBE_TRANSCRIPT_API_TOKEN?: string
  YOUTUBE_TRANSCRIPT_LANGUAGES?: string
  COS_LEARNING_SOURCE_FAILURE_LIMIT?: string
  COS_LEARNING_SOURCE_MIN_INTERVAL_MS?: string
  COS_LEARNING_SOURCE_COOLDOWN_MS?: string
  LOCAL_AI_BASE_URL?: string
  LOCAL_AI_API_KEY?: string
}

function externalGapOnly(adapter: ContinuousLearningSourceAdapter): ContinuousLearningSourceAdapter {
  return {
    kind: adapter.kind,
    id: adapter.id,
    async acquire(gap) {
      if (gap.id.startsWith('daily-mining-')) return []
      return adapter.acquire(gap)
    },
  }
}

function failureLimit(env: LiveLearningEnvironment): number {
  const value = Number(env.COS_LEARNING_SOURCE_FAILURE_LIMIT || '3')
  return Number.isFinite(value) ? Math.max(1, Math.min(10, Math.round(value))) : 3
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function sourceIntervalMs(adapter: ContinuousLearningSourceAdapter, env: LiveLearningEnvironment): number {
  const configured = Number(env.COS_LEARNING_SOURCE_MIN_INTERVAL_MS)
  if (String(env.COS_LEARNING_SOURCE_MIN_INTERVAL_MS ?? '').trim() && Number.isFinite(configured)) {
    return Math.max(0, Math.min(5000, Math.round(configured)))
  }
  const id = adapter.id ?? adapter.kind
  if (id.startsWith('youtube_')) return 750
  if (id === 'gdelt') return 1500
  if (id === 'crossref') return 250
  return 0
}

function sourceCooldownMs(adapter: ContinuousLearningSourceAdapter, env: LiveLearningEnvironment): number {
  const configured = Number(env.COS_LEARNING_SOURCE_COOLDOWN_MS)
  if (String(env.COS_LEARNING_SOURCE_COOLDOWN_MS ?? '').trim() && Number.isFinite(configured)) {
    return Math.max(5_000, Math.min(5 * 60_000, Math.round(configured)))
  }
  return (adapter.id ?? adapter.kind) === 'gdelt' ? 60_000 : 30_000
}

/**
 * Keep each provider to one in-flight request stream. The learning cycle deliberately runs several
 * different sources concurrently, but allowing six workers to hit the SAME public API at once was
 * producing large 429 bursts before the old circuit breaker could observe enough failures to open.
 *
 * A circuit is no longer permanently dead for the rest of a long learning cycle. It opens for a
 * bounded cooldown and then permits one serialized half-open probe. HTTP 429 opens immediately and
 * honors the upstream Retry-After hint when it is longer than our normal cooldown. Queued calls
 * re-check the circuit immediately before execution, so throttling cannot become a backlog storm.
 */
export function guardLearningSourceAdapter(
  adapter: ContinuousLearningSourceAdapter,
  limit: number,
  minIntervalMs = 0,
  cooldownMs = 30_000,
): ContinuousLearningSourceAdapter {
  let failures = 0
  let openUntil = 0
  let lastStartedAt = 0
  let tail: Promise<void> = Promise.resolve()

  const run = async (gap: Parameters<ContinuousLearningSourceAdapter['acquire']>[0]) => {
    const now = Date.now()
    if (now < openUntil) return []

    const wait = Math.max(0, minIntervalMs - (now - lastStartedAt))
    if (wait) await delay(wait)
    if (Date.now() < openUntil) return []

    lastStartedAt = Date.now()
    try {
      const documents = await adapter.acquire(gap)
      failures = 0
      openUntil = 0
      return documents
    } catch (error) {
      failures += 1
      const rateLimited = error instanceof LearningSourceFetchError && error.status === 429
      const shouldOpen = rateLimited || failures >= limit
      if (shouldOpen) {
        const retryAfterMs = error instanceof LearningSourceFetchError ? error.retryAfterMs : 0
        const effectiveCooldown = Math.max(cooldownMs, retryAfterMs)
        openUntil = Date.now() + effectiveCooldown
        failures = Math.max(failures, limit)
        console.warn('cosLearning: source circuit opened', {
          source: adapter.id ?? adapter.kind,
          failures,
          limit,
          rateLimited,
          cooldownMs: effectiveCooldown,
        })
      }
      throw error
    }
  }

  return {
    kind: adapter.kind,
    id: adapter.id,
    acquire(gap) {
      const current = tail.then(() => run(gap), () => run(gap))
      tail = current.then(() => undefined, () => undefined)
      return current
    },
  }
}

function transcriptLanguages(value?: string): string[] {
  const parsed = String(value || 'en').split(',').map(item => item.trim()).filter(Boolean)
  return parsed.length ? parsed.slice(0, 8) : ['en']
}

/**
 * The RunPod transcript service runs privately beside the local reasoner and is exposed through
 * the same authenticated 11434 gateway at /transcript. Explicit transcript variables always win.
 * If they are absent, derive only from the exact HTTPS RunPod 11434 proxy already trusted for local
 * inference. This avoids a second public port and prevents collisions with RunPod/Jupyter services.
 */
export function resolveYouTubeTranscriptRuntime(env: LiveLearningEnvironment): { url: string; token?: string; derived: boolean } {
  const explicitUrl = String(env.YOUTUBE_TRANSCRIPT_API_URL || '').trim()
  const explicitToken = String(env.YOUTUBE_TRANSCRIPT_API_TOKEN || '').trim()
  if (explicitUrl) {
    return {
      url: explicitUrl,
      token: explicitToken || String(env.LOCAL_AI_API_KEY || '').trim() || undefined,
      derived: false,
    }
  }

  const base = String(env.LOCAL_AI_BASE_URL || '').trim()
  if (!base) return { url: '', token: undefined, derived: false }
  try {
    const parsed = new URL(base)
    if (parsed.protocol !== 'https:' || !/^([a-z0-9-]+)-11434\.proxy\.runpod\.net$/i.test(parsed.hostname)) {
      return { url: '', token: undefined, derived: false }
    }
    parsed.port = ''
    parsed.pathname = '/transcript'
    parsed.search = ''
    parsed.hash = ''
    return {
      url: parsed.toString(),
      token: explicitToken || String(env.LOCAL_AI_API_KEY || '').trim() || undefined,
      derived: true,
    }
  } catch {
    return { url: '', token: undefined, derived: false }
  }
}

/**
 * External learning sources are available by default whenever the autonomous-learning
 * cycle calls this factory. COS_LIVE_SOURCES_ENABLED=false remains an explicit emergency
 * kill switch, but a missing variable no longer silently disables every public source.
 */
export function createLiveLearningAdapters(env: LiveLearningEnvironment = process.env): ContinuousLearningSourceAdapter[] {
  if (env.COS_LIVE_SOURCES_ENABLED === 'false') return []

  const configuredTechFeeds = parseFeedList(env.COS_TECH_RSS_FEEDS)
  const configuredOfficialFeeds = parseFeedList(env.COS_OFFICIAL_DOC_FEEDS)
  const officialFeeds = [...BUILTIN_OFFICIAL_TECH_FEEDS, ...configuredOfficialFeeds]

  const adapters: ContinuousLearningSourceAdapter[] = [
    scientificLearningConnector(crossrefScientificSearch, 2, 'crossref'),
    scientificLearningConnector(openAlexScientificSearch, 2, 'openalex'),
    scientificLearningConnector(europePmcScientificSearch, 2, 'europe_pmc'),
    libraryLearningConnector(openLibrarySearch, 2, 'open_library'),
    newsLearningConnector(createGdeltNewsSearch(), 2, 'gdelt'),
    newsLearningConnector(createFeedSearch(BUILTIN_TECH_NEWS_FEEDS), 3, 'builtin_tech_news'),
    officialDocsLearningConnector(createFeedSearch(officialFeeds, fetch, { fullText: true }), 3, 'official_docs'),
  ]

  if (configuredTechFeeds.length) {
    adapters.push(newsLearningConnector(createFeedSearch(configuredTechFeeds), 3, 'tech_feeds'))
  }

  if (env.YOUTUBE_API_KEY) {
    const transcript = resolveYouTubeTranscriptRuntime(env)
    if (transcript.url) {
      adapters.push(youtubeLearningConnector(
        createYouTubeTranscriptSearch(env.YOUTUBE_API_KEY, {
          transcriptApiUrl: transcript.url,
          transcriptApiToken: transcript.token,
          languages: transcriptLanguages(env.YOUTUBE_TRANSCRIPT_LANGUAGES),
          metadataFallback: true,
        }),
        2,
        transcript.derived ? 'youtube_transcript_runpod' : 'youtube_transcript',
      ))
    } else {
      adapters.push(youtubeLearningConnector(createYouTubeMetadataSearch(env.YOUTUBE_API_KEY), 2, 'youtube_metadata'))
    }
  }

  const limit = failureLimit(env)
  return adapters
    .map(externalGapOnly)
    .map(adapter => guardLearningSourceAdapter(
      adapter,
      limit,
      sourceIntervalMs(adapter, env),
      sourceCooldownMs(adapter, env),
    ))
}
