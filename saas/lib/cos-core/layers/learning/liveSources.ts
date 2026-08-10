import type { ContinuousLearningSourceAdapter } from './cycle'
import {
  libraryLearningConnector,
  newsLearningConnector,
  scientificLearningConnector,
  youtubeLearningConnector,
} from './connectors'
import {
  crossrefScientificSearch,
  europePmcScientificSearch,
  openAlexScientificSearch,
  openLibrarySearch,
} from './publicClients'
import {
  createGdeltNewsSearch,
  createYouTubeMetadataSearch,
  createYouTubeTranscriptSearch,
} from './mediaClients'

export type LiveLearningEnvironment = {
  [key: string]: string | undefined
  COS_LIVE_SOURCES_ENABLED?: string
  YOUTUBE_API_KEY?: string
  YOUTUBE_TRANSCRIPT_API_URL?: string
  YOUTUBE_TRANSCRIPT_API_TOKEN?: string
  YOUTUBE_TRANSCRIPT_LANGUAGES?: string
}

function externalGapOnly(adapter: ContinuousLearningSourceAdapter): ContinuousLearningSourceAdapter {
  return {
    kind: adapter.kind,
    async acquire(gap) {
      if (gap.id.startsWith('daily-mining-')) return []
      return adapter.acquire(gap)
    },
  }
}

function transcriptLanguages(value?: string): string[] {
  const parsed = String(value || 'en')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return parsed.length ? parsed.slice(0, 8) : ['en']
}

export function createLiveLearningAdapters(
  env: LiveLearningEnvironment = process.env,
): ContinuousLearningSourceAdapter[] {
  if (env.COS_LIVE_SOURCES_ENABLED !== 'true') return []

  const adapters: ContinuousLearningSourceAdapter[] = [
    scientificLearningConnector(crossrefScientificSearch, 2),
    scientificLearningConnector(openAlexScientificSearch, 2),
    scientificLearningConnector(europePmcScientificSearch, 2),
    libraryLearningConnector(openLibrarySearch, 2),
    newsLearningConnector(createGdeltNewsSearch(), 2),
  ]

  if (env.YOUTUBE_API_KEY) {
    if (env.YOUTUBE_TRANSCRIPT_API_URL) {
      adapters.push(youtubeLearningConnector(createYouTubeTranscriptSearch(env.YOUTUBE_API_KEY, {
        transcriptApiUrl: env.YOUTUBE_TRANSCRIPT_API_URL,
        transcriptApiToken: env.YOUTUBE_TRANSCRIPT_API_TOKEN,
        languages: transcriptLanguages(env.YOUTUBE_TRANSCRIPT_LANGUAGES),
      }), 2))
    } else {
      adapters.push(youtubeLearningConnector(createYouTubeMetadataSearch(env.YOUTUBE_API_KEY), 2))
    }
  }

  return adapters.map(externalGapOnly)
}
