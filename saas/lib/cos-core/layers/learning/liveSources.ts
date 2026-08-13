import type { ContinuousLearningSourceAdapter } from './cycle'
import { libraryLearningConnector,newsLearningConnector,officialDocsLearningConnector,scientificLearningConnector,youtubeLearningConnector } from './connectors'
import { crossrefScientificSearch,europePmcScientificSearch,openAlexScientificSearch,openLibrarySearch } from './publicClients'
import { createGdeltNewsSearch,createYouTubeMetadataSearch,createYouTubeTranscriptSearch } from './mediaClients'
import { BUILTIN_OFFICIAL_TECH_FEEDS,createFeedSearch,parseFeedList } from './feedClients'

export type LiveLearningEnvironment={ [key:string]:string|undefined;COS_LIVE_SOURCES_ENABLED?:string;COS_TECH_RSS_FEEDS?:string;COS_OFFICIAL_DOC_FEEDS?:string;YOUTUBE_API_KEY?:string;YOUTUBE_TRANSCRIPT_API_URL?:string;YOUTUBE_TRANSCRIPT_API_TOKEN?:string;YOUTUBE_TRANSCRIPT_LANGUAGES?:string;COS_LEARNING_SOURCE_FAILURE_LIMIT?:string;COS_LEARNING_SOURCE_MIN_INTERVAL_MS?:string;LOCAL_AI_BASE_URL?:string;LOCAL_AI_API_KEY?:string }
function externalGapOnly(adapter:ContinuousLearningSourceAdapter):ContinuousLearningSourceAdapter{return{kind:adapter.kind,id:adapter.id,async acquire(gap){if(gap.id.startsWith('daily-mining-'))return[];return adapter.acquire(gap)}}}
function failureLimit(env:LiveLearningEnvironment):number{const value=Number(env.COS_LEARNING_SOURCE_FAILURE_LIMIT||'3');return Number.isFinite(value)?Math.max(1,Math.min(10,Math.round(value))):3}
function delay(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}
function sourceIntervalMs(adapter:ContinuousLearningSourceAdapter,env:LiveLearningEnvironment):number{
  const configured=Number(env.COS_LEARNING_SOURCE_MIN_INTERVAL_MS)
  if(String(env.COS_LEARNING_SOURCE_MIN_INTERVAL_MS??'').trim()&&Number.isFinite(configured))return Math.max(0,Math.min(5000,Math.round(configured)))
  const id=adapter.id??adapter.kind
  if(id.startsWith('youtube_')||id==='gdelt')return 750
  if(id==='crossref')return 250
  return 0
}

/**
 * Keep each provider to one in-flight request stream. The learning cycle deliberately runs several
 * different sources concurrently, but allowing six workers to hit the SAME public API at once was
 * producing large 429 bursts before the old circuit breaker could observe enough failures to open.
 * Queued calls re-check the breaker after earlier calls complete, so once a source reaches the
 * bounded failure limit no already-queued work continues hammering it.
 */
export function guardLearningSourceAdapter(adapter:ContinuousLearningSourceAdapter,limit:number,minIntervalMs=0):ContinuousLearningSourceAdapter{
  let failures=0,open=false,lastStartedAt=0
  let tail:Promise<void>=Promise.resolve()
  const run=async(gap:Parameters<ContinuousLearningSourceAdapter['acquire']>[0])=>{
    if(open)return[]
    const wait=Math.max(0,minIntervalMs-(Date.now()-lastStartedAt))
    if(wait)await delay(wait)
    if(open)return[]
    lastStartedAt=Date.now()
    try{
      const documents=await adapter.acquire(gap)
      failures=0
      return documents
    }catch(error){
      failures+=1
      if(failures>=limit){open=true;console.warn('cosLearning: source circuit opened',{source:adapter.id??adapter.kind,failures,limit})}
      throw error
    }
  }
  return{kind:adapter.kind,id:adapter.id,acquire(gap){const current=tail.then(()=>run(gap),()=>run(gap));tail=current.then(()=>undefined,()=>undefined);return current}}
}
function transcriptLanguages(value?:string):string[]{const parsed=String(value||'en').split(',').map(item=>item.trim()).filter(Boolean);return parsed.length?parsed.slice(0,8):['en']}

