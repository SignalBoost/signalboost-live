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
import { createGdeltNewsSearch, createYouTubeMetadataSearch } from './mediaClients'

export type LiveLearningEnvironment = {
  [key: string]: string | undefined
  COS_LIVE_SOURCES_ENABLED?: string
  YOUTUBE_API_KEY?: string
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
    adapters.push(youtubeLearningConnector(createYouTubeMetadataSearch(env.YOUTUBE_API_KEY), 2))
  }

  return adapters.map(externalGapOnly)
}
