import type { ContinuousLearningSourceAdapter } from './cycle'
import { libraryLearningConnector,newsLearningConnector,officialDocsLearningConnector,scientificLearningConnector,youtubeLearningConnector } from './connectors'
import { crossrefScientificSearch,europePmcScientificSearch,openAlexScientificSearch,openLibrarySearch } from './publicClients'
import { createGdeltNewsSearch,createYouTubeMetadataSearch,createYouTubeTranscriptSearch } from './mediaClients'
import { BUILTIN_OFFICIAL_TECH_FEEDS,createFeedSearch,parseFeedList } from './feedClients'

export type LiveLearningEnvironment={ [key:string]:string|undefined;COS_LIVE_SOURCES_ENABLED?:string;COS_TECH_RSS_FEEDS?:string;COS_OFFICIAL_DOC_FEEDS?:string;YOUTUBE_API_KEY?:string;YOUTUBE_TRANSCRIPT_API_URL?:string;YOUTUBE_TRANSCRIPT_API_TOKEN?:string;YOUTUBE_TRANSCRIPT_LANGUAGES?:string }
function externalGapOnly(adapter:ContinuousLearningSourceAdapter):ContinuousLearningSourceAdapter{return{kind:adapter.kind,id:adapter.id,async acquire(gap){if(gap.id.startsWith('daily-mining-'))return[];return adapter.acquire(gap)}}}
function transcriptLanguages(value?:string):string[]{const parsed=String(value||'en').split(',').map(item=>item.trim()).filter(Boolean);return parsed.length?parsed.slice(0,8):['en']}
export function createLiveLearningAdapters(env:LiveLearningEnvironment=process.env):ContinuousLearningSourceAdapter[]{
  if(env.COS_LIVE_SOURCES_ENABLED!=='true')return[]
  const configuredTechFeeds=parseFeedList(env.COS_TECH_RSS_FEEDS);const configuredOfficialFeeds=parseFeedList(env.COS_OFFICIAL_DOC_FEEDS);const officialFeeds=[...BUILTIN_OFFICIAL_TECH_FEEDS,...configuredOfficialFeeds]
  const adapters:ContinuousLearningSourceAdapter[]=[scientificLearningConnector(crossrefScientificSearch,2,'crossref'),scientificLearningConnector(openAlexScientificSearch,2,'openalex'),scientificLearningConnector(europePmcScientificSearch,2,'europe_pmc'),libraryLearningConnector(openLibrarySearch,2,'open_library'),newsLearningConnector(createGdeltNewsSearch(),2,'gdelt'),officialDocsLearningConnector(createFeedSearch(officialFeeds),3,'official_docs')]
  if(configuredTechFeeds.length)adapters.push(newsLearningConnector(createFeedSearch(configuredTechFeeds),3,'tech_feeds'))
  if(env.YOUTUBE_API_KEY){if(env.YOUTUBE_TRANSCRIPT_API_URL)adapters.push(youtubeLearningConnector(createYouTubeTranscriptSearch(env.YOUTUBE_API_KEY,{transcriptApiUrl:env.YOUTUBE_TRANSCRIPT_API_URL,transcriptApiToken:env.YOUTUBE_TRANSCRIPT_API_TOKEN,languages:transcriptLanguages(env.YOUTUBE_TRANSCRIPT_LANGUAGES)}),2,'youtube_transcript'));else adapters.push(youtubeLearningConnector(createYouTubeMetadataSearch(env.YOUTUBE_API_KEY),2,'youtube_metadata'))}
  return adapters.map(externalGapOnly)
}