/**
 * The RunPod transcript service intentionally runs beside the local reasoner and reuses the same
 * /workspace/cos-api-key. Explicit transcript variables always win. If they are absent, derive the
 * 8888 transcript endpoint only from the exact HTTPS RunPod proxy hostname already trusted for the
 * 11434 reasoner. Never infer from arbitrary hosts.
 */
export function resolveYouTubeTranscriptRuntime(env:LiveLearningEnvironment):{url:string;token?:string;derived:boolean}{
  const explicitUrl=String(env.YOUTUBE_TRANSCRIPT_API_URL||'').trim()
  const explicitToken=String(env.YOUTUBE_TRANSCRIPT_API_TOKEN||'').trim()
  if(explicitUrl)return{url:explicitUrl,token:explicitToken||String(env.LOCAL_AI_API_KEY||'').trim()||undefined,derived:false}

  const base=String(env.LOCAL_AI_BASE_URL||'').trim()
  if(!base)return{url:'',token:undefined,derived:false}
  try{
    const parsed=new URL(base)
    const match=parsed.hostname.match(/^([a-z0-9-]+)-11434\.proxy\.runpod\.net$/i)
    if(parsed.protocol!=='https:'||!match)return{url:'',token:undefined,derived:false}
    parsed.hostname=`${match[1]}-8888.proxy.runpod.net`
    parsed.port=''
    parsed.pathname='/transcript'
    parsed.search=''
    parsed.hash=''
    return{url:parsed.toString(),token:explicitToken||String(env.LOCAL_AI_API_KEY||'').trim()||undefined,derived:true}
  }catch{return{url:'',token:undefined,derived:false}}
}

/**
 * External learning sources are available by default whenever the autonomous-learning
 * cycle calls this factory. COS_LIVE_SOURCES_ENABLED=false remains an explicit emergency
 * kill switch, but a missing variable no longer silently disables every public source.
 */
export function createLiveLearningAdapters(env:LiveLearningEnvironment=process.env):ContinuousLearningSourceAdapter[]{
  if(env.COS_LIVE_SOURCES_ENABLED==='false')return[]
  const configuredTechFeeds=parseFeedList(env.COS_TECH_RSS_FEEDS);const configuredOfficialFeeds=parseFeedList(env.COS_OFFICIAL_DOC_FEEDS);const officialFeeds=[...BUILTIN_OFFICIAL_TECH_FEEDS,...configuredOfficialFeeds]
  const adapters:ContinuousLearningSourceAdapter[]=[scientificLearningConnector(crossrefScientificSearch,2,'crossref'),scientificLearningConnector(openAlexScientificSearch,2,'openalex'),scientificLearningConnector(europePmcScientificSearch,2,'europe_pmc'),libraryLearningConnector(openLibrarySearch,2,'open_library'),newsLearningConnector(createGdeltNewsSearch(),2,'gdelt'),officialDocsLearningConnector(createFeedSearch(officialFeeds,fetch,{fullText:true}),3,'official_docs')]
  if(configuredTechFeeds.length)adapters.push(newsLearningConnector(createFeedSearch(configuredTechFeeds),3,'tech_feeds'))
  if(env.YOUTUBE_API_KEY){
    const transcript=resolveYouTubeTranscriptRuntime(env)
    if(transcript.url){
      adapters.push(youtubeLearningConnector(createYouTubeTranscriptSearch(env.YOUTUBE_API_KEY,{transcriptApiUrl:transcript.url,transcriptApiToken:transcript.token,languages:transcriptLanguages(env.YOUTUBE_TRANSCRIPT_LANGUAGES),metadataFallback:true}),2,transcript.derived?'youtube_transcript_runpod':'youtube_transcript'))
    }else{
      adapters.push(youtubeLearningConnector(createYouTubeMetadataSearch(env.YOUTUBE_API_KEY),2,'youtube_metadata'))
    }
  }
  const limit=failureLimit(env)
  return adapters.map(externalGapOnly).map(adapter=>guardLearningSourceAdapter(adapter,limit,sourceIntervalMs(adapter,env)))
}
